import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";

function createMockChain(data: any = null, error: any = null) {
  const chain: any = {
    _data: data,
    _error: error,
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: (d: any) => {
      chain._data = Array.isArray(d) ? d[0] : d;
      return chain;
    },
    upsert: (d: any) => {
      chain._data = { ...chain._data, ...d };
      return chain;
    },
    maybeSingle: async () => ({ data: chain._data, error: chain._error }),
    single: async () => ({ data: chain._data, error: chain._error }),
    then: (resolve: any) => resolve({ data: chain._data, error: chain._error }),
  };
  return chain;
}

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";

const app = createApp();

test("Quiz & Skill Passport API Test Suite", async (t) => {
  const { admin: mockAdmin } = await import("../lib/db.js");
  const { generateQuizSession } = await import("../services/quizEngine.js");
  const { geminiKeyManager } = await import("../services/geminiKeyManager.js");

  // Mock Gemini AI generation for instant offline tests
  geminiKeyManager.generateContent = async () => ({
    text: JSON.stringify([
      {
        prompt: "What is the time complexity of bubble sort in worst case?",
        options: ["O(n^2)", "O(n log n)", "O(1)", "O(n)"],
        correct_index: 0,
        bloom_level: "remember",
        difficulty: "easy",
        explanation: "Bubble sort performs comparisons on all pairs in worst case.",
        topic_tag: "Sorting",
      },
      {
        prompt: "Which data structure uses LIFO ordering for elements?",
        options: ["Stack", "Queue", "Tree", "Graph"],
        correct_index: 0,
        bloom_level: "remember",
        difficulty: "easy",
        explanation: "Stack uses Last-In First-Out ordering.",
        topic_tag: "Data Structures",
      },
      {
        prompt: "Which data structure uses FIFO ordering for elements?",
        options: ["Queue", "Stack", "Binary Heap", "Hash Map"],
        correct_index: 0,
        bloom_level: "remember",
        difficulty: "easy",
        explanation: "Queue uses First-In First-Out ordering.",
        topic_tag: "Data Structures",
      },
      {
        prompt: "What is the average search time complexity of a Hash Table?",
        options: ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
        correct_index: 0,
        bloom_level: "understand",
        difficulty: "medium",
        explanation: "Hash table provides O(1) average lookup.",
        topic_tag: "Hashing",
      },
      {
        prompt: "Which sorting algorithm is guaranteed to be stable and O(n log n)?",
        options: ["Merge Sort", "Quick Sort", "Heap Sort", "Selection Sort"],
        correct_index: 0,
        bloom_level: "understand",
        difficulty: "medium",
        explanation: "Merge sort is stable and runs in O(n log n) time.",
        topic_tag: "Sorting",
      },
    ]),
    keyUsed: "mock-key",
    raw: {},
    modelUsed: "gemini-2.5-flash",
  });

  const authHeader = () => {
    mockAdmin.auth.getUser = async () => ({
      data: { user: { id: USER_ID, email: "student@campus.edu" } as any },
      error: null,
    });
    return { Authorization: `Bearer mock-token-${USER_ID}` };
  };

  await t.test("1. GET /api/v1/quiz/catalog returns topic list", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
      }
      if (table === "skills") {
        return createMockChain([
          { id: SKILL_ID, name: "Data Structures", category: "Computer Science" },
        ]);
      }
      return createMockChain();
    };

    const res = await request(app)
      .get("/api/v1/quiz/catalog")
      .set(authHeader());

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.catalog));
    assert.strictEqual(res.body.catalog[0].skill_id, SKILL_ID);
    assert.strictEqual(res.body.catalog[0].skill_name, "Data Structures");
  });

  await t.test("2. GET /api/v1/quiz/passport generates deterministic unique passport ID", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
      }
      if (table === "user_skills") {
        return createMockChain([
          {
            skill_id: SKILL_ID,
            proficiency: 4,
            verified: true,
            created_at: new Date().toISOString(),
            skills: { name: "Data Structures", category: "Computer Science" },
          },
        ]);
      }
      if (table === "quiz_attempts") {
        return createMockChain([
          { score: 90, passed: true, difficulty: "medium" },
        ]);
      }
      return createMockChain();
    };

    const res = await request(app)
      .get("/api/v1/quiz/passport")
      .set(authHeader());

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.passport_id.startsWith("SKB-PASS-"));
    assert.strictEqual(res.body.user_id, USER_ID);
    assert.strictEqual(res.body.verified_skills.length, 1);
    assert.strictEqual(res.body.stats.total_passed, 1);
    assert.strictEqual(res.body.stats.average_score, 90);
  });

  await t.test("3. POST /api/v1/quiz/start validates payload input", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
      }
      return createMockChain();
    };

    // Missing both skill_id and custom_skill_name
    const res = await request(app)
      .post("/api/v1/quiz/start")
      .set(authHeader())
      .send({ difficulty: "medium" });

    assert.strictEqual(res.status, 400);
  });

  await t.test("4. POST /api/v1/quiz/submit enforces server-side time limit (H4)", async () => {
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
      }
      return createMockChain();
    };

    // Create session with 5 seconds limit
    const session = await generateQuizSession({
      userId: USER_ID,
      skillId: SKILL_ID,
      skillName: "Algorithms",
      topic: "Sorting",
      difficulty: "easy",
      questionCount: 5,
      timeLimitSeconds: 5,
      maxViolations: 3,
    });

    // Artificially age the session to exceed limit + grace (e.g. 40 seconds ago)
    (session as any).started_at = new Date(Date.now() - 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/quiz/submit")
      .set(authHeader())
      .send({
        session_id: session.session_id,
        answers: {},
      });

    assert.strictEqual(res.status, 422);
    assert.match(res.body.error, /time limit exceeded/i);
  });

  await t.test("5. POST /api/v1/quiz/submit prevents reputation farming on retake (H3)", async () => {
    let rpcCallCount = 0;
    (mockAdmin as any).rpc = async (rpcName: string) => {
      if (rpcName === "award_reputation_atomic") {
        rpcCallCount++;
        return { data: { awarded: true }, error: null };
      }
      return { data: null, error: null };
    };

    // Simulate session
    const session = await generateQuizSession({
      userId: USER_ID,
      skillId: SKILL_ID,
      skillName: "Algorithms",
      topic: "Sorting",
      difficulty: "medium",
      questionCount: 5,
      timeLimitSeconds: 900,
      maxViolations: 3,
    });

    // Provide all correct answers
    const answers: Record<string, number> = {};
    for (const q of session.questions) {
      answers[q.id] = q.correct_index;
    }

    // Mock DB: Simulate user ALREADY has a passed attempt for this skill
    mockAdmin.from = (table?: string) => {
      if (table === "profiles") {
        return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
      }
      if (table === "quiz_attempts") {
        // Return existing passed attempt
        return createMockChain({ id: "previous-passed-attempt-id", passed: true });
      }
      if (table === "user_skills") {
        return createMockChain({ user_id: USER_ID, skill_id: SKILL_ID });
      }
      return createMockChain();
    };

    const res = await request(app)
      .post("/api/v1/quiz/submit")
      .set(authHeader())
      .send({
        session_id: session.session_id,
        answers,
        elapsed_seconds: 30,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.passed, true);
    // Reputation must NOT be awarded again (reward_points must be 0)
    assert.strictEqual(res.body.reward_points, 0);
    assert.strictEqual(rpcCallCount, 0);
  });
});
