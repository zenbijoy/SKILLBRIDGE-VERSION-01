import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { setAdminClient } from "../lib/db.js";

test("Research Real-Time Papers API Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);
  const mockUserId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const authHeader = { Authorization: "Bearer valid_mock_token" };

  const mockAdmin: any = {
    auth: {
      getUser: async () => ({
        data: { user: { id: mockUserId, email: "researcher@test.edu" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        upsert: () => chain,
        eq: () => chain,
        neq: () => chain,
        maybeSingle: async () => {
          if (table === "profiles") {
            return {
              data: {
                id: mockUserId,
                full_name: "Research Scholar",
                username: "scholar",
                account_status: "active",
                roles: ["student", "researcher"],
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        single: async () => ({ data: null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  };

  setAdminClient(mockAdmin);

  await t.test("GET /api/v1/research/papers/latest - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/research/papers/latest");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/research/papers/sources - returns available academic paper sources", async () => {
    const res = await request.get("/api/v1/research/papers/sources").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.sources));
    assert.ok(res.body.sources.some((s: any) => s.id === "arxiv"));
    assert.ok(res.body.sources.some((s: any) => s.id === "openalex"));
    assert.ok(res.body.sources.some((s: any) => s.id === "doaj"));
  });

  await t.test("GET /api/v1/research/papers/latest - returns latest preprints for AI & Machine Learning", async () => {
    const res = await request
      .get("/api/v1/research/papers/latest?discipline=AI%20%26%20Machine%20Learning")
      .set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
    assert.strictEqual(res.body.discipline, "AI & Machine Learning");
  });

  await t.test("GET /api/v1/research/papers/latest - handles other disciplines with fallback", async () => {
    const res = await request
      .get("/api/v1/research/papers/latest?discipline=Computer%20Science")
      .set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });

  await t.test("GET /api/v1/research/papers/:paperId - routes 'latest' parameter defensively", async () => {
    const res = await request.get("/api/v1/research/papers/latest").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  await t.test("GET /api/v1/research/papers/:paperId - routes 'sources' parameter defensively", async () => {
    const res = await request.get("/api/v1/research/papers/sources").set(authHeader);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.sources));
  });
});
