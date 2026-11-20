import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

test("Room Roles & Hierarchy RBAC Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const OWNER_ID = "11111111-1111-4111-8111-111111111111";
  const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
  const TEACHER_ID = "33333333-3333-4333-8333-333333333333";
  const STUDENT_ID = "44444444-4444-4444-8444-444444444444";
  const ROOM_ID = "55555555-5555-4555-8555-555555555555";

  let activeUserId = OWNER_ID;

  const createSelfChain = (resolveData: any = null) => {
    const c: any = {
      select: () => c,
      insert: () => c,
      update: () => c,
      delete: () => c,
      upsert: () => c,
      eq: () => c,
      neq: () => c,
      in: () => c,
      not: () => c,
      is: () => c,
      lte: () => c,
      gte: () => c,
      gt: () => c,
      lt: () => c,
      limit: () => c,
      order: () => c,
      range: () => c,
      single: async () => ({ data: resolveData, error: null }),
      maybeSingle: async () => ({ data: resolveData, error: null }),
      then: (resolve: any) => resolve({ data: resolveData, error: null }),
    };
    return c;
  };

  const roomRecord = {
    id: ROOM_ID,
    owner_id: OWNER_ID,
    title: "Calculus III",
    visibility: "public",
    status: "active",
  };

  const getRoleForUser = (uid: string) => {
    if (uid === OWNER_ID) return "owner";
    if (uid === ADMIN_ID) return "admin";
    if (uid === TEACHER_ID) return "teacher";
    return "member";
  };

  const mockAdmin: any = {
    from: (table?: string) => {
      if (table === "rooms") {
        return createSelfChain(roomRecord);
      }

      if (table === "room_members") {
        const c: any = {
          select: () => c,
          update: (body: any) => ({
            ...c,
            eq: () => ({
              ...c,
              eq: () => ({
                ...c,
                select: () => ({
                  ...c,
                  single: async () => ({ data: { role: body.role }, error: null }),
                }),
              }),
            }),
          }),
          delete: () => createSelfChain({ success: true }),
          eq: (col1: string, val1: string) => {
            return {
              ...c,
              eq: (col2: string, val2: string) => {
                const targetUid = col1 === "user_id" ? val1 : col2 === "user_id" ? val2 : activeUserId;
                const role = getRoleForUser(targetUid);
                return createSelfChain({ role, user_id: targetUid });
              },
              maybeSingle: async () => {
                const targetUid = col1 === "user_id" ? val1 : activeUserId;
                return { data: { role: getRoleForUser(targetUid), user_id: targetUid }, error: null };
              },
              single: async () => {
                const targetUid = col1 === "user_id" ? val1 : activeUserId;
                return { data: { role: getRoleForUser(targetUid), user_id: targetUid }, error: null };
              },
            };
          },
          maybeSingle: async () => ({ data: { role: getRoleForUser(activeUserId), user_id: activeUserId }, error: null }),
          single: async () => ({ data: { role: getRoleForUser(activeUserId), user_id: activeUserId }, error: null }),
        };
        return c;
      }

      return createSelfChain(null);
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: activeUserId, role: "authenticated" } },
        error: null,
      }),
    },
    rpc: async () => ({ data: null, error: null }),
  };

  setAdminClient(mockAdmin);

  const authHeader = { Authorization: "Bearer mock_token" };

  // 1. Permissions Endpoint for Owner
  await t.test("GET /api/v1/rooms/:id/permissions - returns owner permissions and assignable roles", async () => {
    activeUserId = OWNER_ID;
    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/permissions`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isOwner, true);
    assert.strictEqual(res.body.isAdmin, true);
    assert.strictEqual(res.body.isTeacher, true);
    assert.strictEqual(res.body.canManageRoles, true);
    assert.strictEqual(res.body.canStartLive, true);
    assert.deepStrictEqual(res.body.assignableRoles, ["admin", "teacher", "moderator", "member", "guest"]);
  });

  // 2. Permissions Endpoint for Teacher
  await t.test("GET /api/v1/rooms/:id/permissions - returns teacher permissions", async () => {
    activeUserId = TEACHER_ID;
    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/permissions`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.isOwner, false);
    assert.strictEqual(res.body.isTeacher, true);
    assert.strictEqual(res.body.canStartLive, true);
    assert.strictEqual(res.body.canModerate, true);
    assert.strictEqual(res.body.canManageRoles, false);
    assert.deepStrictEqual(res.body.assignableRoles, []);
  });

  // 3. Owner can promote student to teacher
  await t.test("PATCH /api/v1/rooms/:id/members/:memberId/role - owner promotes student to teacher", async () => {
    activeUserId = OWNER_ID;
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/members/${STUDENT_ID}/role`)
      .set(authHeader)
      .send({ role: "teacher" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.role, "teacher");
  });

  // 4. Demoting Room Owner via role endpoint is blocked
  await t.test("PATCH /api/v1/rooms/:id/members/:memberId/role - owner cannot be demoted via role patch", async () => {
    activeUserId = OWNER_ID;
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/members/${OWNER_ID}/role`)
      .set(authHeader)
      .send({ role: "member" });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /cannot be demoted/i);
  });

  // 5. Admin cannot promote anyone to Admin or Owner
  await t.test("PATCH /api/v1/rooms/:id/members/:memberId/role - admin cannot promote to admin or owner", async () => {
    activeUserId = ADMIN_ID;
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/members/${STUDENT_ID}/role`)
      .set(authHeader)
      .send({ role: "admin" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /cannot promote a member to your rank or higher/i);
  });

  // 6. Regular student cannot manage roles
  await t.test("PATCH /api/v1/rooms/:id/members/:memberId/role - regular member rejected with 403", async () => {
    activeUserId = STUDENT_ID;
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/members/${STUDENT_ID}/role`)
      .set(authHeader)
      .send({ role: "teacher" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Only the room admin or owner/i);
  });

  // 7. Member Removal - Admin can remove student
  await t.test("DELETE /api/v1/rooms/:id/members/:memberId - admin removes student", async () => {
    activeUserId = ADMIN_ID;
    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/members/${STUDENT_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  // 8. Member Removal - Owner cannot be removed
  await t.test("DELETE /api/v1/rooms/:id/members/:memberId - cannot remove owner", async () => {
    activeUserId = ADMIN_ID;
    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/members/${OWNER_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Cannot remove room owner/i);
  });

  // 9. Transfer Ownership
  await t.test("POST /api/v1/rooms/:id/transfer-ownership - owner transfers sovereignty", async () => {
    activeUserId = OWNER_ID;
    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/transfer-ownership`)
      .set(authHeader)
      .send({ newOwnerId: ADMIN_ID });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.newOwnerId, ADMIN_ID);
  });
});
