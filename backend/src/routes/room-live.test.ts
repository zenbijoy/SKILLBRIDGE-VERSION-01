import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";

test("Room Live & Open Sessions API Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // Room Owner / Host
  const USER_B = "22222222-2222-4222-8222-222222222222"; // Member
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  const OPEN_SESSION_ID = "44444444-4444-4444-8444-444444444444";
  const STUDY_SESSION_ID = "55555555-5555-4555-8555-555555555555";

  let activeUserId = USER_A;

  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      not: () => chain,
      is: () => chain,
      lte: () => chain,
      gte: () => chain,
      gt: () => chain,
      lt: () => chain,
      limit: () => chain,
      order: () => chain,
      range: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
      or: () => chain,
      match: () => chain,
    };
    return chain;
  };

  const mockAdmin: any = {
    from: (_table?: string) => createMockChain(),
    rpc: async (func: string, params: any) => {
      if (func === "start_open_session_atomic") {
        return {
          data: {
            session_id: OPEN_SESSION_ID,
            room_id: params.p_room_id,
            media: params.p_media || "audio",
            status: "live",
            host_id: params.p_user_id,
            started_by: params.p_user_id,
            livekit_room: `skillbridge-open-${OPEN_SESSION_ID}`,
            started_at: new Date().toISOString(),
            already_live: false,
          },
          error: null,
        };
      }
      if (func === "leave_open_session_atomic") {
        return {
          data: {
            host_transferred: true,
            new_host_id: USER_B,
            remaining_participants: 1,
          },
          error: null,
        };
      }
      if (func === "join_open_session_atomic") {
        return { data: { success: true }, error: null };
      }
      if (func === "start_study_session_atomic") {
        return {
          data: {
            session_id: STUDY_SESSION_ID,
            room_id: params.p_room_id,
            title: params.p_title,
            media: params.p_media,
            status: "live",
            teacher_id: params.p_user_id,
            ended_open_sessions: [{ session_id: OPEN_SESSION_ID, livekit_room: `skillbridge-open-${OPEN_SESSION_ID}` }],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: activeUserId, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("GET /api/v1/rooms/:id/live/status - rejects unauthenticated requests", async () => {
    const res = await request(app).get(`/api/v1/rooms/${ROOM_ID}/live/status`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/live/status - returns comprehensive live session status for member", async () => {
    activeUserId = USER_A;
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "owner" });
      }
      if (table === "room_open_sessions") {
        return createMockChain(null); // No open session running
      }
      if (table === "sessions") {
        return createMockChain([]); // No study session
      }
      return createMockChain();
    };

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/live/status`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.openSession, null);
    assert.strictEqual(res.body.studySession, null);
    assert.strictEqual(res.body.studyWindow.active, false);
    assert.strictEqual(res.body.me.canStartOpen, true);
    assert.strictEqual(res.body.me.canStartStudy, true);
  });

  await t.test("POST /api/v1/rooms/:id/live/open - rejects non-member", async () => {
    activeUserId = USER_B;
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "private", knock_mode_enabled: true });
      }
      if (table === "room_members") {
        return createMockChain(null); // Not a member
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/live/open`)
      .set(authHeader)
      .send({ media: "audio" });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "MEMBERSHIP_REQUIRED");
  });

  await t.test("POST /api/v1/rooms/:id/live/open - starts open session and returns LiveKit token", async () => {
    activeUserId = USER_A;
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "owner" });
      }
      if (table === "profiles") {
        return createMockChain({ full_name: "Owner User", username: "owner" });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/live/open`)
      .set(authHeader)
      .send({ media: "audio" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.session.id, OPEN_SESSION_ID);
    assert.strictEqual(res.body.media, "audio");
    assert.strictEqual(res.body.isHost, true);
    assert.ok(res.body.token.length > 20);
    assert.strictEqual(res.body.roomName, `skillbridge-open-${OPEN_SESSION_ID}`);
  });

  await t.test("POST /api/v1/rooms/:id/live/open - returns 409 when study session is active (SB004)", async () => {
    activeUserId = USER_A;
    const originalRpc = mockAdmin.rpc;
    mockAdmin.rpc = async (func: string, params: any) => {
      if (func === "start_open_session_atomic") {
        return { data: null, error: { message: "SB004: Cannot start open session: a study session is currently live" } };
      }
      return originalRpc(func, params);
    };

    try {
      const res = await request(app)
        .post(`/api/v1/rooms/${ROOM_ID}/live/open`)
        .set(authHeader)
        .send({ media: "video" });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.code, "STUDY_SESSION_ACTIVE");
    } finally {
      mockAdmin.rpc = originalRpc;
    }
  });

  await t.test("POST /api/v1/rooms/:id/live/:sessionId/token - mints fresh token for existing open session", async () => {
    activeUserId = USER_B;
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "member" });
      }
      if (table === "room_open_sessions") {
        return createMockChain({
          id: OPEN_SESSION_ID,
          room_id: ROOM_ID,
          media: "audio",
          status: "live",
          host_id: USER_A,
          livekit_room: `skillbridge-open-${OPEN_SESSION_ID}`,
        });
      }
      if (table === "profiles") {
        return createMockChain({ full_name: "Member B", username: "memberb" });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/live/${OPEN_SESSION_ID}/token`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.kind, "open");
    assert.strictEqual(res.body.sessionId, OPEN_SESSION_ID);
    assert.strictEqual(res.body.isHost, false);
    assert.ok(res.body.token.length > 20);
  });

  await t.test("POST /api/v1/rooms/:id/live/:sessionId/leave - records participant leave", async () => {
    activeUserId = USER_A;
    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/live/${OPEN_SESSION_ID}/leave`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.host_transferred, true);
    assert.strictEqual(res.body.new_host_id, USER_B);
  });

  await t.test("POST /api/v1/rooms/:id/study-sessions - rejects non-permitted user", async () => {
    activeUserId = USER_B;
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "member" });
      }
      if (table === "room_study_permissions") {
        return createMockChain(null); // No permission granted
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/study-sessions`)
      .set(authHeader)
      .send({ title: "Calculus Exam Review", media: "video", startNow: false });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "PERMISSION_DENIED");
  });

  await t.test("PUT /api/v1/rooms/:id/study-permissions/:targetUserId - owner grants permission", async () => {
    activeUserId = USER_A; // Owner
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "owner" });
      }
      if (table === "room_study_permissions") {
        return createMockChain({ room_id: ROOM_ID, user_id: USER_B, granted_by: USER_A });
      }
      return createMockChain();
    };

    const res = await request(app)
      .put(`/api/v1/rooms/${ROOM_ID}/study-permissions/${USER_B}`)
      .set(authHeader)
      .send({ expiresAt: null });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await t.test("POST /api/v1/rooms/:id/study-sessions - permitted user creates session with startNow=true", async () => {
    activeUserId = USER_B; // Now permitted
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_A, visibility: "public", knock_mode_enabled: false });
      }
      if (table === "room_members") {
        return createMockChain({ role: "member" });
      }
      if (table === "room_study_permissions") {
        return createMockChain({ room_id: ROOM_ID, user_id: USER_B, expires_at: null });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/study-sessions`)
      .set(authHeader)
      .send({ title: "Peer Study Sprint", media: "video", startNow: true });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.session.session_id, STUDY_SESSION_ID);
    assert.strictEqual(res.body.session.status, "live");
  });
});
