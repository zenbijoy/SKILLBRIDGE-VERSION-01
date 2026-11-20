import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { setAdminClient } from "../lib/db.js";

test("Academic Help & Doubts API Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);

  const fakeQuestionId = "11111111-2222-3333-4444-555555555555";
  const fakeAnswerId = "66666666-7777-8888-9999-000000000000";
  const mockUserId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const mockRoomId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("GET /api/v1/help/questions - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/help/questions");
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/help/questions - rejects unauthenticated requests", async () => {
    const res = await request.post("/api/v1/help/questions").send({
      title: "Differential equations question",
      body: "How do I solve second order linear homogeneous ODEs?",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/help/questions/:id - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/help/questions/${fakeQuestionId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/help/questions/:id/answers - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/help/questions/${fakeQuestionId}/answers`).send({
      body: "You can find characteristic roots r1 and r2, then apply the formula.",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/help/questions/:id/upvote - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/help/questions/${fakeQuestionId}/upvote`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/help/questions/:id/answers/:answerId/upvote - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/help/questions/${fakeQuestionId}/answers/${fakeAnswerId}/upvote`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/help/questions/:id/answers/:answerId/accept - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/help/questions/${fakeQuestionId}/answers/${fakeAnswerId}/accept`);
    assert.strictEqual(res.status, 401);
  });

  // Authenticated suite
  await t.test("Authenticated Academic Help & Doubts Lifecycle", async (at) => {
    const createMockChain = (data: any = null, error: any = null) => {
      const singleData = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
      const listData = Array.isArray(data) ? data : data ? [data] : [];
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        upsert: () => chain,
        eq: () => chain,
        neq: () => chain,
        ilike: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: singleData, error }),
        maybeSingle: async () => ({ data: singleData, error }),
        then: (resolve: any) => Promise.resolve({ data: listData, error }).then(resolve),
      };
      return chain;
    };

    const mockQuestion = {
      id: fakeQuestionId,
      room_id: mockRoomId,
      author_id: mockUserId,
      title: "How to solve homogeneous linear ODEs?",
      body: "Need help solving second-order constant coefficient ODEs.",
      subject: "Calculus",
      topic: "ODEs",
      urgency: "today",
      tags: ["math", "calculus"],
      is_resolved: false,
      upvotes_count: 0,
      created_at: new Date().toISOString(),
      author: {
        id: mockUserId,
        full_name: "Jane Doe",
        username: "janedoe",
        avatar_url: null,
        university: "Tech University",
      },
      room: {
        id: mockRoomId,
        title: "Campus Academic Help Center",
        visibility: "public",
      },
      answers: [],
    };

    const mockAdmin = {
      auth: {
        getUser: async () => ({
          data: { user: { id: mockUserId, email: "user@test.edu" } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return createMockChain({
            id: mockUserId,
            full_name: "Jane Doe",
            username: "janedoe",
            university: "Tech University",
            account_status: "active",
            roles: ["student"],
          });
        }
        if (table === "admin_accounts") {
          return createMockChain(null);
        }
        if (table === "rooms") {
          return createMockChain({
            id: mockRoomId,
            title: "Tech University Academic Help Center",
            visibility: "public",
            capacity: 250,
          });
        }
        if (table === "room_members") {
          return createMockChain({ room_id: mockRoomId, user_id: mockUserId, role: "member" });
        }
        if (table === "room_questions") {
          return createMockChain([mockQuestion]);
        }
        if (table === "room_question_answers") {
          return createMockChain({
            id: fakeAnswerId,
            question_id: fakeQuestionId,
            author_id: mockUserId,
            body: "Find roots of the characteristic equation r^2 + ar + b = 0.",
            is_accepted: false,
            upvotes_count: 0,
            created_at: new Date().toISOString(),
            author: { id: mockUserId, full_name: "Jane Doe", username: "janedoe" },
          });
        }
        if (table === "room_question_votes") {
          return createMockChain(null);
        }
        return createMockChain();
      },
      rpc: async () => ({ data: { awarded: true, points: 5 }, error: null }),
    };

    setAdminClient(mockAdmin as any);

    await at.test("POST /api/v1/help/questions - successfully creates doubt with rewards", async () => {
      const res = await request
        .post("/api/v1/help/questions")
        .set(authHeader)
        .send({
          title: "How to solve homogeneous linear ODEs?",
          body: "Need help solving second-order constant coefficient ODEs.",
          subject: "Calculus",
          topic: "ODEs",
          urgency: "today",
          target: "campus",
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.question.title, "How to solve homogeneous linear ODEs?");
      assert.strictEqual(res.body.question.urgency, "today");
      assert.strictEqual(res.body.reward.awarded, true);
    });

    await at.test("GET /api/v1/help/questions - returns question listing with subject and metadata", async () => {
      const res = await request
        .get("/api/v1/help/questions")
        .set(authHeader);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.questions));
    });

    await at.test("GET /api/v1/help/questions/:id - returns question detail", async () => {
      const res = await request
        .get(`/api/v1/help/questions/${fakeQuestionId}`)
        .set(authHeader);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.question.id, fakeQuestionId);
    });

    await at.test("POST /api/v1/help/questions/:id/answers - posts answer and rewards reputation", async () => {
      const res = await request
        .post(`/api/v1/help/questions/${fakeQuestionId}/answers`)
        .set(authHeader)
        .send({
          body: "Find roots of the characteristic equation r^2 + ar + b = 0.",
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.reward.awarded, true);
    });

    await at.test("POST /api/v1/help/questions/:id/upvote - upvotes question safely", async () => {
      const res = await request
        .post(`/api/v1/help/questions/${fakeQuestionId}/upvote`)
        .set(authHeader);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(typeof res.body.upvotesCount, "number");
    });

    await at.test("PATCH /api/v1/help/questions/:id/answers/:answerId/accept - marks answer accepted", async () => {
      const res = await request
        .patch(`/api/v1/help/questions/${fakeQuestionId}/answers/${fakeAnswerId}/accept`)
        .set(authHeader);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });
  });
});
