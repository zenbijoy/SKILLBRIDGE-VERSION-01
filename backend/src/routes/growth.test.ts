import test from "node:test";
import assert from "node:assert";
import request from "supertest";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key_123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_key_123456789";
process.env.WEB_ORIGINS = "http://localhost";
process.env.NODE_ENV = "test";

test("Learning & Growth Hub API Tests", async (t) => {
  const { app } = await import("../server.js");
  const { setAdminClient } = await import("../lib/db.js");

  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const TUTOR_ID = "22222222-2222-4222-8222-222222222222";
  const GOAL_ID = "33333333-3333-4333-8333-333333333333";
  const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
  const CHALLENGE_ID = "55555555-5555-4555-8555-555555555555";
  const ACHIEVEMENT_ID = "66666666-6666-4666-8666-666666666666";

  const createMockChain = (data: any = null, error: any = null, count: number = 0) => {
    let selected = "";
    const chain: any = {
      select: (columns?: string) => { selected = columns ?? ""; return chain; },
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
      eq: () => chain,
      in: () => chain,
      or: () => chain,
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      lt: () => chain,
      gt: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data, count, error }),
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({
        data: selected.includes("account_status") ? { roles: ["student"], account_status: "active" } : data,
        error,
      }),
      then: (resolve: any) => resolve({ data, count, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => {
      if (table === "profiles") {
        return createMockChain({
          id: USER_ID,
          full_name: "Test User",
          username: "testuser",
          roles: ["student"],
          account_status: "active",
          reputation_score: 100,
          profile_completion_percent: 85,
        });
      }
      if (table === "learning_goals") {
        const goalObj = {
          id: GOAL_ID,
          user_id: USER_ID,
          title: "Master TypeScript & React Native",
          status: "draft",
          progress_percent: 0,
          milestones: [{ id: "m1", title: "Milestone 1", weight: 100, is_completed: false }],
        };
        const chain = createMockChain([goalObj]);
        chain.single = () => Promise.resolve({ data: goalObj, error: null });
        chain.maybeSingle = () => Promise.resolve({ data: goalObj, error: null });
        return chain;
      }
      if (table === "study_planner_preferences") {
        return createMockChain({
          user_id: USER_ID,
          preferred_days: [1, 2, 3, 4, 5],
          preferred_daily_minutes: 60,
          preferred_modes: ["online"],
        });
      }
      if (table === "study_plan_blocks") {
        return createMockChain([
          {
            id: "b1",
            user_id: USER_ID,
            title: "Study Session",
            start_time: "2026-08-25T19:00:00.000Z",
            end_time: "2026-08-25T20:00:00.000Z",
            duration_minutes: 60,
            is_completed: false,
          },
        ]);
      }
      if (table === "session_bookings") {
        return createMockChain([
          {
            id: BOOKING_ID,
            learner_id: USER_ID,
            tutor_id: TUTOR_ID,
            start_time: "2026-08-25T14:00:00.000Z",
            end_time: "2026-08-25T15:00:00.000Z",
            status: "requested",
          },
        ]);
      }
      if (table === "saved_collections") {
        return createMockChain([
          { id: "col1", user_id: USER_ID, name: "Web Development", color: "#2563EB" },
        ]);
      }
      if (table === "challenge_definitions") {
        return createMockChain([
          {
            id: CHALLENGE_ID,
            title: "Study Master",
            description: "Complete 3 study sessions",
            target_activity_type: "study_session",
            target_count: 3,
            points_reward: 50,
            is_active: true,
            start_at: "2026-08-01T00:00:00.000Z",
            end_at: "2026-08-31T23:59:59.000Z",
          },
        ]);
      }
      if (table === "achievement_definitions") {
        return createMockChain([
          {
            id: ACHIEVEMENT_ID,
            title: "First Milestone",
            description: "Completed first milestone",
            points_reward: 50,
            is_active: true,
          },
        ]);
      }
      if (table === "user_achievements") {
        const achRecord = {
          id: "ua1",
          user_id: USER_ID,
          achievement_id: ACHIEVEMENT_ID,
          verification_code: "SB-ACH-12345678-ABCDEF12",
          is_public: true,
          is_revoked: false,
          issued_at: "2026-08-20T10:00:00.000Z",
          user: { id: USER_ID, full_name: "Test User", username: "testuser" },
          achievement: { id: ACHIEVEMENT_ID, title: "First Milestone", points_reward: 50 },
        };
        const chain = createMockChain([achRecord]);
        chain.single = () => Promise.resolve({ data: achRecord, error: null });
        chain.maybeSingle = () => Promise.resolve({ data: achRecord, error: null });
        return chain;
      }
      return createMockChain([]);
    },
    rpc: async (fn: string, params: any) => {
      if (fn === "activate_learning_goal_atomic") {
        return { data: { success: true, status: "active" }, error: null };
      }
      if (fn === "complete_goal_milestone_atomic") {
        return { data: { success: true, progress_percent: 100, goal_completed: true }, error: null };
      }
      if (fn === "request_session_booking_atomic") {
        return { data: { booking_id: BOOKING_ID, status: "requested" }, error: null };
      }
      if (fn === "update_booking_status_atomic") {
        return { data: { success: true, from_status: "requested", to_status: params.p_new_status }, error: null };
      }
      if (fn === "complete_booking_atomic") {
        return { data: { success: true, status: "completed" }, error: null };
      }
      if (fn === "claim_challenge_reward_atomic") {
        return { data: { success: true, status: "claimed", points_awarded: 50 }, error: null };
      }
      return { data: { success: true }, error: null };
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, role: "authenticated" } },
        error: null,
      }),
    },
  };

  setAdminClient(mockAdmin as any);
  const authHeader = { Authorization: "Bearer test_token" };

  await t.test("GET /api/v1/goals returns user goals list", async () => {
    const res = await request(app).get("/api/v1/goals").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.goals));
  });

  await t.test("POST /api/v1/goals rejects goal with invalid milestone weights sum", async () => {
    const res = await request(app)
      .post("/api/v1/goals")
      .set(authHeader)
      .send({
        title: "Test Goal",
        target_date: "2026-12-31",
        milestones: [{ title: "Step 1", weight: 60 }], // Not 100%
      });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /weights must sum to exactly 100%/);
  });

  await t.test("POST /api/v1/goals/:id/activate calls atomic activation RPC", async () => {
    const res = await request(app)
      .post(`/api/v1/goals/${GOAL_ID}/activate`)
      .set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "active");
  });

  await t.test("GET /api/v1/planner/preferences returns preferences", async () => {
    const res = await request(app).get("/api/v1/planner/preferences").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.preferences);
  });

  await t.test("GET /api/v1/calendar/agenda returns aggregated agenda", async () => {
    const res = await request(app).get("/api/v1/calendar/agenda").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.agenda));
  });

  await t.test("GET /api/v1/calendar/export/ics returns .ics calendar feed", async () => {
    const res = await request(app).get("/api/v1/calendar/export/ics").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("BEGIN:VCALENDAR"));
    assert.ok(res.text.includes("END:VCALENDAR"));
  });

  await t.test("POST /api/v1/bookings requests booking via atomic RPC", async () => {
    const res = await request(app)
      .post("/api/v1/bookings")
      .set(authHeader)
      .send({
        tutor_id: TUTOR_ID,
        start_time: "2026-08-25T14:00:00.000Z",
        end_time: "2026-08-25T15:00:00.000Z",
        mode: "online",
      });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.booking_id, BOOKING_ID);
  });

  await t.test("GET /api/v1/saved/collections lists user collections", async () => {
    const res = await request(app).get("/api/v1/saved/collections").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.collections));
  });

  await t.test("GET /api/v1/challenges returns active challenges with progress", async () => {
    const res = await request(app).get("/api/v1/challenges").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.challenges));
  });

  await t.test("POST /api/v1/challenges/:id/claim claims reward atomically", async () => {
    const res = await request(app)
      .post(`/api/v1/challenges/${CHALLENGE_ID}/claim`)
      .set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "claimed");
  });

  await t.test("GET /api/v1/achievements/verify/:code public verification verifies credential", async () => {
    const res = await request(app).get("/api/v1/achievements/verify/SB-ACH-12345678-ABCDEF12");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.verified, true);
    assert.strictEqual(res.body.certificate.verification_code, "SB-ACH-12345678-ABCDEF12");
  });

  await t.test("GET /api/v1/progress/summary returns user learning stats", async () => {
    const res = await request(app).get("/api/v1/progress/summary").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.stats);
    assert.ok(typeof res.body.stats.total_learning_minutes === "number");
  });
});
