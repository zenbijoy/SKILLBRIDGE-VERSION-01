import test, { mock } from "node:test";
import assert from "node:assert";
import request from "supertest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key_123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_123456789";
process.env.WEB_ORIGINS = "http://localhost";
process.env.NODE_ENV = "test";

// We need a dummy auth token for the auth middleware
const DUMMY_TOKEN = "dummy-token";

// Mock the db before importing app
mock.module("../src/lib/db.js", {
  namedExports: {
    admin: {
      auth: {
        getUser: mock.fn(async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        })),
      },
      from: mock.fn((table: string) => {
        return {
          select: mock.fn().mockReturnThis(),
          insert: mock.fn().mockReturnThis(),
          update: mock.fn().mockReturnThis(),
          upsert: mock.fn().mockReturnThis(),
          eq: mock.fn().mockReturnThis(),
          maybeSingle: mock.fn(async () => ({ data: { roles: ["student"] }, error: null })),
          single: mock.fn(async () => ({ data: {}, error: null })),
        };
      }),
      rpc: mock.fn(async () => ({ data: {}, error: null })),
    },
  },
});

test("Rooms Routes", async (t) => {
  const { app } = await import("../src/server.js");

  await t.test("POST /api/v1/rooms/:id/teach - Creates teaching request", async () => {
    // We expect the auth middleware to pass (mocked above) and the upsert to be called
    const res = await request(app)
      .post("/api/v1/rooms/00000000-0000-0000-0000-000000000000/teach")
      .set("Authorization", `Bearer ${DUMMY_TOKEN}`)
      .send({ note: "I want to teach" });
    
    assert.strictEqual(res.status, 201);
  });
});
