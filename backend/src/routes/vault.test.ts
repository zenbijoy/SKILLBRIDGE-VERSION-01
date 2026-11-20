import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { setAdminClient } from "../lib/db.js";
import { optimizePdf } from "../services/storageOptimizer.js";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

test("Academic Vault & Turbo PDF Compression Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);

  await t.test("GET /api/v1/vault - returns 401 without auth token", async () => {
    const res = await request.get("/api/v1/vault");
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/vault/upload - requires authentication", async () => {
    const res = await request.post("/api/v1/vault/upload").send({
      title: "Test Note",
      fileBase64: "dGVzdA==",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/vault/upload-raw - requires authentication", async () => {
    const res = await request
      .post("/api/v1/vault/upload-raw")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("%PDF-1.4 test"));
    assert.strictEqual(res.status, 401);
  });

  await t.test("Authenticated GET /api/v1/vault - lists notes with uploader profiles", async () => {
    const mockNotes = [
      {
        id: "note-1",
        title: "CSE Algorithms Lecture 1",
        file_url: "https://r2.test/vault/note1.pdf",
        file_key: "vault/note1.pdf",
        file_size_bytes: 1024,
        uploader_id: "user-1",
        created_at: new Date().toISOString(),
      },
    ];
    const mockProfiles = [
      {
        id: "user-1",
        full_name: "Jane Student",
        username: "janestudent",
        avatar_url: "https://avatar.test/1.png",
      },
    ];

    const createMockChain = (data: any = null, error: any = null) => {
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: mockProfiles, error: null }),
        limit: () => chain,
        order: () => chain,
        single: () => Promise.resolve({ data, error }),
        maybeSingle: () => Promise.resolve({ data, error }),
        then: (resolve: any) => resolve({ data: mockNotes, error: null }),
      };
      return chain;
    };

    const mockAdmin: any = {
      from: (tbl: string) => {
        if (tbl === "vault_notes") return createMockChain(mockNotes);
        if (tbl === "profiles") return createMockChain(mockProfiles);
        return createMockChain();
      },
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", role: "authenticated" } },
          error: null,
        }),
      },
    };

    setAdminClient(mockAdmin);

    const res = await request
      .get("/api/v1/vault")
      .set("Authorization", "Bearer valid_test_token");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.notes));
    assert.strictEqual(res.body.notes.length, 1);
    assert.strictEqual(res.body.notes[0].uploader?.full_name, "Jane Student");
  });

  await t.test("PDF Compression Engine - reduces image-heavy PDF size and returns optimization stats", async () => {
    // Generate an image-heavy PDF
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);

    const imgBuffer = await sharp({
      create: {
        width: 1600,
        height: 1600,
        channels: 3,
        background: { r: 60, g: 120, b: 200 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const embedded = await doc.embedJpg(imgBuffer);
    page.drawImage(embedded, { x: 50, y: 50, width: 500, height: 700 });
    const rawPdf = Buffer.from(await doc.save());

    const result = await optimizePdf(rawPdf);

    assert.ok(result.optimizedBuffer.length > 0);
    assert.ok(result.sha256);
    assert.strictEqual(typeof result.savingsRatio, "number");
    assert.ok(result.finalBytes <= result.originalBytes);
    assert.ok(result.savedPercent);
  });

  await t.test("POST /api/v1/vault/drive/import - requires authentication", async () => {
    const res = await request.post("/api/v1/vault/drive/import").send({
      driveUrl: "https://drive.google.com/drive/folders/1234567890abcdef",
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/vault/drive/import - validates invalid Google Drive URL", async () => {
    const res = await request
      .post("/api/v1/vault/drive/import")
      .set("Authorization", "Bearer valid_test_token")
      .send({
        driveUrl: "https://example.com/not-drive",
      });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Invalid Google Drive URL/i);
  });

  await t.test("POST /api/v1/vault/drive/import - accepts valid Google Drive URL and schedules VPS worker", async () => {
    const mockJob = {
      id: "job-123",
      user_id: "user-1",
      drive_url: "https://drive.google.com/drive/folders/1a2b3c4d5e6f",
      drive_type: "folder",
      drive_id: "1a2b3c4d5e6f",
      status: "pending",
      files_found: 0,
      files_processed: 0,
      created_at: new Date().toISOString(),
    };

    const createSafeMockChain = (data: any = mockJob) => {
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: [], error: null }),
        limit: () => chain,
        order: () => chain,
        single: () => Promise.resolve({ data, error: null }),
        maybeSingle: () => Promise.resolve({ data, error: null }),
        then: (resolve: any) => resolve({ data: [data], error: null }),
      };
      return chain;
    };

    const mockAdmin: any = {
      from: () => createSafeMockChain(),
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", role: "authenticated" } },
          error: null,
        }),
      },
    };

    setAdminClient(mockAdmin);

    const res = await request
      .post("/api/v1/vault/drive/import")
      .set("Authorization", "Bearer valid_test_token")
      .send({
        driveUrl: "https://drive.google.com/drive/folders/1a2b3c4d5e6f",
        department: "CSE",
        semester: "4th",
      });

    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.jobId, "job-123");
    assert.strictEqual(res.body.driveType, "folder");
  });

  await t.test("GET /api/v1/vault/drive/jobs/:id - returns job status", async () => {
    const mockJob = {
      id: "job-123",
      drive_url: "https://drive.google.com/drive/folders/1a2b3c4d5e6f",
      status: "completed",
      files_found: 8,
      files_processed: 8,
    };

    const createSafeMockChain = (data: any = mockJob) => {
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data, error: null }),
        maybeSingle: () => Promise.resolve({ data, error: null }),
        then: (resolve: any) => resolve({ data: [data], error: null }),
      };
      return chain;
    };

    const mockAdmin: any = {
      from: () => createSafeMockChain(mockJob),
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", role: "authenticated" } },
          error: null,
        }),
      },
    };

    setAdminClient(mockAdmin);

    const res = await request
      .get("/api/v1/vault/drive/jobs/job-123")
      .set("Authorization", "Bearer valid_test_token");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.job.id, "job-123");
    assert.strictEqual(res.body.job.status, "completed");
    assert.strictEqual(res.body.job.files_processed, 8);
  });

  await t.test("GET /api/v1/vault/drive/stream/:id - redirects to R2 URL when already cached", async () => {
    const mockCachedNote = {
      id: "note-r2",
      title: "Algorithms Slide Deck",
      file_url: "https://r2.cdn.skillbridge.internal/vault/algorithms.pdf",
      file_key: "vault/algorithms.pdf",
      storage_provider: "r2",
    };

    const createSafeMockChain = (data: any = mockCachedNote) => {
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data, error: null }),
        maybeSingle: () => Promise.resolve({ data, error: null }),
        then: (resolve: any) => resolve({ data: [data], error: null }),
      };
      return chain;
    };

    const mockAdmin: any = {
      from: () => createSafeMockChain(mockCachedNote),
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", role: "authenticated" } },
          error: null,
        }),
      },
    };

    setAdminClient(mockAdmin);

    const res = await request
      .get("/api/v1/vault/drive/stream/note-r2")
      .set("Authorization", "Bearer valid_test_token");

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.location, "https://r2.cdn.skillbridge.internal/vault/algorithms.pdf");
  });
});
