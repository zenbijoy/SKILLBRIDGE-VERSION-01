import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { recordAuthFailure, resetAuthFailureMetrics } from "../middleware/auth.js";

test("Admin System Status & Health API Tests", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const ADMIN_ID = "00000000-0000-4000-8000-000000000000";
  const MODERATOR_ID = "22222222-2222-4222-8222-222222222222";
  const STUDENT_ID = "33333333-3333-4333-8333-333333333333";

  let currentUserId = ADMIN_ID;
  let currentUserRoles = ["admin"];

  const createMockChain = (data: any = null, error: any = null) => {
    let selected = "";
    const chain: any = {
      select: (columns?: string) => { selected = columns ?? ""; return chain; },
      eq: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({
        data: selected.includes("account_status") ? { roles: currentUserRoles, account_status: "active" } : data,
        error,
      }),
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: () => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: currentUserId, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_admin_token" };

  t.beforeEach(async () => {
    currentUserId = ADMIN_ID;
    currentUserRoles = ["admin"];
    await resetAuthFailureMetrics();
  });

  await t.test("GET /api/v1/admin/system/status - rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/admin/system/status");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Authentication required");
  });

  await t.test("GET /api/v1/admin/system/status - rejects student role (403)", async () => {
    currentUserId = STUDENT_ID;
    currentUserRoles = ["student"];

    const res = await request(app)
      .get("/api/v1/admin/system/status")
      .set(authHeader);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "Insufficient role");
  });

  await t.test("GET /api/v1/admin/system/status - rejects moderator role (admin-only)", async () => {
    currentUserId = MODERATOR_ID;
    currentUserRoles = ["moderator"];

    const res = await request(app)
      .get("/api/v1/admin/system/status")
      .set(authHeader);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "Insufficient role");
  });

  await t.test("GET /api/v1/admin/system/status - returns complete telemetry for admin", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system/status")
      .set(authHeader);

    assert.strictEqual(res.status, 200);

    // Verify Server info
    assert(typeof res.body.server.uptimeSeconds === "number");
    assert(typeof res.body.server.startedAt === "string");
    assert(typeof res.body.server.isRecentRestart === "boolean");
    assert(typeof res.body.server.nodeVersion === "string");

    // Verify Memory stats
    assert(typeof res.body.memory.rssMB === "number");
    assert(typeof res.body.memory.heapUsedMB === "number");
    assert(typeof res.body.memory.heapTotalMB === "number");

    // Verify Services telemetry
    assert(res.body.services.database.status === "operational" || res.body.services.database.status === "degraded" || res.body.services.database.status === "unconfigured");
    assert(typeof res.body.services.redis.status === "string");
    assert(typeof res.body.services.auth.status === "string");
    assert(typeof res.body.services.auth.failuresLast5Min === "number");
    assert(typeof res.body.services.auth.failuresPerMinute === "number");
    assert(typeof res.body.services.auth.isAuthDegraded === "boolean");
    assert(res.body.services.socketio.status === "operational");

    // Verify Issues and Healthy boolean
    assert(Array.isArray(res.body.issues));
    assert(typeof res.body.healthy === "boolean");

    // Verify Rate Limit info
    assert(typeof res.body.rateLimit.globalLimitPerMinute === "number");
  });

  await t.test("GET /api/v1/admin/system/status - detects degraded auth when failure rate is high", async () => {
    // Simulate high volume of auth failures (e.g. >20/min -> >100 in 5 min window)
    for (let i = 0; i < 110; i++) {
      await recordAuthFailure();
    }

    const res = await request(app)
      .get("/api/v1/admin/system/status")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.services.auth.isAuthDegraded, true);
    assert.strictEqual(res.body.services.auth.status, "degraded");
    assert(res.body.issues.some((issue: string) => issue.includes("Authentication failure rate elevated")));
    assert.strictEqual(res.body.healthy, false);
  });

  await t.test("GET /api/v1/admin/system/status - does NOT leak sensitive tokens or secrets", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system/status")
      .set(authHeader);

    const stringified = JSON.stringify(res.body);
    assert(!stringified.includes("supabase_service_role_key"), "Must not leak supabase service role key");
    assert(!stringified.includes("LIVEKIT_API_SECRET"), "Must not leak livekit secret");
    assert(!stringified.includes("EXPO_PUSH_ACCESS_TOKEN"), "Must not leak expo push token");
    assert(!stringified.includes("AI_PROVIDER_API_KEY"), "Must not leak AI provider key");
    assert(!stringified.includes("password"), "Must not leak password");
  });
});
