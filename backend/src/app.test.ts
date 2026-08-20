import test from "node:test";
import assert from "node:assert";
import request from "supertest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key_123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_123456789";
process.env.WEB_ORIGINS = "http://localhost";
process.env.NODE_ENV = "test";

test("API Endpoints", async (t) => {
  const { app } = await import("./server.js");

  await t.test("GET /health - returns basic health status", async () => {
    try {
      const res = await request(app).get("/health");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

  await t.test("GET /health/ready - returns capability status", async () => {
    const res = await request(app).get("/health/ready");
    // We expect 503 because the dummy Supabase URL will fail to connect
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.success, false);
    assert.ok("data" in res.body);
    assert.ok("database" in res.body.data);
    assert.ok("redis" in res.body.data);
    assert.ok("livekit" in res.body.data);
    assert.ok("ai" in res.body.data);
  });

  await t.test("404 handling - unknown route returns 404", async () => {
    const res = await request(app).get("/unknown-route-1234");
    if (res.status !== 404) console.error(res.body);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Not found");
  });

  await t.test("Standard error response format", async () => {
    const res = await request(app).get("/unknown-route-1234");
    if (res.status !== 404) console.error(res.body);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(typeof res.body.error, "string");
  });

  await t.test("Authorization middleware - missing token", async () => {
    // Attempting to access a protected route without a token
    const res = await request(app).get("/api/v1/dashboard");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Authentication required");
  });
});

test("Phase 1.1 DB Integration Mock Tests", async (t) => {
  const { app } = await import("./server.js");
  const { setAdminClient } = await import("./lib/db.js");

  const USER_A = "11111111-1111-4111-8111-111111111111"; // Owner / test_user
  const USER_B = "22222222-2222-4222-8222-222222222222"; // Volunteer / blocked
  const ROOM_ID = "33333333-3333-4333-8333-333333333333";
  const TEACH_REQ_ID = "44444444-4444-4444-8444-444444444444";
  const SESSION_ID = "55555555-5555-4555-8555-555555555555";
  const RESOURCE_ID = "66666666-6666-4666-8666-666666666666";
  const CONVERSATION_ID = "77777777-7777-4777-8777-777777777777";

  // Create a deterministic mock builder
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

  let rpcCalls: any[] = [];
  
  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return { data: "success", error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A, role: "authenticated" } }, error: null }),
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "http://mock-url" }, error: null })
      })
    }
  };

  // Inject the mock
  setAdminClient(mockAdmin);

  // Helper for auth headers
  const authHeader = { Authorization: "Bearer valid_mock_token" };

  await t.test("TEACHING - member can submit teaching request", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" });
      if (table === "teaching_requests") return createMockChain({ id: TEACH_REQ_ID });
      if (table === "rooms") return createMockChain({ owner_id: USER_B, title: "Test Room" });
      return createMockChain();
    };
    
    const res = await request(app).post(`/api/v1/rooms/${ROOM_ID}/teach`).set(authHeader).send({ note: "I want to teach" });
    assert.strictEqual(res.status, 201);
  });

  await t.test("TEACHING - room owner can accept candidate (Transaction RPC)", async () => {
    rpcCalls = [];
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") return createMockChain({ owner_id: USER_A }); 
      if (table === "teaching_requests") return createMockChain({ volunteer_id: USER_B });
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/teach/${TEACH_REQ_ID}`)
      .set(authHeader)
      .send({ status: "accepted" });
      
    assert.strictEqual(res.status, 200);
    assert.strictEqual(rpcCalls.length, 1);
    assert.strictEqual(rpcCalls[0].name, "accept_teaching_request");
    assert.strictEqual(rpcCalls[0].args.p_request_id, TEACH_REQ_ID);
    assert.strictEqual(rpcCalls[0].args.p_volunteer_id, undefined);
  });

  await t.test("TEACHING - unauthorized user cannot accept candidate", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "rooms") return createMockChain({ owner_id: USER_B }); 
      return createMockChain();
    };

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/teach/${TEACH_REQ_ID}`)
      .set(authHeader)
      .send({ status: "accepted" });
      
    assert.strictEqual(res.status, 403);
  });

  await t.test("BLOCKING - block user uses atomic RPC", async () => {
    rpcCalls = [];
    const res = await request(app)
      .post("/api/v1/account/blocks")
      .set(authHeader)
      .send({ blocked_id: USER_B });
      
    assert.strictEqual(res.status, 200);
    assert.strictEqual(rpcCalls.length, 1);
    assert.strictEqual(rpcCalls[0].name, "block_user_atomic");
    assert.strictEqual(rpcCalls[0].args.p_blocked_id, USER_B);
  });

  await t.test("SESSION - unauthorized session creation rejected", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "room_members") return createMockChain({ role: "member" }); 
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/sessions")
      .set(authHeader)
      .send({ room_id: ROOM_ID, starts_at: new Date().toISOString(), mode: "online" });
      
    assert.strictEqual(res.status, 403);
  });

  await t.test("REVIEW - non-participant review rejected", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ teacher_id: USER_B, status: "completed" });
      if (table === "session_participants") return createMockChain({ attendance_status: "missed" }); 
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/sessions/${SESSION_ID}/review`)
      .set(authHeader)
      .send({ rating: 5 });
      
    assert.strictEqual(res.status, 403);
  });

  await t.test("REVIEW - valid review triggers submit_review_atomic RPC", async () => {
    rpcCalls = [];
    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain({ teacher_id: USER_B, status: "completed" });
      if (table === "session_participants") return createMockChain({ attendance_status: "attended" });
      return createMockChain();
    };

    const res = await request(app)
      .post(`/api/v1/sessions/${SESSION_ID}/review`)
      .set(authHeader)
      .send({ rating: 5, comment: "Great" });
      
    assert.strictEqual(res.status, 201);
    assert.strictEqual(rpcCalls.length, 1);
    assert.strictEqual(rpcCalls[0].name, "submit_review_atomic");
    assert.strictEqual(rpcCalls[0].args.p_rating, 5);
  });

  await t.test("RESOURCE - member can request signed download", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "resources") return createMockChain({ room_id: ROOM_ID, storage_path: "path.pdf" });
      if (table === "room_members") return createMockChain({ role: "member" }); 
      return createMockChain();
    };

    const res = await request(app).get(`/api/v1/resources/${RESOURCE_ID}/download`).set(authHeader);
      
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.url, "http://mock-url");
  });
});
