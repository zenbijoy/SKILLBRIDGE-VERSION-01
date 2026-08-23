import test from "node:test";
import assert from "node:assert";
import request from "supertest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key_123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_123456789";
process.env.WEB_ORIGINS = "http://localhost";
process.env.NODE_ENV = "test";
process.env.LIVEKIT_URL = "wss://skillbridge-test.livekit.cloud";
process.env.LIVEKIT_API_KEY = "test_key";
process.env.LIVEKIT_API_SECRET = "test_secret_1234567890123456789012345678901234567890";

test("LiveKit Integration Tests", async (t) => {
  const { app } = await import("../server.js");
  const { setAdminClient } = await import("../lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // user
  const SESSION_ID = "55555555-5555-4555-8555-555555555555";
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  
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
      or: () => chain,
      match: () => chain,
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A, role: "authenticated" } }, error: null }),
    },
  };
  setAdminClient(mockAdmin as any);

  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("POST /live/token/:sessionId - validates role correctly and returns token with metadata", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ id: SESSION_ID, room_id: ROOM_ID, status: "scheduled", teacher_id: USER_A });
      if (table === "room_members") return createMockChain({ role: "teacher" });
      if (table === "profiles") return createMockChain({ full_name: "Test Teacher", username: "testteacher" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/live/token/${SESSION_ID}`)
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.canPublish, true);
    assert.strictEqual(res.body.url, "wss://skillbridge-test.livekit.cloud");
    assert.strictEqual(res.body.participantName, "Test Teacher");
    assert.strictEqual(res.body.sessionId, SESSION_ID);
    assert.ok(res.body.token);
  });

  await t.test("POST /webhooks/live - rejects missing raw body", async () => {
    const res = await request(app).post("/webhooks/live");
    assert.strictEqual(res.status, 400);
  });
});
