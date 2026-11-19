import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";

test("LiveKit Integration Tests", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // user
  const SESSION_ID = "55555555-5555-4555-8555-555555555555";
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  
  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
      or: () => chain,
      match: () => chain,
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("POST /live/token/:sessionId - validates role correctly and returns token with metadata", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, status: "scheduled", teacher_id: USER_A });
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "profiles") return createMockChain({ full_name: "Test Teacher", username: "testteacher" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/live/token/${SESSION_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.canPublish, true);
    assert.strictEqual(res.body.isHost, true);
    assert.strictEqual(res.body.url, env.LIVEKIT_URL);
    assert.strictEqual(res.body.participantName, "Test Teacher");
    assert.strictEqual(res.body.sessionId, SESSION_ID);
    assert.ok(res.body.token);
  });

  await t.test("POST /live/token/:sessionId - supports qa-stage- prefixed UUIDs", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, status: "scheduled", teacher_id: USER_A });
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "profiles") return createMockChain({ full_name: "Test Teacher", username: "testteacher" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/live/token/qa-stage-${SESSION_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.canPublish, true);
    assert.strictEqual(res.body.sessionId, SESSION_ID);
    assert.ok(res.body.token);
  });

  await t.test("POST /live/token/:sessionId - returns 400 for invalid non-UUID sessionId", async () => {
    const res = await request(app)
      .post("/api/v1/live/token/not-a-valid-uuid")
      .set(authHeader);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, "INVALID_SESSION_ID");
  });

  await t.test("Host Controls - rejects unauthorized user", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, status: "live", teacher_id: "other-teacher" });
      if (table === "room_members") return createMockChain({ role: "member" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/live/rooms/${SESSION_ID}/mute-all`)
      .set(authHeader);

    assert.strictEqual(res.status, 403);
  });

  await t.test("Host Controls - allows authorized host to end session", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, status: "live", teacher_id: USER_A });
      if (table === "room_members") return createMockChain({ role: "owner" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/live/rooms/${SESSION_ID}/end`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, "completed");
  });

  await t.test("POST /webhooks/live - rejects missing raw body", async () => {
    const res = await request(app).post("/webhooks/live");
    assert.strictEqual(res.status, 400);
  });

  await t.test("GET /live/workshops - returns live, upcoming, and recording workshops", async () => {
    mockAdmin.from = (table?: string) => {
      return createMockChain([]);
    };

    const res = await request(app)
      .get("/api/v1/live/workshops")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.liveNow));
    assert.ok(Array.isArray(res.body.upcoming));
    assert.ok(Array.isArray(res.body.recordings));
    assert.ok(res.body.stats);
    assert.ok(res.body.liveNow.length > 0);
  });

  await t.test("POST /live/workshops - schedules a new workshop", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") return createMockChain({ id: ROOM_ID });
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, title: "Test Workshop", status: "scheduled" });
      if (table === "session_participants") return createMockChain();
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/live/workshops")
      .set(authHeader)
      .send({
        title: "Advanced System Design Workshop",
        description: "Deep dive into scalable cloud systems",
        topic: "Computer Science",
        category: "coding",
        media: "video",
        startNow: false,
        durationMinutes: 60,
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.isLive, false);
    assert.ok(res.body.session);
  });

  await t.test("POST & DELETE /live/workshops/:sessionId/rsvp - toggles RSVP confirmation", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "session_participants") return createMockChain();
      return createMockChain();
    };

    const rsvpRes = await request(app)
      .post(`/api/v1/live/workshops/${SESSION_ID}/rsvp`)
      .set(authHeader);

    assert.strictEqual(rsvpRes.status, 200);
    assert.strictEqual(rsvpRes.body.success, true);
    assert.strictEqual(rsvpRes.body.rsvp, true);

    const cancelRes = await request(app)
      .delete(`/api/v1/live/workshops/${SESSION_ID}/rsvp`)
      .set(authHeader);

    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.success, true);
    assert.strictEqual(cancelRes.body.rsvp, false);
  });
});
