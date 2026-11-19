import {
  urlBase64ToUint8Array,
  getBrowserFingerprint,
  computeSha256Fingerprint,
  getVapidPublicKey,
  registerPush,
  unregisterPush,
  showWebNotification,
  FALLBACK_VAPID_PUBLIC_KEY,
} from "./notifications.web";
import { api } from "./api";

jest.mock("./api", () => ({
  api: jest.fn(),
}));

describe("Web Push Notifications Protocol Suite", () => {
  const originalWindow = (global as any).window;
  const originalNotification = (global as any).Notification;
  const originalNavigator = (global as any).navigator;
  const originalLocalStorage = (global as any).localStorage;

  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    storageMap.clear();
    (global as any).Notification = undefined;
    (global as any).navigator = {};
    (global as any).localStorage = mockLocalStorage;
    (global as any).window = {
      localStorage: mockLocalStorage,
      atob: (str: string) => Buffer.from(str, "base64").toString("binary"),
      crypto: {
        subtle: {
          digest: async (_algo: string, data: Uint8Array) => {
            const hex = Buffer.from(data).toString("hex").padEnd(64, "0").slice(0, 64);
            const buf = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
              buf[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
            }
            return buf.buffer;
          },
        },
      },
    };
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    (global as any).Notification = originalNotification;
    (global as any).navigator = originalNavigator;
    (global as any).localStorage = originalLocalStorage;
  });

  describe("Base64 URL & Crypto Utilities", () => {
    it("converts URL-safe Base64 string to Uint8Array properly", () => {
      const base64 = "BMs5_w-A";
      const u8 = urlBase64ToUint8Array(base64);
      expect(u8).toBeInstanceOf(Uint8Array);
      expect(u8.length).toBeGreaterThan(0);
    });

    it("generates a stable browser fingerprint in localStorage", () => {
      const fp1 = getBrowserFingerprint();
      const fp2 = getBrowserFingerprint();
      expect(fp1).toBe(fp2);
      expect(fp1.startsWith("web_")).toBe(true);
    });

    it("computes SHA-256 fingerprint as 64-char hex string", async () => {
      const hash = await computeSha256Fingerprint("test_subscription_token_payload");
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });

    it("returns VAPID public key from backend or fallback", async () => {
      (api as jest.Mock).mockResolvedValueOnce({ publicKey: "custom_server_vapid_key" });
      const key = await getVapidPublicKey();
      expect(key).toBe("custom_server_vapid_key");

      (api as jest.Mock).mockRejectedValueOnce(new Error("offline"));
      const fallbackKey = await getVapidPublicKey();
      expect(fallbackKey).toBe(FALLBACK_VAPID_PUBLIC_KEY);
    });
  });

  describe("registerPush Lifecycle", () => {
    it("returns null gracefully if serviceWorker or Notification API is unsupported", async () => {
      // Notification missing
      const result = await registerPush();
      expect(result).toBeNull();
    });

    it("returns null if notification permission is not granted", async () => {
      const mockNotif = {
        permission: "denied",
        requestPermission: jest.fn().mockResolvedValue("denied"),
      };
      (global as any).Notification = mockNotif;
      (global as any).window.Notification = mockNotif;
      (global as any).navigator = {
        serviceWorker: {
          register: jest.fn(),
          ready: Promise.resolve(),
        },
      };

      const result = await registerPush();
      expect(result).toBeNull();
    });

    it("registers sw.js, subscribes via VAPID and sends PushSubscription to backend", async () => {
      const mockSubscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/sample-subscription-token",
        keys: { p256dh: "key1", auth: "auth1" },
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/sample-subscription-token",
          keys: { p256dh: "key1", auth: "auth1" },
        }),
      };

      const mockPushManager = {
        getSubscription: jest.fn().mockResolvedValue(null),
        subscribe: jest.fn().mockResolvedValue(mockSubscription),
      };

      const mockRegistration = {
        pushManager: mockPushManager,
      };

      const mockNotif = {
        permission: "granted",
        requestPermission: jest.fn().mockResolvedValue("granted"),
      };
      (global as any).Notification = mockNotif;
      (global as any).window.Notification = mockNotif;

      (global as any).navigator = {
        serviceWorker: {
          register: jest.fn().mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
        },
      };

      (api as jest.Mock).mockResolvedValueOnce({ publicKey: FALLBACK_VAPID_PUBLIC_KEY });
      (api as jest.Mock).mockResolvedValueOnce({ token_fingerprint: "abc123hex" });

      const browserId = await registerPush();
      expect(browserId).toBeTruthy();
      expect((global as any).navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(mockPushManager.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          userVisibleOnly: true,
          applicationServerKey: expect.any(Uint8Array),
        })
      );

      expect(api).toHaveBeenCalledWith(
        "/notifications/devices",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("https://fcm.googleapis.com/fcm/send/sample-subscription-token"),
        })
      );
    });
  });

  describe("unregisterPush Lifecycle", () => {
    it("unsubscribes pushManager and deletes device token from backend", async () => {
      const mockUnsubscribe = jest.fn().mockResolvedValue(true);
      const mockPushManager = {
        getSubscription: jest.fn().mockResolvedValue({
          unsubscribe: mockUnsubscribe,
        }),
      };
      const mockRegistration = {
        pushManager: mockPushManager,
      };

      (global as any).navigator = {
        serviceWorker: {
          getRegistration: jest.fn().mockResolvedValue(mockRegistration),
        },
      };

      mockLocalStorage.setItem("@skillbridge_web_push_token_fingerprint", "deadbeef64");
      mockLocalStorage.setItem("@skillbridge_web_push_device_fingerprint", "web_123");

      (api as jest.Mock).mockResolvedValueOnce({ success: true });

      await unregisterPush();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(api).toHaveBeenCalledWith("/notifications/devices/deadbeef64", { method: "DELETE" });
      expect(mockLocalStorage.getItem("@skillbridge_web_push_token_fingerprint")).toBeNull();
      expect(mockLocalStorage.getItem("@skillbridge_web_push_device_fingerprint")).toBeNull();
    });
  });

  describe("showWebNotification", () => {
    it("calls serviceWorker registration showNotification if available", async () => {
      const showNotificationMock = jest.fn().mockResolvedValue(undefined);
      const mockNotif = {
        permission: "granted",
      };
      (global as any).Notification = mockNotif;
      (global as any).window.Notification = mockNotif;
      (global as any).navigator = {
        serviceWorker: {
          ready: Promise.resolve({
            showNotification: showNotificationMock,
          }),
        },
      };

      await showWebNotification("Test Title", { body: "Test Body" });
      expect(showNotificationMock).toHaveBeenCalledWith(
        "Test Title",
        expect.objectContaining({ body: "Test Body", icon: "/favicon.png" })
      );
    });
  });
});
