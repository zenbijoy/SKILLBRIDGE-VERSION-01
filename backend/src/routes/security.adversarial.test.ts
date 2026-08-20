import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

// Mock database helper
function createMockChain(data: any = null, count: number | null = null, error: any = null) {
  const chain: any = {
    _data: data,
    _count: count,
    _error: error,
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    is: () => chain,
    or: () => chain,
    range: () => chain,
    limit: () => chain,
    order: () => chain,
    textSearch: () => chain,
    insert: (d: any) => {
      chain._data = Array.isArray(d) ? d[0] : d;
      return chain;
    },
    update: (d: any) => {
      chain._data = { ...chain._data, ...d };
      return chain;
    },
    upsert: (d: any) => {
      chain._data = { ...chain._data, ...d };
      return chain;
    },
    delete: () => chain,
    single: async () => ({ data: chain._data, error: chain._error }),
    maybeSingle: async () => ({ data: chain._data, error: chain._error }),
    then: (resolve: any) => resolve({ data: chain._data, count: chain._count, error: chain._error }),
  };
  return chain;
}

const USER_ALICE = "11111111-1111-4111-8111-111111111111";
const USER_BOB = "22222222-2222-4222-8222-222222222222";
const USER_MODERATOR = "33333333-3333-4333-8333-333333333333";
const USER_ADMIN = "44444444-4444-4444-8444-444444444444";
const USER_SUSPENDED = "55555555-5555-4555-8555-555555555555";

const EVENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APP_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ROOM_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SESSION_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CONV_A = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MSG_A = "99999999-9999-4999-8999-999999999999";

const app = createApp();

test("Adversarial Security & Authorization Test Matrix", async (t) => {
  const { admin: mockAdmin } = await import("../lib/db.js");

  // Helper auth header mock
  const authHeaderFor = (uid: string, roles: string[] = ["student"], status = "active") => {
    mockAdmin.auth.getUser = async (token: string) => ({
      data: { user: { id: uid, email: `${uid}@test.campus.edu` } as any },
      error: null,
    });
    return { Authorization: `Bearer mock-token-${uid}` };
  };

  await t.test("1. Cross-Tenant Event Application Blocking", async () => {
    const authHeader = authHeaderFor(USER_ALICE, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ALICE, roles: ["student"], account_status: "active" });
      }
      if (table === "event_applications") {
        // Application belongs to EVENT_B, not EVENT_A!
        return createMockChain({ id: APP_B, event_id: EVENT_B, user_id: USER_BOB });
      }
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/events/${EVENT_A}/applications/${APP_B}`)
      .set(authHeader)
      .send({ status: "approved" });

    // Must be rejected because application does not belong to EVENT_A
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /does not belong to this event/i);
  });

  await t.test("2. Invite-Only Room Join Enforcement", async () => {
    const authHeader = authHeaderFor(USER_BOB, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_BOB, roles: ["student"], account_status: "active" });
      }
      if (table === "rooms") {
        return createMockChain({ id: ROOM_A, visibility: "invite_only", member_count: 5, capacity: 20, status: "open" });
      }
      if (table === "room_invitations") {
        // No invitation found for USER_BOB
        return createMockChain(null);
      }
      return createMockChain();
    };

    (mockAdmin as any).rpc = async () => ({ data: null, error: new Error("Invite required") });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_A}/join`)
      .set(authHeader);

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /invitation/i);
  });

  await t.test("3. Room Capacity Boundary Enforcement", async () => {
    const authHeader = authHeaderFor(USER_BOB, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_BOB, roles: ["student"], account_status: "active" });
      }
      if (table === "rooms") {
        // Room is at full capacity (20/20)
        return createMockChain({ id: ROOM_A, visibility: "public", member_count: 20, capacity: 20, status: "open" });
      }
      return createMockChain();
    };

    (mockAdmin as any).rpc = async () => ({ data: null, error: new Error("Room full") });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_A}/join`)
      .set(authHeader);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /capacity/i);
  });

  await t.test("4. Session RSVP Room Membership Authorization", async () => {
    const authHeader = authHeaderFor(USER_BOB, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_BOB, roles: ["student"], account_status: "active" });
      }
      if (table === "sessions") {
        return createMockChain({ id: SESSION_A, room_id: ROOM_A, status: "scheduled" });
      }
      if (table === "room_members") {
        // USER_BOB is not a member of ROOM_A
        return createMockChain(null);
      }
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/sessions/${SESSION_A}/attendance`)
      .set(authHeader)
      .send({ status: "confirmed" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /room member/i);
  });

  await t.test("5. Chat Reaction Conversation Membership Authorization", async () => {
    const authHeader = authHeaderFor(USER_BOB, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_BOB, roles: ["student"], account_status: "active" });
      }
      if (table === "messages") {
        return createMockChain({ id: MSG_A, conversation_id: CONV_A });
      }
      if (table === "conversation_members") {
        // USER_BOB is NOT in CONV_A
        return createMockChain(null);
      }
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/chat/messages/${MSG_A}/reactions`)
      .set(authHeader)
      .send({ reaction: "🚀" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Not authorized/i);
  });

  await t.test("6. Resource Storage Path Prefix Ownership", async () => {
    const authHeader = authHeaderFor(USER_BOB, ["student"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_BOB, roles: ["student"], account_status: "active" });
      }
      if (table === "room_members") {
        return createMockChain({ id: "rm-1", role: "member" });
      }
      return createMockChain();
    };

    // Attacker passes victim USER_ALICE's storage path
    const res = await request(app)
      .post("/api/v1/resources")
      .set(authHeader)
      .send({
        room_id: ROOM_A,
        title: "Malicious Resource",
        url: "https://example.com/exploit",
        storage_path: `${USER_ALICE}/${ROOM_A}/secret_exam.pdf`,
      });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Invalid storage path prefix/i);
  });

  await t.test("7. Suspended Account Lockdown", async () => {
    const authHeader = authHeaderFor(USER_SUSPENDED, ["student"], "suspended");

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_SUSPENDED, roles: ["student"], account_status: "suspended" });
      }
      return createMockChain();
    };

    const res = await request(app)
      .get("/api/v1/profiles/me")
      .set(authHeader);

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Account is suspended/i);
  });

  await t.test("8. Admin Privilege Hierarchy (Moderator cannot ban Administrator)", async () => {
    const authHeader = authHeaderFor(USER_MODERATOR, ["moderator"]);

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        // When checking caller: moderator; when checking target: admin
        return {
          select: (fields: string) => ({
            eq: (col: string, val: string) => ({
              single: async () => ({
                data: val === USER_ADMIN ? { roles: ["admin"], account_status: "active" } : { roles: ["moderator"], account_status: "active" },
                error: null,
              }),
              maybeSingle: async () => ({
                data: val === USER_ADMIN ? { roles: ["admin"], account_status: "active" } : { roles: ["moderator"], account_status: "active" },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
        };
      }
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ADMIN}/status`)
      .set(authHeader)
      .send({ status: "banned" });

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /administrators/i);
  });

  await t.test("9. Quiz Point Reward Idempotency", async () => {
    const authHeader = authHeaderFor(USER_ALICE, ["student"]);
    const QUIZ_ID = "12345678-1234-4234-8234-123456789abc";
    const Q1_ID = "11111111-2222-4333-8444-555555555555";
    const Q2_ID = "22222222-3333-4444-8555-666666666666";

    let pointsLedgerInsertCount = 0;

    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ALICE, roles: ["student"], account_status: "active", reputation: 50 });
      }
      if (table === "quiz_questions") {
        return createMockChain([
          { id: Q1_ID, correct_answer: 0 },
          { id: Q2_ID, correct_answer: 1 },
        ]);
      }
      if (table === "quiz_attempts") {
        return createMockChain({ id: "att-1" });
      }
      if (table === "quizzes") {
        return createMockChain({ id: QUIZ_ID, skill_id: "skill-1" });
      }
      if (table === "points_ledger") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: "existing-points-1" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => {
            pointsLedgerInsertCount++;
            return createMockChain();
          },
        };
      }
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/quiz/submit")
      .set(authHeader)
      .send({
        quizId: QUIZ_ID,
        answers: { [Q1_ID]: 0, [Q2_ID]: 1 },
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.passed, true);
    // Because user already collected reward, ledger points should NOT be inserted again
    assert.strictEqual(pointsLedgerInsertCount, 0);
  });
});
