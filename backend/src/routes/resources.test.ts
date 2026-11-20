import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";

test("Room Study Materials & Cloudflare R2 Vault Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const fakeRoomId = "00000000-0000-0000-0000-000000000001";
  const fakeResourceId = "00000000-0000-0000-0000-000000000002";

  await t.test("GET /api/v1/resources/storage-status - returns 401 without auth", async () => {
    const res = await request.get("/api/v1/resources/storage-status");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/resources - returns 401 without auth", async () => {
    const res = await request.get(`/api/v1/resources?roomId=${fakeRoomId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/resources/upload-ticket - returns 401 without auth", async () => {
    const res = await request.post("/api/v1/resources/upload-ticket").send({
      roomId: fakeRoomId,
      filename: "lecture_notes.pdf",
      contentType: "application/pdf",
      fileSizeBytes: 10 * 1024 * 1024,
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/resources - returns 401 without auth", async () => {
    const res = await request.post("/api/v1/resources").send({
      room_id: fakeRoomId,
      title: "Lecture Notes",
      url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/notes.pdf",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/resources/upload - returns 401 without auth", async () => {
    const res = await request.post("/api/v1/resources/upload").send({
      roomId: fakeRoomId,
      title: "Direct Upload Test",
      fileBase64: "dGVzdC1maWxlLWNvbnRlbnQ=",
      fileName: "notes.pdf",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/resources/:id/download - returns 401 without auth", async () => {
    const res = await request.get(`/api/v1/resources/${fakeResourceId}/download`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/resources/:id - returns 401 without auth", async () => {
    const res = await request.delete(`/api/v1/resources/${fakeResourceId}`);
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/rooms/:id/resources - returns 401 without auth", async () => {
    const res = await request.get(`/api/v1/rooms/${fakeRoomId}/resources`);
    assert.strictEqual(res.status, 401);
  });
});

test("Authenticated Room Resource & R2 Vault Flow", async (t) => {
  const { setAdminClient } = await import("../lib/db.js");
  const { createApp } = await import("../app.js");
  const app = createApp();
  const request = supertest(app);

  const USER_A = "11111111-1111-4111-8111-111111111111"; // Uploader / Teacher
  const USER_B = "22222222-2222-4222-8222-222222222222"; // Other user
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  const RESOURCE_ID = "44444444-4444-4444-8444-444444444444";

  const createMockChain = (data: any = null, error: any = null) => {
    const chain: any = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  };

  const mockAdmin: any = {
    from: () => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A, role: "authenticated" } }, error: null }),
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://r2.test/download.pdf" }, error: null }),
        createSignedUploadUrl: async () => ({ data: { signedUrl: "https://r2.test/upload", path: "test.pdf" }, error: null }),
      }),
    },
  };

  setAdminClient(mockAdmin);
  const authHeader = { Authorization: "Bearer valid_test_token" };

  await t.test("GET /api/v1/resources/storage-status - returns active storage provider", async () => {
    const res = await request.get("/api/v1/resources/storage-status").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.provider === "string");
    assert.ok(res.body.available === true);
  });

  await t.test("POST /api/v1/resources/upload-ticket - succeeds for room member with 50MB file", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "media_objects") return createMockChain({ id: "media-obj-123" });
      return createMockChain();
    };

    const res = await request
      .post("/api/v1/resources/upload-ticket")
      .set(authHeader)
      .send({
        roomId: ROOM_ID,
        filename: "chemistry_notes.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 48 * 1024 * 1024, // 48MB
      });

    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.url === "string");
    assert.ok(typeof res.body.path === "string");
    assert.strictEqual(res.body.maxSizeBytes, 52428800);
  });

  await t.test("POST /api/v1/resources/upload-ticket - rejects file exceeding 50MB limit", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      return createMockChain();
    };

    const res = await request
      .post("/api/v1/resources/upload-ticket")
      .set(authHeader)
      .send({
        roomId: ROOM_ID,
        filename: "giant_dataset.zip",
        contentType: "application/zip",
        fileSizeBytes: 60 * 1024 * 1024, // 60MB > 50MB limit
      });

    assert.strictEqual(res.status, 400);
  });

  await t.test("POST /api/v1/resources/upload-ticket - succeeds for room owner even if membership query empty", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain(null);
      if (table === "rooms") return createMockChain({ owner_id: USER_A });
      if (table === "media_objects") return createMockChain({ id: "media-obj-owner" });
      return createMockChain();
    };

    const res = await request
      .post("/api/v1/resources/upload-ticket")
      .set(authHeader)
      .send({
        roomId: ROOM_ID,
        filename: "final_exam_prep.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 20 * 1024 * 1024,
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.url);
  });

  await t.test("POST /api/v1/resources - registers finalized material with uploader and metadata", async () => {
    const mockCreated = {
      id: RESOURCE_ID,
      room_id: ROOM_ID,
      title: "Lecture 1 Slides",
      description: "Full chapter overview",
      url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/lecture1.pdf",
      storage_path: `${USER_A}/${ROOM_ID}/lecture1.pdf`,
      kind: "slide",
      uploader_id: USER_A,
      uploader: {
        id: USER_A,
        full_name: "Prof. Einstein",
        username: "einstein",
      },
    };

    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "resources") return createMockChain(mockCreated);
      if (table === "media_objects") return createMockChain({ id: "media-123" });
      return createMockChain();
    };

    const res = await request
      .post("/api/v1/resources")
      .set(authHeader)
      .send({
        room_id: ROOM_ID,
        title: "Lecture 1 Slides",
        description: "Full chapter overview",
        url: "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/lecture1.pdf",
        storage_path: `${USER_A}/${ROOM_ID}/lecture1.pdf`,
        kind: "slide",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.id, RESOURCE_ID);
    assert.strictEqual(res.body.title, "Lecture 1 Slides");
    assert.strictEqual(res.body.uploader.full_name, "Prof. Einstein");
  });

  await t.test("GET /api/v1/resources?roomId=... - lists room materials for room member", async () => {
    const mockList = [
      {
        id: RESOURCE_ID,
        room_id: ROOM_ID,
        title: "Lecture 1 Slides",
        url: "https://r2.test/lec1.pdf",
        kind: "slide",
        uploader_id: USER_A,
        uploader: { full_name: "Prof. Einstein" },
      },
    ];

    mockAdmin.from = (table?: string) => {
      if (table === "rooms") return createMockChain({ id: ROOM_ID, visibility: "private", owner_id: USER_A });
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "resources") return createMockChain(mockList);
      return createMockChain();
    };

    const res = await request.get(`/api/v1/resources?roomId=${ROOM_ID}`).set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.resources));
    assert.strictEqual(res.body.resources.length, 1);
    assert.strictEqual(res.body.resources[0].title, "Lecture 1 Slides");
  });

  await t.test("DELETE /api/v1/resources/:id - allows uploader to delete resource", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "resources") {
        return createMockChain({
          id: RESOURCE_ID,
          room_id: ROOM_ID,
          uploader_id: USER_A,
          storage_path: `${USER_A}/${ROOM_ID}/notes.pdf`,
          room: { owner_id: USER_B },
        });
      }
      return createMockChain();
    };

    const res = await request.delete(`/api/v1/resources/${RESOURCE_ID}`).set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await t.test("DELETE /api/v1/resources/:id - rejects deletion when user is not author or moderator", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "resources") {
        return createMockChain({
          id: RESOURCE_ID,
          room_id: ROOM_ID,
          uploader_id: USER_B, // Created by User B
          storage_path: `${USER_B}/${ROOM_ID}/notes.pdf`,
          room: { owner_id: USER_B },
        });
      }
      if (table === "room_members") return createMockChain({ role: "member" }); // User A is plain member
      return createMockChain();
    };

    const res = await request.delete(`/api/v1/resources/${RESOURCE_ID}`).set(authHeader);
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /Not authorized to delete/i);
  });
});
