import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

test("Admin API Tests", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const ADMIN_ID = "00000000-0000-4000-8000-000000000000";
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  let authenticatedRoles = ["admin"];

  const createMockChain = (data: any = null, error: any = null, count: number = 0) => {
    let selected = "";
    const chain: any = {
      select: (columns?: string) => { selected = columns ?? ""; return chain; },
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      eq: () => chain,
      in: () => chain,
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data, count, error }),
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({
        data: selected.includes("account_status") ? { roles: authenticatedRoles, account_status: "active" } : data,
        error,
      }),
      then: (resolve: any) => resolve({ data, count, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: ADMIN_ID, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("GET /admin/stats - returns counts", async () => {
    mockAdmin.from = (table?: string) => {
      return createMockChain(null, null, 10);
    };

    const res = await request(app)
      .get("/api/v1/admin/stats")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.users, 10);
    assert.strictEqual(res.body.rooms, 10);
  });

  await t.test("GET /admin/users - returns paginated users", async () => {
    mockAdmin.from = (table?: string) => {
      return createMockChain([{ id: USER_ID }], null, 1);
    };

    const res = await request(app)
      .get("/api/v1/admin/users")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 1);
    assert.strictEqual(res.body.users[0].id, USER_ID);
  });

  await t.test("POST /admin/users/:id/role - updates user roles", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ roles: ["student"] });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/admin/users/${USER_ID}/role`)
      .set(authHeader)
      .send({ role: "moderator" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.roles.includes("moderator"));
  });

  await t.test("PUT /admin/users/:id/roles - accepts the current elevated-role contract", async () => {
    mockAdmin.from = (table?: string) => table === "profiles"
      ? createMockChain({ id: USER_ID, roles: ["student", "moderator"] })
      : createMockChain();
    const res = await request(app)
      .put(`/api/v1/admin/users/${USER_ID}/roles`)
      .set(authHeader)
      .send({ elevatedRole: "moderator" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await t.test("POST /admin/announcements - rejects unsafe actions before database access", async () => {
    const res = await request(app)
      .post("/api/v1/admin/announcements")
      .set(authHeader)
      .send({
        title_en: "Notice",
        title_bn: "Notice BN",
        body_en: "Body",
        body_bn: "Body BN",
        action_url: "http://unsafe.example",
        action_label_en: "Open",
        action_label_bn: "Open BN",
      });
    assert.strictEqual(res.status, 400);
  });

  await t.test("POST /admin/experience-content - rejects invalid content structure", async () => {
    const res = await request(app)
      .post("/api/v1/admin/experience-content/welcome/en/publish")
      .set(authHeader)
      .send({ content: [] });
    assert.strictEqual(res.status, 400);
  });

  await t.test("moderators cannot mutate product experience configuration", async () => {
    authenticatedRoles = ["moderator"];
    try {
      const res = await request(app)
        .patch("/api/v1/admin/dashboard-configs/11111111-1111-4111-8111-111111111111")
        .set(authHeader)
        .send({ is_enabled: false });
      assert.strictEqual(res.status, 403);
    } finally {
      authenticatedRoles = ["admin"];
    }
  });
});
