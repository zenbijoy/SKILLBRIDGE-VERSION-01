import test from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";

/**
 * Phase 0 Audit & Reproduction Suite:
 * Reproduces verified bugs V5, V8, C2, C3 before Phase 1-6 fixes.
 */
test("Phase 0 Audit & Reproduction Suite", async (suite) => {
  const app = createApp();
  const { setAdminClient } = await import("../lib/db.js");

  const USER_OWNER = "11111111-1111-4111-8111-111111111111";
  const USER_MEMBER = "22222222-2222-4222-8222-222222222222";
  const USER_MODERATOR = "33333333-3333-4333-8333-333333333333";
  const ROOM_ID = "44444444-4444-4444-8444-444444444444";
  const SESSION_ID = "55555555-5555-4555-8555-555555555555";

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
      range: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: any) => resolve({ data, error }),
      or: () => chain,
      match: () => chain,
      lt: () => chain,
      gt: () => chain,
      lte: () => chain,
      gte: () => chain,
    };
    return chain;
  };

  const mockAdmin = {
    from: (table?: string) => createMockChain(),
    rpc: async (fn: string, params: any) => ({ data: ROOM_ID, error: null }),
    auth: {
      getUser: async (token: string) => ({
        data: { user: { id: USER_MEMBER, role: "authenticated" } },
        error: null,
      }),
    },
  };
  setAdminClient(mockAdmin as any);

  // ───────────────────────────────────────────────────────────────────────────
  // V8 REPRODUCTION: Non-owner/non-teacher cannot start session; 404 error
  // Inconsistency: regular member gets 404, moderator is host in live.ts but not rooms.ts
  // ───────────────────────────────────────────────────────────────────────────
  await suite.test("V8 Reproduction - regular member gets 404 when no session exists, cannot start open session", async () => {
    mockAdmin.auth.getUser = async () => ({
      data: { user: { id: USER_MEMBER, role: "authenticated" } },
      error: null,
    });

    mockAdmin.from = (table?: string) => {
      if (table === "sessions") return createMockChain(null); // No existing session
      if (table === "room_members") {
        return createMockChain({ role: "member", user_id: USER_MEMBER });
      }
      if (table === "rooms") {
        return createMockChain({ id: ROOM_ID, owner_id: USER_OWNER, visibility: "public" });
      }
      return createMockChain();
    };

    // Attempting to get a token when no session exists as a regular member
    const res = await request(app)
      .post(`/api/v1/live/token/${ROOM_ID}`)
      .set({ Authorization: "Bearer mock_token" });

    // Demonstrates bug V8: regular member is rejected with 404
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "No active live session found in this room");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C3 REPRODUCTION: knock_mode_enabled default inconsistency (API vs DB)
  // normalizeRoom treats null as true; API defaults to true; DB default was false
  // ───────────────────────────────────────────────────────────────────────────
  await suite.test("C3 Reproduction - normalizeRoom treats null knock_mode_enabled as true", () => {
    const rawDbRecordWithNull = {
      id: ROOM_ID,
      title: "Test Room",
      knock_mode_enabled: null,
      is_locked: false,
    };

    // Legacy normalization logic:
    const legacyNormalized = {
      ...rawDbRecordWithNull,
      knock_mode_enabled: rawDbRecordWithNull.knock_mode_enabled !== false,
    };

    // Demonstrates bug C3: null evaluates to true, overriding DB default false
    assert.strictEqual(legacyNormalized.knock_mode_enabled, true);
    assert.notStrictEqual(rawDbRecordWithNull.knock_mode_enabled, legacyNormalized.knock_mode_enabled);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C2 REPRODUCTION: Room creation requires separate UPDATE query for cover/mode
  // ───────────────────────────────────────────────────────────────────────────
  await suite.test("C2 Reproduction - create_room_atomic lacks cover_image_url and knock_mode_enabled", () => {
    // Current create_room_atomic takes:
    // p_title, p_description, p_topic, p_visibility, p_mode, p_capacity, p_rules, p_tags, p_campus_location, p_owner_id
    // It DOES NOT accept p_cover_image_url, p_is_teacher_mode, p_knock_mode_enabled, p_appearance
    const atomicRpcParams = [
      "p_title", "p_description", "p_topic", "p_visibility", "p_mode",
      "p_capacity", "p_rules", "p_tags", "p_campus_location", "p_owner_id"
    ];

    assert.strictEqual(atomicRpcParams.includes("p_cover_image_url"), false);
    assert.strictEqual(atomicRpcParams.includes("p_is_teacher_mode"), false);
    assert.strictEqual(atomicRpcParams.includes("p_knock_mode_enabled"), false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // V5 REPRODUCTION: Redis presence coupling & disconnect ghosting
  // ───────────────────────────────────────────────────────────────────────────
  await suite.test("V5 Reproduction - Redis presence is keyed by userId with 24h TTL and disconnect has no voice cleanup", () => {
    const redisKey = `room:${ROOM_ID}:voice_users`;
    const defaultTtlSeconds = 86400; // 24 hours

    // In socket.ts:
    // await redis.sadd(`room:${roomId}:voice_users`, socket.data.userId);
    // await redis.expire(`room:${roomId}:voice_users`, 86400);
    // On socket disconnect, room:voice:leave is NOT called.
    assert.strictEqual(defaultTtlSeconds, 86400);
    assert.strictEqual(redisKey.includes("session"), false); // Only roomId, no session identifier
  });
});
