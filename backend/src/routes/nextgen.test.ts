import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Next-Gen API Routes Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeRoomId = "00000000-0000-0000-0000-000000000001";
  const fakeQId = "00000000-0000-0000-0000-000000000002";
  const fakeAId = "00000000-0000-0000-0000-000000000003";
  const fakeClubId = "00000000-0000-0000-0000-000000000004";

  // 1. Unauthenticated route protection checks
  await t.test("GET /api/v1/feed - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/feed");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/questions - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/questions`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/questions/:qId/answers/:aId/accept - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/rooms/${fakeRoomId}/questions/${fakeQId}/answers/${fakeAId}/accept`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/recordings - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/recordings`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/recordings - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/recordings`).send({
      title: "Lecture 1",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/clubs/:id/clashes - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/clubs/${fakeClubId}/clashes`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/clubs/:id/clashes/:clashId/negotiate - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/clubs/${fakeClubId}/clashes/${fakeQId}/negotiate`).send({
      action: "propose",
      proposedNewTime: new Date().toISOString(),
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/resources/storage-status - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/resources/storage-status");
    assert.strictEqual(res.status, 401);
  });

  await t.test("getStorageStatus service - returns provider and availability status", async () => {
    const { getStorageStatus } = await import("../services/storage.js");
    const status = await getStorageStatus();
    assert.ok(typeof status.provider === "string");
    assert.ok(typeof status.available === "boolean");
  });

  await t.test("GET /api/v1/profiles/me/privacy - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/profiles/me/privacy");
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/profiles/me/privacy - rejects unauthenticated requests", async () => {
    const res = await request.patch("/api/v1/profiles/me/privacy").send({ profile_visibility: "connections" });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/notifications - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/notifications");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/search - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/search?q=test");
    assert.strictEqual(res.status, 401);
  });

  await t.test("Privacy Service - self messaging and calling is always allowed", async () => {
    const { canUserMessage, canUserCall } = await import("../services/privacyService.js");
    const sameUserId = "11111111-1111-1111-1111-111111111111";
    const msg = await canUserMessage(sameUserId, sameUserId);
    assert.strictEqual(msg.allowed, true);
    const call = await canUserCall(sameUserId, sameUserId);
    assert.strictEqual(call.allowed, true);
  });
});

