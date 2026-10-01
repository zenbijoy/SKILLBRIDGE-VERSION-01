import test from "node:test";
import assert from "node:assert";
import { NotificationService } from "../services/notificationService.js";
import { registerSocketServer, getSocketServer } from "../socket.js";
import { isWithinQuietHours } from "../services/push.js";

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

    assert.ok(socketDispatched);
    assert.strictEqual(socketDispatched.payload.kind, "system");
    assert.strictEqual(socketDispatched.payload.data.url, "/club/club-xyz");

    globalThis.fetch = origFetch;
  });
});
