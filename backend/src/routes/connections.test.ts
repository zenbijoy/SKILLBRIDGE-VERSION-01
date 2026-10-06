import { test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Connections Endpoints Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  await t.test("GET /api/v1/connections - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/connections");
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/connections/requests - rejects unauthenticated requests", async () => {
    const res = await request
      .post("/api/v1/connections/requests")
      .send({ recipientId: "00000000-0000-0000-0000-000000000001" });
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/connections/requests/:id - rejects unauthenticated requests", async () => {
    const res = await request
      .patch("/api/v1/connections/requests/00000000-0000-0000-0000-000000000001")
      .send({ status: "accepted" });
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/connections/requests/:id - rejects unauthenticated requests", async () => {
    const res = await request.delete("/api/v1/connections/requests/00000000-0000-0000-0000-000000000001");
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/connections/requests/to/:recipientId - rejects unauthenticated requests", async () => {
    const res = await request.delete("/api/v1/connections/requests/to/00000000-0000-0000-0000-000000000001");
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/connections/:userId - rejects unauthenticated requests", async () => {
    const res = await request.delete("/api/v1/connections/00000000-0000-0000-0000-000000000001");
    assert.strictEqual(res.status, 401);
  });
});
