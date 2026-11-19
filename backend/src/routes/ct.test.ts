import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { setAdminClient } from "../lib/db.js";
import { geminiKeyManager } from "../services/geminiKeyManager.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

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
    delete: () => chain,
    update: (d: any) => {
      chain._data = { ...chain._data, ...d };
      return chain;
    },
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

const mockAdmin = {
  from: (table?: string) => {
    if (table === "profiles") {
      return createMockChain({ id: USER_ID, roles: ["student"], account_status: "active" });
    }
    if (table === "admin_accounts") {
      return createMockChain(null);
    }
    return createMockChain(null);
  },
  auth: {
    getUser: async () => ({
      data: { user: { id: USER_ID, role: "authenticated" } },
      error: null,
    }),
  },
};

setAdminClient(mockAdmin as any);

const app = createApp();
const authHeader = { Authorization: "Bearer valid_mock_token" };

test("CT Preparation & AI Study Plan Suite", async (t) => {
  const originalGenerateJson = geminiKeyManager.generateJson.bind(geminiKeyManager);

  geminiKeyManager.generateJson = (async (prompt: string): Promise<any> => {
    if (prompt.includes("diagnostic Class Test (CT) practice quiz")) {
      return {
        data: {
          questions: [
            {
              id: "q1",
              topic: "B-Trees",
              question: "What is the minimum degree t of a B-tree where each non-root node contains at least 2 keys?",
              options: ["t = 3", "t = 2", "t = 4", "t = 1"],
              correctIndex: 1,
              explanation: "In a B-tree, non-root nodes contain at least t - 1 keys. For 2 keys, t = 3.",
              difficulty: "medium",
            },
            {
              id: "q2",
              topic: "Dijkstra Algorithm",
              question: "Can Dijkstra's algorithm handle graphs with negative edge weights?",
              options: ["No, it may fail", "Yes, always works", "Only for cycles", "Only if undirected"],
              correctIndex: 0,
              explanation: "Greedy choice assumption in Dijkstra fails when negative edge weights exist.",
              difficulty: "medium",
            },
          ],
        },
        keyUsed: "AQ.Ab8RN...lHwg",
        modelUsed: "gemini-3.5-flash-lite",
      };
    }

    if (prompt.includes("formula cheatsheet")) {
      return {
        data: {
          cheatsheet: [
            {
              id: "card_1",
              topic: "AVL Trees",
              title: "Balance Factor Equation",
              formulaOrKeyRule: "BF = height(left) - height(right) in {-1, 0, 1}",
              explanation: "Tree requires rotation if |BF| > 1 after insertion.",
              examTip: "Identify whether it is LL, RR, LR, or RL rotation based on insertion path.",
            },
          ],
        },
        keyUsed: "AQ.Ab8RN...lHwg",
        modelUsed: "gemini-3.5-flash-lite",
      };
    }

    // Default: AI Plan Generator
    return {
      data: {
        subject: "Data Structures & Algorithms",
        totalHours: 6,
        overallStrategy: "Focus on B-Trees properties and Dijkstra proof in the first 4 hours.",
        schedule: [
          {
            dayOrBlock: "Block 1 (50m Pomodoro)",
            topic: "B-Trees",
            sessionType: "deep_theory",
            durationMinutes: 50,
            priority: "high",
            focus: "Node splitting, insertion invariants, and search time complexity O(log n).",
            practiceQuestionsCount: 5,
            activeRecallPrompt: "Explain the split child condition during B-Tree insertion.",
          },
          {
            dayOrBlock: "Block 2 (50m Pomodoro)",
            topic: "Dijkstra Algorithm",
            sessionType: "numerical_practice",
            durationMinutes: 50,
            priority: "high",
            focus: "Trace shortest paths with adjacency matrix & min-priority queue.",
            practiceQuestionsCount: 4,
            activeRecallPrompt: "Why does relaxation step work?",
          },
        ],
        recommendedChecklist: [
          {
            id: "task_1",
            title: "Solve B-Tree insertion example with t=3",
            topic: "B-Trees",
            priority: "high",
            estMinutes: 30,
            completed: false,
          },
          {
            id: "task_2",
            title: "Trace Dijkstra table on 6-vertex graph",
            topic: "Dijkstra Algorithm",
            priority: "high",
            estMinutes: 30,
            completed: false,
          },
        ],
        cheatsheet: [
          {
            topic: "B-Trees",
            concept: "Max Keys per Node",
            formulaOrRule: "Max keys = 2t - 1, Max children = 2t",
            mnemonicOrTip: "Node splits when it hits 2t - 1 keys.",
          },
        ],
        examTraps: [
          {
            topic: "Dijkstra Algorithm",
            commonMistake: "Updating distance without updating previous parent node.",
            howToAvoid: "Always write table with columns: Vertex, Distance, Parent.",
          },
        ],
        aiTips: [
          "Practice manual table tracing because CTs are written exams.",
          "Check tree balance after every single deletion.",
        ],
      },
      keyUsed: "AQ.Ab8RN...lHwg",
      modelUsed: "gemini-3.5-flash-lite",
    };
  }) as any;

  t.after(() => {
    geminiKeyManager.generateJson = originalGenerateJson;
  });

  await t.test("POST /api/v1/ct/ai/generate-plan - generates AI-powered study roadmap with Gemini", async () => {
    const res = await request(app)
      .post("/api/v1/ct/ai/generate-plan")
      .set(authHeader)
      .send({
        subject: "Data Structures & Algorithms",
        topics: ["B-Trees", "Dijkstra Algorithm"],
        availableHours: 6,
        targetGoal: "ace",
        difficulty: "intermediate",
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.subject, "Data Structures & Algorithms");
    assert.strictEqual(res.body.totalHours, 6);
    assert.ok(Array.isArray(res.body.schedule), "Schedule should be an array");
    assert.strictEqual(res.body.schedule.length, 2);
    assert.strictEqual(res.body.schedule[0].topic, "B-Trees");
    assert.strictEqual(res.body.schedule[0].sessionType, "deep_theory");
    assert.ok(res.body.schedule[0].activeRecallPrompt.length > 0);
    assert.ok(Array.isArray(res.body.recommendedChecklist));
    assert.ok(Array.isArray(res.body.cheatsheet));
    assert.ok(Array.isArray(res.body.examTraps));
    assert.ok(Array.isArray(res.body.aiTips));
    assert.strictEqual(res.body.isAiGenerated, true);
    assert.ok(res.body.aiModel.includes("gemini"));
  });

  await t.test("POST /api/v1/ct/ai/generate-plan - falls back gracefully on AI timeout or failure", async () => {
    const tempFn = geminiKeyManager.generateJson;
    geminiKeyManager.generateJson = async () => {
      throw new Error("Gemini quota rate limit 429");
    };

    const res = await request(app)
      .post("/api/v1/ct/ai/generate-plan")
      .set(authHeader)
      .send({
        subject: "Compiler Design",
        topics: ["Lexical Analysis", "LL(1) Parsing", "LR(0) Automata"],
        availableHours: 5,
        targetGoal: "mastery",
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.subject, "Compiler Design");
    assert.strictEqual(res.body.totalHours, 5);
    assert.ok(res.body.schedule.length >= 3);
    assert.ok(res.body.recommendedChecklist.length >= 3);
    assert.strictEqual(res.body.isAiGenerated, false);

    geminiKeyManager.generateJson = tempFn;
  });

  await t.test("POST /api/v1/ct/ai/generate-plan - rejects invalid body", async () => {
    const res = await request(app)
      .post("/api/v1/ct/ai/generate-plan")
      .set(authHeader)
      .send({
        subject: "",
        topics: [],
      });

    assert.strictEqual(res.status, 400);
  });

  await t.test("POST /api/v1/ct/plans - creates and stores a new CT plan", async () => {
    const examDate = new Date(Date.now() + 3 * 86400000).toISOString();
    const res = await request(app)
      .post("/api/v1/ct/plans")
      .set(authHeader)
      .send({
        subject: "Discrete Mathematics",
        examDate,
        topics: ["Graph Theory", "Recurrence Relations"],
        checklist: [
          { id: "c1", title: "Review Euler circuit theorem", completed: false },
          { id: "c2", title: "Solve Master Theorem problems", completed: false },
        ],
        targetScore: "ace",
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.plan);
    assert.strictEqual(res.body.plan.subject, "Discrete Mathematics");
    assert.strictEqual(res.body.plan.checklist.length, 2);
    assert.strictEqual(res.body.plan.progressPercent, 0);
  });

  await t.test("GET /api/v1/ct/plans - retrieves saved CT plans", async () => {
    const res = await request(app)
      .get("/api/v1/ct/plans")
      .set(authHeader);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.plans));
    assert.ok(res.body.plans.length >= 1);
  });

  await t.test("PATCH /api/v1/ct/plans/:id - updates checklist and computes progress", async () => {
    const listRes = await request(app)
      .get("/api/v1/ct/plans")
      .set(authHeader);

    const plan = listRes.body.plans[0];
    assert.ok(plan, "Should have a plan to update");

    const updatedChecklist = [
      { id: "c1", title: "Review Euler circuit theorem", completed: true },
      { id: "c2", title: "Solve Master Theorem problems", completed: false },
    ];

    const patchRes = await request(app)
      .patch(`/api/v1/ct/plans/${plan.id}`)
      .set(authHeader)
      .send({
        checklist: updatedChecklist,
      });

    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.success, true);
    assert.strictEqual(patchRes.body.plan.progressPercent, 50);
  });

  await t.test("POST /api/v1/ct/plans/:id/log-study - logs study minutes spent", async () => {
    const listRes = await request(app)
      .get("/api/v1/ct/plans")
      .set(authHeader);

    const plan = listRes.body.plans[0];

    const logRes = await request(app)
      .post(`/api/v1/ct/plans/${plan.id}/log-study`)
      .set(authHeader)
      .send({
        minutes: 25,
      });

    assert.strictEqual(logRes.status, 200);
    assert.strictEqual(logRes.body.success, true);
    assert.strictEqual(logRes.body.loggedMinutes, 25);
  });

  await t.test("POST /api/v1/ct/ai/mock-quiz - generates interactive diagnostic questions", async () => {
    const res = await request(app)
      .post("/api/v1/ct/ai/mock-quiz")
      .set(authHeader)
      .send({
        subject: "Data Structures & Algorithms",
        topics: ["B-Trees", "Dijkstra Algorithm"],
        questionCount: 2,
        difficulty: "medium",
      });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.questions));
    assert.strictEqual(res.body.questions.length, 2);
    assert.strictEqual(res.body.questions[0].topic, "B-Trees");
    assert.strictEqual(typeof res.body.questions[0].correctIndex, "number");
  });

  await t.test("POST /api/v1/ct/ai/cheatsheet - generates formula cards", async () => {
    const res = await request(app)
      .post("/api/v1/ct/ai/cheatsheet")
      .set(authHeader)
      .send({
        subject: "Data Structures",
        topics: ["AVL Trees"],
      });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.cheatsheet));
    assert.strictEqual(res.body.cheatsheet[0].topic, "AVL Trees");
  });

  await t.test("DELETE /api/v1/ct/plans/:id - deletes a CT plan", async () => {
    const listRes = await request(app)
      .get("/api/v1/ct/plans")
      .set(authHeader);

    const plan = listRes.body.plans[0];

    const delRes = await request(app)
      .delete(`/api/v1/ct/plans/${plan.id}`)
      .set(authHeader);

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.success, true);
  });
});
