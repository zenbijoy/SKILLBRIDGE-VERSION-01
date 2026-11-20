import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Academic Help & Doubts API Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);

  const fakeQuestionId = "11111111-2222-3333-4444-555555555555";
  const fakeAnswerId = "66666666-7777-8888-9999-000000000000";

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
});
