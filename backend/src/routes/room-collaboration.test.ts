import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Room Collaboration & Channels Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeRoomId = "00000000-0000-0000-0000-000000000001";
  const fakeChannelId = "00000000-0000-0000-0000-000000000002";
  const fakeItemId = "00000000-0000-0000-0000-000000000003";

  await t.test("GET /api/v1/rooms/:id/channels - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/channels`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/channels - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/channels`).send({
      name: "announcements",
      type: "announcement",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/channels/:channelId - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/rooms/${fakeRoomId}/channels/${fakeChannelId}`).send({
      name: "new-name",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/rooms/:id/channels/:channelId - rejects unauthenticated requests", async () => {
    const res = await request.delete(`/api/v1/rooms/${fakeRoomId}/channels/${fakeChannelId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/search - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/search?q=calculus`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/pinned - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/pinned`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/pinned - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/pinned`).send({
      item_type: "post",
      item_id: fakeItemId,
      title: "Pinned Post",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/rooms/:id/pinned/:pinnedId - rejects unauthenticated requests", async () => {
    const res = await request.delete(`/api/v1/rooms/${fakeRoomId}/pinned/${fakeItemId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/voice/token - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/voice/token`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/voice/active - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/voice/active`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/videos/playlists - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/videos/playlists`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/videos/playlists - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/videos/playlists`).send({
      title: "Lecture Series",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/videos/progress - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/videos/progress`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/videos/progress - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/videos/progress`).send({
      recordingId: fakeItemId,
      lastPositionSeconds: 120,
      durationSeconds: 600,
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/moderation/reports - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/moderation/reports`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/moderation/actions - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/moderation/actions`).send({
      action: "remove_content",
      targetType: "post",
      targetId: fakeItemId,
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/moderation/logs - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/moderation/logs`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/analytics - rejects unauthenticated requests", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/analytics`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("PATCH /api/v1/rooms/:id/settings - rejects unauthenticated requests", async () => {
    const res = await request.patch(`/api/v1/rooms/${fakeRoomId}/settings`).send({
      default_landing_tab: "chat",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/rooms/:id/invites - rejects unauthenticated requests", async () => {
    const res = await request.post(`/api/v1/rooms/${fakeRoomId}/invites`).send({
      maxUses: 10,
    });
    assert.strictEqual(res.status, 401);
  });
});
