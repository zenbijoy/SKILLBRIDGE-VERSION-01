import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

test("Admin V4 Operations Suite Tests", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const ADMIN_ID = "00000000-0000-4000-8000-000000000000";
  const MODERATOR_ID = "00000000-0000-4000-8000-000000000001";
  const STUDENT_ID = "00000000-0000-4000-8000-000000000002";

  let currentUserId = ADMIN_ID;
  let currentRoles = ["admin"];

  const createMockChain = (data: any = null, error: any = null, count: number = 0) => {
    let selected = "";
    const chain: any = {
      select: (columns?: string) => { selected = columns ?? ""; return chain; },
      insert: () => chain,
      update: () => chain,
      upsert: () => chain,
      delete: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      ilike: () => chain,
      or: () => chain,
      lt: () => chain,
      gt: () => chain,
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      not: () => chain,
      limit: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data, count, error }),
      single: () => Promise.resolve({ data: data ?? { id: "default", min_supported_version: "2.0.0" }, error }),
      maybeSingle: () => Promise.resolve({
        data: selected.includes("account_status") ? { roles: currentRoles, account_status: "active" } : data,
        error,
      }),
      then: (resolve: any) => resolve({ data, count, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: (_table?: string) => createMockChain(),
    rpc: (_fn: string, _args: any) => Promise.resolve({ data: { success: true }, error: null }),
    auth: {
      getUser: async () => ({
        data: { user: { id: currentUserId, role: "authenticated" } },
        error: null,
      }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer test_admin_jwt" };

  // ==========================================
  // 1. Authentication & RBAC Boundaries
  // ==========================================
  await t.test("Unauthenticated request to /api/v1/admin/analytics returns 401", async () => {
    const res = await request(app).get("/api/v1/admin/analytics");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Authentication required");
  });

  await t.test("Normal student role cannot access admin analytics (returns 403)", async () => {
    currentUserId = STUDENT_ID;
    currentRoles = ["student"];

    const res = await request(app)
      .get("/api/v1/admin/analytics")
      .set(authHeader);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "Insufficient role");
  });

  await t.test("Moderator role cannot clear cache (requires admin/owner, returns 403)", async () => {
    currentUserId = MODERATOR_ID;
    currentRoles = ["moderator"];

    const res = await request(app)
      .post("/api/v1/admin/cache/clear")
      .set(authHeader)
      .send({ target: "dashboard", reason: "Attempted cache purge" });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "Insufficient role");
  });

  await t.test("Moderator role cannot mutate app version control (requires admin/owner, returns 403)", async () => {
    currentUserId = MODERATOR_ID;
    currentRoles = ["moderator"];

    const res = await request(app)
      .patch("/api/v1/admin/version-control")
      .set(authHeader)
      .send({ min_supported_version: "2.1.0" });

    assert.strictEqual(res.status, 403);
  });

  // Reset to Admin role for operational tests
  currentUserId = ADMIN_ID;
  currentRoles = ["admin"];

  // ==========================================
  // 2. Safe Cache Management
  // ==========================================
  await t.test("POST /api/v1/admin/cache/clear - allows valid namespace 'dashboard'", async () => {
    const res = await request(app)
      .post("/api/v1/admin/cache/clear")
      .set(authHeader)
      .send({ target: "dashboard", reason: "Routine purge after content update" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.clearedPattern, "dashboard:*");
  });

  await t.test("POST /api/v1/admin/cache/clear - rejects FLUSHALL or arbitrary command (validation fails)", async () => {
    const res = await request(app)
      .post("/api/v1/admin/cache/clear")
      .set(authHeader)
      .send({ target: "FLUSHALL", reason: "Disallowed command" });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "Validation failed");
  });

  await t.test("POST /api/v1/admin/cache/clear - requires reason", async () => {
    const res = await request(app)
      .post("/api/v1/admin/cache/clear")
      .set(authHeader)
      .send({ target: "rooms", reason: "" });

    assert.strictEqual(res.status, 400);
  });

  // ==========================================
  // 3. Analytics & Intelligence Endpoints
  // ==========================================
  await t.test("GET /api/v1/admin/analytics - returns real metrics structure", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") return createMockChain([{ count: 42 }], null, 42);
      if (table === "rooms") return createMockChain([{ count: 5 }], null, 5);
      return createMockChain([], null, 0);
    };

    const res = await request(app)
      .get("/api/v1/admin/analytics?timeframe=30d")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok("users" in res.body);
    assert.ok("onboarding" in res.body);
    assert.ok("funnel" in res.body);
    assert.strictEqual(res.body.timeframe, "30d");
  });

  await t.test("GET /api/v1/admin/skills-intelligence - supports pagination & filtering", async () => {
    mockAdmin.from = () => createMockChain([
      { id: "s1", name: "TypeScript", category: "engineering" },
    ], null, 1);

    const res = await request(app)
      .get("/api/v1/admin/skills-intelligence?page=1&limit=10&category=engineering")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok("skills" in res.body);
    assert.ok("insights" in res.body);
  });

  // ==========================================
  // 4. Data Quality Diagnostics
  // ==========================================
  await t.test("GET /api/v1/admin/data-quality - is read-only and returns findings", async () => {
    mockAdmin.from = () => createMockChain([], null, 0);

    const res = await request(app)
      .get("/api/v1/admin/data-quality")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.readOnly, true);
    assert.ok(Array.isArray(res.body.issues));
  });

  // ==========================================
  // 5. Discovery & Privacy Insights
  // ==========================================
  await t.test("GET /api/v1/admin/discovery-insights - returns privacy-safe metrics", async () => {
    mockAdmin.from = () => createMockChain([], null, 0);

    const res = await request(app)
      .get("/api/v1/admin/discovery-insights")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok("topSearches" in res.body);
    assert.ok("zeroResultSearches" in res.body);
    assert.ok("metrics" in res.body);
  });

  await t.test("GET /api/v1/admin/privacy - returns deactivated accounts and deletion audits", async () => {
    mockAdmin.from = () => createMockChain([], null, 0);

    const res = await request(app)
      .get("/api/v1/admin/privacy")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok("metrics" in res.body);
    assert.ok("deactivatedAccounts" in res.body);
    assert.ok("auditTrail" in res.body);
  });

  // ==========================================
  // 6. Audit Explorer V2 & CSV Sanitization
  // ==========================================
  await t.test("GET /api/v1/admin/audit-logs - returns sanitized logs and CSV export", async () => {
    const mockLog = {
      id: 1,
      action: "admin.user.roles.replace",
      actor_id: ADMIN_ID,
      target_type: "user",
      target_id: "user-123",
      metadata: { token: "super_secret_token", roles: ["admin"] },
      created_at: new Date().toISOString(),
    };

    mockAdmin.from = () => createMockChain([mockLog], null, 1);

    // JSON response
    const jsonRes = await request(app)
      .get("/api/v1/admin/audit-logs?page=1&limit=10")
      .set(authHeader);

    assert.strictEqual(jsonRes.status, 200);
    assert.strictEqual(jsonRes.body.logs[0].metadata.token, "[REDACTED]");

    // CSV export response
    const csvRes = await request(app)
      .get("/api/v1/admin/audit-logs?export=csv")
      .set(authHeader);

    assert.strictEqual(csvRes.status, 200);
    assert.strictEqual(csvRes.headers["content-type"], "text/csv; charset=utf-8");
    assert.match(csvRes.text, /admin\.user\.roles\.replace/);
    assert.match(csvRes.text, /\[REDACTED\]/);
  });
});
