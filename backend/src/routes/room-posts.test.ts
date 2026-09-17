import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Room OS Core Endpoints Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeRoomId = "00000000-0000-0000-0000-000000000001";
  const fakePostId = "00000000-0000-0000-0000-000000000002";
  const fakeMemberId = "00000000-0000-0000-0000-000000000003";

  await t.test("GET /api/v1/rooms/:id/permissions - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/permissions`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/posts - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/posts`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/posts - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/posts`).send({
      body: "Test post in room",
      type: "discussion",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/posts/:postId/pin - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/rooms/${fakeRoomId}/posts/${fakePostId}/pin`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/rooms/:id/posts/:postId - rejects unauthenticated requests", async () => {
    const res = await request.delete(`/api/v1/rooms/${fakeRoomId}/posts/${fakePostId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/posts/:postId/comments - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/posts/${fakePostId}/comments`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/posts/:postId/comments - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/posts/${fakePostId}/comments`).send({
      body: "Test comment",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/posts/:postId/reactions - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/posts/${fakePostId}/reactions`).send({
      reaction_type: "helpful",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/members/:memberId/role - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/rooms/${fakeRoomId}/members/${fakeMemberId}/role`).send({
      role: "moderator",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/rooms/:id/members/:memberId - rejects unauthenticated requests", async () => {
    const res = await request.delete(`/api/v1/rooms/${fakeRoomId}/members/${fakeMemberId}`);
    assert.strictEqual(res.status, 401);
  });
});
