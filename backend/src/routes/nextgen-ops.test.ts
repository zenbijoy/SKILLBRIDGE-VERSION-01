import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { userOrIpKey } from "../middleware/rateLimiters.js";
import { getDeterministicCacheKey, shouldBypassCache } from "../lib/edgeCache.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { isWithinQuietHours } from "../services/push.js";

test("Next-Gen Phase 3 Operations & Edge Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);

  // 1. Health Probes
  await t.test("GET /health/live - responds with status ok and uptime", async () => {
    const res = await request.get("/health/live");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, "ok");
    assert.ok(typeof res.body.uptime === "number");
  });

  await t.test("GET /api/v1/health/live - responds with status ok", async () => {
    const res = await request.get("/api/v1/health/live");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, "ok");
  });

  await t.test("GET /health/ready - returns storage and edge provider metadata", async () => {
    const res = await request.get("/health/ready");
    assert.ok(res.body.data);
    assert.ok(res.body.data.storage);
    assert.strictEqual(res.body.data.edgeGateway, "supported");
    assert.ok(res.body.storage);
    assert.ok(typeof res.body.storage.activeProvider === "string");
  });

  // 2. Multi-tier Campus NAT Rate Limiter Key Generator
  await t.test("userOrIpKey - prioritizes authenticated userId over IP to prevent NAT throttling", () => {
    const keyGen = userOrIpKey("feed");

    const fakeAuthReq = {
      userId: "11111111-2222-3333-4444-555555555555",
      ip: "103.100.20.5", // Shared campus WiFi gateway IP
    } as any;

    const key = keyGen(fakeAuthReq);
    assert.strictEqual(key, "feed:u:11111111-2222-3333-4444-555555555555");

    const fakeAnonReq = {
      ip: "103.100.20.5",
    } as any;

    const anonKey = keyGen(fakeAnonReq);
    assert.strictEqual(anonKey, "feed:ip:103.100.20.5");
  });

  // 3. Cloudflare Edge Cache Key & Bypass Logic
  await t.test("Edge Cache - produces deterministic sorted query parameter keys", () => {
    const url1 = new URL("https://edge.skillbridge.app/api/v1/rooms?sort=popular&limit=20&page=1");
    const url2 = new URL("https://edge.skillbridge.app/api/v1/rooms?page=1&limit=20&sort=popular");

    const key1 = getDeterministicCacheKey(url1);
    const key2 = getDeterministicCacheKey(url2);

    assert.strictEqual(key1, key2);
    assert.strictEqual(key1, "/api/v1/rooms?limit=20&page=1&sort=popular");
  });

  await t.test("Edge Cache - strictly bypasses authenticated requests and mutations", () => {
    const publicUrl = new URL("https://edge.skillbridge.app/api/v1/rooms");
    const publicGetReq = new Request(publicUrl.toString(), { method: "GET" });
    assert.strictEqual(shouldBypassCache(publicGetReq, publicUrl), false);

    // Bypasses POST
    const publicPostReq = new Request(publicUrl.toString(), { method: "POST" });
    assert.strictEqual(shouldBypassCache(publicPostReq, publicUrl), true);

    // Bypasses Authorization header
    const authReq = new Request(publicUrl.toString(), {
      method: "GET",
      headers: { Authorization: "Bearer test-jwt" },
    });
    assert.strictEqual(shouldBypassCache(authReq, publicUrl), true);

    // Bypasses private feed route
    const feedUrl = new URL("https://edge.skillbridge.app/api/v1/feed");
    const feedReq = new Request(feedUrl.toString(), { method: "GET" });
    assert.strictEqual(shouldBypassCache(feedReq, feedUrl), true);

    // Bypasses admin route
    const adminUrl = new URL("https://edge.skillbridge.app/api/v1/admin/telemetry");
    const adminReq = new Request(adminUrl.toString(), { method: "GET" });
    assert.strictEqual(shouldBypassCache(adminReq, adminUrl), true);
  });

  // 4. Domain Event Logger
  await t.test("logDomainEvent - executes without throwing across all Next-Gen events", () => {
    assert.doesNotThrow(() => {
      logDomainEvent({
        event: "question_created",
        roomId: "00000000-0000-0000-0000-000000000001",
        questionId: "00000000-0000-0000-0000-000000000002",
        isAnonymous: false,
      });

      logDomainEvent({
        event: "clash_detected",
        sourceClubId: "00000000-0000-0000-0000-000000000003",
        conflictingClubId: "00000000-0000-0000-0000-000000000004",
        severity: "critical",
        overlapStart: new Date().toISOString(),
        overlapEnd: new Date(Date.now() + 3600000).toISOString(),
      });

      logDomainEvent({
        event: "storage_fallback_used",
        operation: "upload",
        bucket: "resources",
        originalProvider: "r2",
        fallbackProvider: "supabase",
      });
    });
  });

  // 5. Quiet-Hours Utility
  await t.test("isWithinQuietHours - accurately evaluates time ranges", () => {
    // 23:00 UTC is within 22:00-07:00 window
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T23:00:00Z"), "22:00", "07:00", "UTC"), true);

    // 12:00 UTC is outside 22:00-07:00 window
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T12:00:00Z"), "22:00", "07:00", "UTC"), false);

    // Equal start and end behaves as disabled
    assert.strictEqual(isWithinQuietHours(new Date("2026-08-20T12:00:00Z"), "12:00", "12:00", "UTC"), false);
  });

  // 6. Moderation Endpoint
  await t.test("POST /api/v1/moderation/report - rejects unauthenticated requests", async () => {
    const res = await request.post("/api/v1/moderation/report").send({
      target_type: "post",
      target_id: "00000000-0000-0000-0000-000000000001",
      reason: "Inappropriate language on campus wall",
    });
    assert.strictEqual(res.status, 401);
  });

  // 7. Next-Gen Admin Control Plane Endpoints
  await t.test("GET /api/v1/admin/nextgen/telemetry - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/admin/nextgen/telemetry");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/admin/nextgen/providers - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/admin/nextgen/providers");
    assert.strictEqual(res.status, 401);
  });
});
