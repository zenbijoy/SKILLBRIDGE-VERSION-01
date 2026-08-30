import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";

test("Profiles & Onboarding API Suite", async (t) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_ID = "11111111-1111-4111-8111-111111111111";
  let rpcCalls: Array<{ fn: string; args: any }> = [];

  const baseProfile = {
    id: USER_ID,
    full_name: "Test User",
    username: "testuser",
    preferred_locale: "en",
    study_mode_preference: "hybrid",
    onboarding_step: "language",
    onboarding_status: "not_started",
    onboarding_version: 1,
    onboarding_mission: "both",
    onboarding_push_opt_in: true,
    timezone: "Asia/Dhaka",
    profile_completion_percent: 14,
    profile_missing_fields: ["university", "department", "teach_skills", "learn_skills"],
    roles: ["student"],
    account_status: "active",
  };

  const createMockChain = (data: any = null, error: any = null) => {
    let selected = "";
    const chain: any = {
      select: (cols?: string) => {
        selected = cols ?? "";
        return chain;
      },
      eq: () => chain,
      upsert: () => chain,
      maybeSingle: () => {
        if (selected.includes("account_status")) {
          return Promise.resolve({ data: { roles: ["student"], account_status: "active" }, error: null });
        }
        return Promise.resolve({ data, error });
      },
      then: (resolve: any) => resolve({ data, error }),
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => {
      if (table === "profiles") {
        return createMockChain(baseProfile);
      }
      if (table === "user_skills") {
        return createMockChain([
          { kind: "known", proficiency: 4, skills: { name: "Python" } },
          { kind: "wanted", proficiency: 1, skills: { name: "Data Science" } },
        ]);
      }
      return createMockChain([]);
    },
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      if (fn === "save_onboarding_progress_atomic") {
        return {
          data: {
            profile: {
              ...baseProfile,
              ...args.p_profile,
            },
            completion_percent: 58,
            missing_fields: ["university", "department"],
            skills_known: ["Python"],
            skills_wanted: ["Data Science"],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, role: "authenticated" } },
        error: null,
      }),
      admin: {
        getUserById: async (uid: string) => ({
          data: {
            user: {
              id: uid,
              user_metadata: { full_name: "Auto Provisioned", avatar_url: "https://example.com/avatar.jpg" },
            },
          },
          error: null,
        }),
      },
    },
  };

  setAdminClient(mockAdmin as any);
  const authHeader = { Authorization: "Bearer test_valid_token" };

  await t.test("1. GET /profiles/me returns profile and skill passport", async () => {
    const res = await request(app)
      .get("/api/v1/profiles/me")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.profile.id, USER_ID);
    assert.strictEqual(res.body.profile.full_name, "Test User");
    assert.strictEqual(res.body.skillsKnown.length, 1);
    assert.strictEqual(res.body.skillsKnown[0].name, "Python");
  });

  await t.test("2. POST /me/onboarding/bulk saves Step 1 without requiring skills", async () => {
    rpcCalls = [];
    const res = await request(app)
      .post("/api/v1/profiles/me/onboarding/bulk")
      .set(authHeader)
      .send({
        preferred_locale: "en",
        timezone: "Asia/Dhaka",
        onboarding_step: "identity",
        onboarding_status: "in_progress",
        onboarding_version: 1,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(rpcCalls.length, 1);
    const call = rpcCalls[0]!;
    assert.strictEqual(call.fn, "save_onboarding_progress_atomic");
    assert.strictEqual(call.args.p_teach_skills, null);
    assert.strictEqual(call.args.p_learn_skills, null);
    assert.strictEqual(call.args.p_profile.preferred_locale, "en");
    assert.strictEqual(call.args.p_profile.onboarding_step, "identity");
  });

  await t.test("3. POST /me/onboarding/bulk passes explicit skills when provided", async () => {
    rpcCalls = [];
    const res = await request(app)
      .post("/api/v1/profiles/me/onboarding/bulk")
      .set(authHeader)
      .send({
        onboarding_step: "preferences",
        onboarding_status: "in_progress",
        teachSkills: ["Python", "React"],
        learnSkills: ["Machine Learning"],
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(rpcCalls.length, 1);
    const call = rpcCalls[0]!;
    assert.deepStrictEqual(call.args.p_teach_skills, ["Python", "React"]);
    assert.deepStrictEqual(call.args.p_learn_skills, ["Machine Learning"]);
  });

  await t.test("4. POST /me/onboarding/bulk supports intentional skill clear", async () => {
    rpcCalls = [];
    const res = await request(app)
      .post("/api/v1/profiles/me/onboarding/bulk")
      .set(authHeader)
      .send({
        onboarding_step: "preferences",
        onboarding_status: "in_progress",
        teachSkills: [],
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(rpcCalls.length, 1);
    const call = rpcCalls[0]!;
    assert.deepStrictEqual(call.args.p_teach_skills, []);
  });

  await t.test("5. POST /me/onboarding/defer successfully defers onboarding", async () => {
    rpcCalls = [];
    const res = await request(app)
      .post("/api/v1/profiles/me/onboarding/defer")
      .set(authHeader)
      .send({});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(rpcCalls.length, 1);
    const call = rpcCalls[0]!;
    assert.strictEqual(call.args.p_profile.onboarding_status, "deferred");
  });
});
