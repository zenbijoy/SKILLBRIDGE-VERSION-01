import { useEffect } from "react";
import { useRouter } from "expo-router";
import { api } from "./api";
import { getSocket } from "./socket";

const WEB_DEVICE_FP_KEY = "@skillbridge_web_push_device_fingerprint";
const WEB_TOKEN_FP_KEY = "@skillbridge_web_push_token_fingerprint";

export const FALLBACK_VAPID_PUBLIC_KEY =
  "BJfp0fcWglvLTUaqXICJR5WMn_WgxEvPfurRCHFc7WlQfkLgDwuftq4Jee7OfnRHvjliYFt-Nms_dG5RlRMyL4c";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getBrowserFingerprint(): string {
  if (typeof window === "undefined") return "web_client_ssr";
  let fp = window.localStorage.getItem(WEB_DEVICE_FP_KEY);
  if (!fp) {
    fp = `web_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    window.localStorage.setItem(WEB_DEVICE_FP_KEY, fp);
  }
  return fp;
}

export async function computeSha256Fingerprint(token: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(token);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback
    }
  }
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, "0");
}

export async function getVapidPublicKey(): Promise<string> {
  const envKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }

  try {
    const res = await api<{ publicKey: string }>("/notifications/vapid-public-key");
    if (res?.publicKey) {
      return res.publicKey;
    }
  } catch {
    // Backend unreachable or offline
  }

  return FALLBACK_VAPID_PUBLIC_KEY;
}

export async function registerPush(): Promise<string | null> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  try {
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }

    if (perm !== "granted") {
      return null;
    }

    // Register standards-compliant Service Worker (sw.js)
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    if (!("pushManager" in registration)) {
      console.warn("[Web Notification] PushManager not supported in service worker registration");
      return null;
    }

    // Retrieve VAPID public key
    const vapidKey = await getVapidPublicKey();
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    // Retrieve existing subscription or create new W3C PushSubscription
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    const browserId = getBrowserFingerprint();
    const subscriptionToken = JSON.stringify(subscription);

    // Register actual VAPID Web Push subscription token with backend
    const res = await api<{ token_fingerprint?: string }>("/notifications/devices", {
      method: "POST",
      body: JSON.stringify({
        token: subscriptionToken,
        platform: "web",
        provider: "web",
        device_id: browserId,
        app_version: "2.0.10",
      }),
    });

    const tokenFp = res?.token_fingerprint || (await computeSha256Fingerprint(subscriptionToken));
    window.localStorage.setItem(WEB_TOKEN_FP_KEY, tokenFp);

    return browserId;
  } catch (error) {
    console.warn("[Web Notification] Registration error:", error);
    return null;
  }
}

export async function unregisterPush(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (registration && "pushManager" in registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
    }

    const tokenFp = window.localStorage.getItem(WEB_TOKEN_FP_KEY);
    if (tokenFp) {
      await api(`/notifications/devices/${tokenFp}`, { method: "DELETE" }).catch(() => {});
      window.localStorage.removeItem(WEB_TOKEN_FP_KEY);
    }

    window.localStorage.removeItem(WEB_DEVICE_FP_KEY);
  } catch (err) {
    console.warn("Could not unregister web push:", err);
  }
}

export async function showWebNotification(
  title: string,
  options?: NotificationOptions & { url?: string },
  onClick?: () => void,
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const notifOptions: NotificationOptions & { url?: string } = {
    icon: "/favicon.png",
    badge: "/favicon.png",
    ...options,
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notifOptions);
        return;
      }
    }
  } catch {
    // Fall back to window.Notification constructor
  }

  try {
    const notification = new Notification(title, notifOptions);
    notification.onclick = () => {
      window.focus();
      if (onClick) onClick();
      else if (options?.url) {
        window.location.href = options.url;
      }
      notification.close();
    };
  } catch (err) {
    console.warn("Could not display browser notification:", err);
  }
}

export function useNotificationRouting(router: ReturnType<typeof useRouter>) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const socket = getSocket();
    if (!socket) return;

    const handleIncomingCall = (data: { callerName: string; callId: string; type: string }) => {
      if (document.hidden) {
        void showWebNotification(
          `Incoming ${data.type === "video" ? "Video" : "Audio"} Call`,
          {
            body: `${data.callerName} is calling you on SkillBridge`,
            tag: `call_${data.callId}`,
            url: `/call/${data.callId}?callId=${data.callId}`,
          },
          () => router.push(`/call/${data.callId}?callId=${data.callId}` as any),
        );
      }
    };

    const handleNewMessage = (data: { senderName?: string; conversationId?: string; preview?: string }) => {
      if (document.hidden && data.conversationId) {
        void showWebNotification(
          data.senderName ? `Message from ${data.senderName}` : "New Message",
          {
            body: data.preview || "You have a new message on SkillBridge",
            tag: `chat_${data.conversationId}`,
            url: `/chat/${data.conversationId}`,
          },
          () => router.push(`/chat/${data.conversationId}` as any),
        );
      }
    };

    const handleNewNotification = (data: { title?: string; body?: string; data?: any }) => {
      if (document.hidden) {
        const notifData = data.data || {};
        const targetUrl = notifData.url || (
          notifData.roomId ? `/room/${notifData.roomId}` :
          notifData.clubId ? `/club/${notifData.clubId}` :
          notifData.conversationId ? `/chat/${notifData.conversationId}` :
          notifData.bookingId ? `/schedule` :
          notifData.postId ? `/feed` :
          "/notifications"
        );
        void showWebNotification(
          data.title || "SkillBridge Notification",
          {
            body: data.body || "You have a new notification",
            tag: `notif_${Date.now()}`,
            url: targetUrl,
          },
          () => router.push(targetUrl as any),
        );
      }
    };

    socket.on("call:incoming", handleIncomingCall);
    socket.on("chat:message", handleNewMessage);
    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
      socket.off("chat:message", handleNewMessage);
      socket.off("notification:new", handleNewNotification);
    };
  }, [router]);
}
