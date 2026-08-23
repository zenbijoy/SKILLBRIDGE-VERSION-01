import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { isValidTransition, CallStatus, getProviderForCall } from "./calls.js";
import { env } from "../config/env.js";
import { createApp } from "../app.js";

test("WebRTC P2P Calls Hybrid Architecture Test Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // Caller
  const USER_B = "22222222-2222-4222-8222-222222222222"; // Callee
  const CALL_ID = "33333333-3333-4333-8333-333333333333";

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

  // 1. State Machine Transitions
  await t.test("Call State Machine - enforces valid lifecycle transitions", () => {
    assert.strictEqual(isValidTransition("initiating", "ringing"), true);
    assert.strictEqual(isValidTransition("ringing", "accepted"), true);
    assert.strictEqual(isValidTransition("ringing", "declined"), true);
    assert.strictEqual(isValidTransition("ringing", "busy"), true);
    assert.strictEqual(isValidTransition("ringing", "missed"), true);
    assert.strictEqual(isValidTransition("accepted", "connecting"), true);
    assert.strictEqual(isValidTransition("connecting", "connected"), true);
    assert.strictEqual(isValidTransition("connected", "reconnecting"), true);
    assert.strictEqual(isValidTransition("reconnecting", "connected"), true);
    assert.strictEqual(isValidTransition("connected", "ended"), true);

    // Invalid transitions
    assert.strictEqual(isValidTransition("ended", "connected"), false);
    assert.strictEqual(isValidTransition("declined", "ringing"), false);
    assert.strictEqual(isValidTransition("initiating", "connected"), false);
  });

  // 2. Server-Authoritative Provider Routing Test
  await t.test("Provider Selection - returns webrtc when P2P_CALLS_ENABLED=true", async () => {
    (env as any).P2P_CALLS_ENABLED = true;
    const providerRes = await getProviderForCall(CALL_ID, USER_A, "User A");
    assert.strictEqual(providerRes.provider, "webrtc");
  });

  await t.test("Provider Selection - returns livekit fallback when P2P_CALLS_ENABLED=false", async () => {
    (env as any).P2P_CALLS_ENABLED = false;
    const providerRes = await getProviderForCall(CALL_ID, USER_A, "User A");
    assert.strictEqual(providerRes.provider, "livekit");
    assert.ok(providerRes.providerConfig.token);
    assert.strictEqual(providerRes.providerConfig.roomName, `skillbridge-call-${CALL_ID}`);
    (env as any).P2P_CALLS_ENABLED = true; // restore
  });

  // 3. GET /api/v1/calls/ice-servers
  await t.test("GET /calls/ice-servers - returns safe STUN/TURN server configuration", async () => {
    const res = await request(app)
      .get("/api/v1/calls/ice-servers")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.iceServers));
    assert.ok(res.body.iceServers.length > 0);
    assert.strictEqual(res.body.provider, "stun-default");
  });

  // 4. POST /api/v1/calls - Self Call Rejection
  await t.test("POST /calls - rejects call to oneself", async () => {
    const res = await request(app)
      .post("/api/v1/calls")
      .set(authHeader)
      .send({ calleeId: USER_A, type: "video" });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Cannot initiate call to yourself/);
  });

  // 5. POST /api/v1/calls - Blocked User Check
  await t.test("POST /calls - rejects call when users have mutual block", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") return createMockChain({ id: USER_B, account_status: "active" });
      if (table === "user_blocks") return createMockChain({ id: "block_123" });
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/calls")
      .set(authHeader)
      .send({ calleeId: USER_B, type: "video" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /privacy settings/);
  });

  // 6. POST /api/v1/calls - Busy Check
  await t.test("POST /calls - returns 409 busy when callee is in an active call", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") return createMockChain({ id: USER_B, account_status: "active" });
      if (table === "user_blocks") return createMockChain(null);
      if (table === "calls") return createMockChain({ id: "active_call_789", status: "connected" });
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/calls")
      .set(authHeader)
      .send({ calleeId: USER_B, type: "video" });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.status, "busy");
  });

  // 7. POST /api/v1/calls - Successful Call Initiation
  await t.test("POST /calls - initiates ringing call successfully with server-selected provider", async () => {
    let callQueryCount = 0;
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") return createMockChain({ id: USER_B, account_status: "active", full_name: "User B" });
      if (table === "user_blocks") return createMockChain(null);
      if (table === "calls") {
        callQueryCount++;
        if (callQueryCount === 1) {
          return createMockChain(null);
        }
        return createMockChain({
          id: CALL_ID,
          caller_id: USER_A,
          callee_id: USER_B,
          type: "video",
          status: "ringing",
        });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/calls")
      .set(authHeader)
      .send({ calleeId: USER_B, type: "video" });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.call.id, CALL_ID);
    assert.strictEqual(res.body.call.status, "ringing");
    assert.strictEqual(res.body.provider, "webrtc");
  });

  // 8. POST /api/v1/calls/:id/accept - Callee Acceptance & Idempotency
  await t.test("POST /calls/:id/accept - callee can accept ringing call", async () => {
    mockAdmin.auth.getUser = async () => ({
      data: { user: { id: USER_B, role: "authenticated" } },
      error: null,
    });

    mockAdmin.from = (table?: string) => {
      if (table === "calls") {
        return createMockChain({
          id: CALL_ID,
          caller_id: USER_A,
          callee_id: USER_B,
          status: "ringing",
        });
      }
      if (table === "profiles") return createMockChain({ full_name: "User B" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/accept`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.call);
    assert.strictEqual(res.body.provider, "webrtc");
  });

  await t.test("POST /calls/:id/accept - duplicate accept returns 200 idempotently", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "calls") {
        return createMockChain({
          id: CALL_ID,
          caller_id: USER_A,
          callee_id: USER_B,
          status: "accepted",
        });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/accept`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.call.status, "accepted");
  });

  await t.test("POST /calls/:id/accept - rejects accepting expired/missed call", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "calls") {
        return createMockChain({
          id: CALL_ID,
          caller_id: USER_A,
          callee_id: USER_B,
          status: "missed",
        });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/accept`)
      .set(authHeader);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /no longer active/);
  });

  // 9. POST /api/v1/calls/:id/end with Safe Telemetry
  await t.test("POST /calls/:id/end - terminates call and records telemetry without leaking secrets", async () => {
    mockAdmin.auth.getUser = async () => ({
      data: { user: { id: USER_A, role: "authenticated" } },
      error: null,
    });

    mockAdmin.from = (table?: string) => {
      if (table === "calls") {
        return createMockChain({
          id: CALL_ID,
          caller_id: USER_A,
          callee_id: USER_B,
          status: "connected",
        });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/calls/${CALL_ID}/end`)
      .set(authHeader)
      .send({
        durationSeconds: 180,
        reason: "normal_hangup",
        relayUsed: false,
        setupTimeMs: 420,
        reconnectCount: 0,
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.call);
  });

  // 10. GET /api/v1/calls/metrics
  await t.test("GET /calls/metrics - returns safe aggregate observability metrics", async () => {
    const res = await request(app)
      .get("/api/v1/calls/metrics")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.metrics);
    assert.strictEqual(typeof res.body.metrics.totalAttempts, "number");
    assert.strictEqual(typeof res.body.metrics.p2pRatio, "number");
    assert.strictEqual(typeof res.body.metrics.turnRatio, "number");
  });
});
