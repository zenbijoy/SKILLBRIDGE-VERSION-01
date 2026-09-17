import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { canShareSource } from "../services/spaceWorkspaceService.js";

test("SkillBridge Cross-Space Integration Test Suite (Prompt 6)", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeClubId = "00000000-0000-0000-0000-000000000010";
  const fakeProjectId = "00000000-0000-0000-0000-000000000020";
  const fakeUserId = "00000000-0000-0000-0000-000000000030";
  const fakeSourceId = "00000000-0000-0000-0000-000000000040";

  await t.test("GET /api/v1/clubs/:id/workspace - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/clubs/${fakeClubId}/workspace`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/clubs/:id/workspace - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/clubs/${fakeClubId}/workspace`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/research/projects/:id/workspace - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/research/projects/${fakeProjectId}/workspace`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/research/projects/:id/workspace - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/research/projects/${fakeProjectId}/workspace`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/help/questions - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/help/questions`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/help/questions - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/help/questions`).send({
      body: "How does Lagrange interpolation work?",
      subject: "Numerical Methods",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/shares - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/shares`).send({
      sourceType: "question",
      sourceId: fakeSourceId,
      destinationType: "campus_feed",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/shares/by-source/:type/:id - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/shares/by-source/question/${fakeSourceId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("canShareSource security logic - allows valid public share candidate", async () => {
    const check = await canShareSource(fakeUserId, "event", fakeSourceId, "campus_feed");
    assert.strictEqual(check.allowed, true);
  });
});
