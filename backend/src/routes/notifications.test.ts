import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import * as webpush from "web-push";
import { createApp } from "../app.js";
import { NotificationService } from "../services/notificationService.js";
import { registerSocketServer, getSocketServer } from "../socket.js";
import { isWithinQuietHours } from "../services/push.js";
import { getVapidPublicKey, setWebPushSender, WebPushProvider } from "../services/PushService.js";

test("Next-Gen Notification System Verification Suite", async (t) => {
  const origFetch = globalThis.fetch;
  // 1. Socket Server Registration & Retrieval
  await t.test("registerSocketServer & getSocketServer lifecycle", () => {
    let emittedEvent: any = null;
    let targetRoom: string | null = null;

    const mockIo: any = {
      to: (room: string) => {
        targetRoom = room;
        return {
          emit: (evt: string, payload: any) => {
            emittedEvent = { evt, payload };
          },
        };
      },
    };

    registerSocketServer(mockIo);
    const retrieved = getSocketServer();
    assert.strictEqual(retrieved, mockIo);

    // Test real-time in-app socket emission
    retrieved!.to("user:test-user-123").emit("notification:new", {
      id: "notif-1",
      title: "Test Alert",
      body: "Test Body",
    });

    assert.strictEqual(targetRoom, "user:test-user-123");
    assert.strictEqual(emittedEvent.evt, "notification:new");
    assert.strictEqual(emittedEvent.payload.title, "Test Alert");
  });

  // 2. Quiet Hours Calculation
  await t.test("Quiet Hours calculation logic", () => {
    const nightDate = new Date("2026-10-01T23:30:00Z");
    const dayDate = new Date("2026-10-01T14:30:00Z");

    assert.strictEqual(isWithinQuietHours(nightDate, "22:00", "07:00", "UTC"), true);
    assert.strictEqual(isWithinQuietHours(dayDate, "22:00", "07:00", "UTC"), false);
    // Disabled when start === end
    assert.strictEqual(isWithinQuietHours(nightDate, "22:00", "22:00", "UTC"), false);
  });

  // 3. Notification URL Auto-Generation & Event Validation
  await t.test("NotificationService computes correct deep links and categories", async () => {
    let socketDispatched: any = null;
    let socketTarget: string | null = null;

    const mockIo: any = {
      to: (room: string) => {
        socketTarget = room;
        return {
          emit: (event: string, payload: any) => {
            socketDispatched = { event, payload };
          },
        };
      },
    };
    registerSocketServer(mockIo);

    globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: "mock-notif" }] }), { status: 200, headers: { "content-type": "application/json" } })) as any;

    // Dispatch a booking notification
    const res = await NotificationService.dispatch({
      userId: "user-target-456",
      type: "BOOKING_REQUESTED",
      title: "New Tutoring Request 📅",
      body: "Someone requested a session with you.",
      entityType: "booking",
      entityId: "book-123",
      data: { bookingId: "book-123" },
    });

    // Verify socket emission occurred
    assert.strictEqual(socketTarget, "user:user-target-456");
    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.event, "notification:new");
    assert.strictEqual(socketDispatched.payload.kind, "teaching");
    assert.strictEqual(socketDispatched.payload.title, "New Tutoring Request 📅");
    assert.strictEqual(socketDispatched.payload.data.url, "/schedule");
  });

  await t.test("NotificationService computes correct room and club deep links", async () => {
    let socketDispatched: any = null;

    const mockIo: any = {
      to: () => ({
        emit: (event: string, payload: any) => {
          socketDispatched = { event, payload };
        },
      }),
    };
    registerSocketServer(mockIo);

    // Dispatch a room notification
    await NotificationService.dispatch({
      userId: "user-member-789",
      type: "ROOM_SESSION_LIVE",
      title: "Live Session Started 🔴",
      body: "Live study session happening now.",
      entityType: "room",
      entityId: "room-abc",
    });

    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.payload.kind, "sessions");
    assert.strictEqual(socketDispatched.payload.data.url, "/room/room-abc");

    // Dispatch a club notification
    await NotificationService.dispatch({
      userId: "user-member-789",
      type: "CLUB_ANNOUNCEMENT",
      title: "Club Update 📢",
      body: "Meeting tomorrow at 4pm.",
      entityType: "club",
      entityId: "club-xyz",
    });

    // Dispatch ROOM_LIVE_OPEN_STARTED notification
    await NotificationService.dispatch({
      userId: "user-member-789",
      type: "ROOM_LIVE_OPEN_STARTED",
      title: "Live Audio Room Started 🎙️",
      body: "An open audio session started.",
      priority: "high",
      entityType: "room",
      entityId: "room-abc",
      data: { roomId: "room-abc", openSessionId: "open-123", media: "audio" },
    });

    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.payload.kind, "rooms");
    assert.strictEqual(socketDispatched.payload.priority, "high");
    assert.strictEqual(socketDispatched.payload.data.url, "/room/room-abc");

    // Dispatch ROOM_STUDY_STARTED notification
    await NotificationService.dispatch({
      userId: "user-member-789",
      type: "ROOM_STUDY_STARTED",
      title: "Study Session Started 🎓",
      body: "Exam prep has started.",
      priority: "high",
      entityType: "room",
      entityId: "room-abc",
      data: { roomId: "room-abc", studySessionId: "study-123" },
    });

    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.payload.kind, "sessions");
    assert.strictEqual(socketDispatched.payload.priority, "high");
    assert.strictEqual(socketDispatched.payload.data.url, "/room/room-abc");

    // Dispatch ROOM_STUDY_PERMISSION_GRANTED notification
    await NotificationService.dispatch({
      userId: "user-member-789",
      type: "ROOM_STUDY_PERMISSION_GRANTED",
      title: "Study Permission Granted 🎓",
      body: "You can now host study sessions.",
      entityType: "room",
      entityId: "room-abc",
      data: { roomId: "room-abc" },
    });

    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.payload.kind, "rooms");
    assert.strictEqual(socketDispatched.payload.data.url, "/room/room-abc");

    globalThis.fetch = origFetch;
  });

  // 4. Web Push Protocol and VAPID Endpoints
  await t.test("GET /api/v1/notifications/vapid-public-key returns configured VAPID key", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/notifications/vapid-public-key");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.publicKey);
    assert.strictEqual(typeof res.body.publicKey, "string");
    assert.strictEqual(res.body.publicKey, getVapidPublicKey());
  });

  await t.test("POST /api/v1/notifications/devices accepts standards-compliant Web Push subscription JSON", async () => {
    const { admin: activeAdmin, setAdminClient } = await import("../lib/db.js");
    const origAdmin = activeAdmin;

    const mockChain: any = {
      upsert: () => mockChain,
      select: () => mockChain,
      single: async () => ({
        data: {
          token_fingerprint: "mock_fp_1234567890",
          platform: "web",
          provider: "web",
        },
        error: null,
      }),
    };

    const mockAdmin: any = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-target-456", role: "authenticated" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "device_tokens") return mockChain;
        if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { roles: ["student"], account_status: "active" }, error: null }) }) }) };
        if (table === "admin_accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        return mockChain;
      },
    };

    setAdminClient(mockAdmin);

    try {
      const app = createApp();
      const mockSubscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-web-push-client-token-with-large-payload-length-testing-w3c-standard-rfc8292",
        expirationTime: null,
        keys: {
          p256dh: "BMs5...mock_p256dh_key_with_length_greater_than_normal...",
          auth: "mock_auth_secret_token",
        },
      };
      const subscriptionString = JSON.stringify(mockSubscription);

      const res = await request(app)
        .post("/api/v1/notifications/devices")
        .set("Authorization", "Bearer valid_mock_token")
        .send({
          token: subscriptionString,
          platform: "web",
          provider: "web",
          device_id: "web_browser_client_123",
          app_version: "2.0.10",
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body);
    } finally {
      setAdminClient(origAdmin);
    }
  });

  await t.test("WebPushProvider dispatches notification to registered web subscription", async () => {
    const { admin: mockAdmin } = await import("../lib/db.js");
    const origFrom = mockAdmin.from;

    let invoked = false;
    let sentPayload: any = null;
    setWebPushSender((async (_sub: any, payload: any) => {
      invoked = true;
      sentPayload = JSON.parse(payload);
      return { statusCode: 201 };
    }) as any);

    const testSubscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: { p256dh: "test_p256dh", auth: "test_auth" },
    };

    const mockTokensChain: any = {
      select: () => mockTokensChain,
      eq: () => mockTokensChain,
      or: () => Promise.resolve({
        data: [{ token: JSON.stringify(testSubscription) }],
        error: null,
      }),
    };

    mockAdmin.from = ((table: string) => {
      if (table === "device_tokens") return mockTokensChain;
      return origFrom.call(mockAdmin, table);
    }) as any;

    try {
      const provider = new WebPushProvider();
      await provider.sendNotification("user-target-456", {
        title: "Web Test Alert",
        body: "Hello Web Push",
        data: { url: "/feed" },
        priority: "high",
      });
      assert.strictEqual(invoked, true);
      assert.strictEqual(sentPayload.title, "Web Test Alert");
      assert.strictEqual(sentPayload.body, "Hello Web Push");
      assert.strictEqual(sentPayload.data.url, "/feed");
      assert.strictEqual(sentPayload.requireInteraction, true);
    } finally {
      mockAdmin.from = origFrom;
      const wp = await import("web-push");
      setWebPushSender(wp.sendNotification);
    }
  });
});
