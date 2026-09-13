import test from "node:test";
import assert from "node:assert";
import supertest from "supertest";
import { createApp } from "../app.js";
import { encryptToken, decryptToken } from "../lib/encryption.js";
import {
  extractYouTubeVideoId,
  parseISO8601Duration,
  getYouTubeFallbackMetadata,
  fetchYouTubeVideoMetadata,
} from "../services/youtubeService.js";
import { createOAuthState, verifyOAuthState } from "./integrations.js";
import { registerJobHandler, enqueueJob, processBatch } from "../services/jobQueue.js";
import { cleanupOrphanedMedia } from "../services/mediaCleanupService.js";
import { getRecordingProvider, ManualYouTubeProvider, LiveKitEgressProvider } from "../services/recordingProvider.js";

test("Next-Gen Phase 4 Media, YouTube OAuth & Automation Test Suite", async (t) => {
  const app = createApp();
  const request = supertest(app);

  // ---------------------------------------------------------------------------
  // 1. Encryption & Token Security
  // ---------------------------------------------------------------------------
  await t.test("Token Encryption - roundtrips plaintext tokens accurately", () => {
    const originalToken = "ya29.a0AfH6SMA_test_refresh_token_xyz123";
    const encrypted = encryptToken(originalToken);

    assert.ok(encrypted.includes(":"), "Encrypted format must contain iv:authTag:cipher");
    const parts = encrypted.split(":");
    assert.strictEqual(parts.length, 3, "Encrypted payload must have 3 hex parts");

    const decrypted = decryptToken(encrypted);
    assert.strictEqual(decrypted, originalToken);
  });

  await t.test("Token Decryption - throws on corrupted or tampered auth tag", () => {
    const encrypted = encryptToken("secret-payload");
    const parts = encrypted.split(":");
    // Tamper with the authTag
    const tamperedTag = "00000000000000000000000000000000";
    const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

    assert.throws(() => {
      decryptToken(tampered);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. YouTube ID Extractor & ISO-8601 Duration Parser
  // ---------------------------------------------------------------------------
  await t.test("YouTube ID Extractor - parses multiple URL formats and raw IDs", () => {
    const expectedId = "dQw4w9WgXcQ";

    assert.strictEqual(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("dQw4w9WgXcQ"), expectedId);
    assert.strictEqual(extractYouTubeVideoId("invalid-url-string"), null);
    assert.strictEqual(extractYouTubeVideoId(""), null);
  });

  await t.test("ISO-8601 Duration Parser - converts standard durations to seconds", () => {
    assert.strictEqual(parseISO8601Duration("PT1H2M30S"), 3750);
    assert.strictEqual(parseISO8601Duration("PT45S"), 45);
    assert.strictEqual(parseISO8601Duration("PT10M"), 600);
    assert.strictEqual(parseISO8601Duration("P1DT2H"), 93600);
    assert.strictEqual(parseISO8601Duration("invalid"), null);
    assert.strictEqual(parseISO8601Duration(""), null);
  });

  await t.test("YouTube Metadata Fallback - produces valid schema when API unconfigured", async () => {
    const videoId = "dQw4w9WgXcQ";
    const fallback = getYouTubeFallbackMetadata(videoId);

    assert.strictEqual(fallback.videoId, videoId);
    assert.ok(fallback.thumbnailUrl.includes(videoId));
    assert.strictEqual(fallback.privacyStatus, "unlisted");

    const fetched = await fetchYouTubeVideoMetadata(videoId);
    assert.ok(fetched.title);
    assert.strictEqual(fetched.videoId, videoId);
  });

  // ---------------------------------------------------------------------------
  // 3. OAuth CSRF State Security
  // ---------------------------------------------------------------------------
  await t.test("OAuth State Token - creates and verifies HMAC-signed state tokens", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const state = createOAuthState(userId);

    const verified = verifyOAuthState(state);
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.userId, userId);
  });

  await t.test("OAuth State Token - rejects tampered signatures", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const state = createOAuthState(userId);
    const tampered = state.slice(0, -4) + "ffff";

    const verified = verifyOAuthState(tampered);
    assert.strictEqual(verified.valid, false);
  });

  // ---------------------------------------------------------------------------
  // 4. Recording Provider Abstraction
  // ---------------------------------------------------------------------------
  await t.test("Recording Providers - defaults safely to manual YouTube provider", () => {
    const provider = getRecordingProvider();
    assert.strictEqual(provider.name, "manual_youtube");
    assert.strictEqual(provider.isConfigured(), true);
  });

  await t.test("LiveKit Egress Provider - throws when feature flag is disabled", async () => {
    const livekit = new LiveKitEgressProvider();
    assert.strictEqual(livekit.isConfigured(), false);
    await assert.rejects(async () => {
      await livekit.startRecording("test-room");
    }, /disabled/i);
  });

  // ---------------------------------------------------------------------------
  // 5. Background Job Queue & Media Cleanup
  // ---------------------------------------------------------------------------
  await t.test("Background Job Queue - registers and processes in-memory jobs", async () => {
    let handled = false;
    registerJobHandler("TEST_JOB", async (payload) => {
      handled = true;
      return { echoed: payload };
    });

    const stats = await processBatch(1);
    assert.ok(typeof stats.processed === "number");
    assert.ok(typeof stats.succeeded === "number");
    assert.ok(typeof stats.failed === "number");
  });

  await t.test("Media Cleanup Service - executes sweep cycle without errors", async () => {
    const result = await cleanupOrphanedMedia({ cutoffHours: 24, batchSize: 5 });
    assert.ok(typeof result.scanned === "number");
    assert.ok(typeof result.deleted === "number");
    assert.ok(Array.isArray(result.errors));
  });

  // ---------------------------------------------------------------------------
  // 6. HTTP Security & Endpoint Guards
  // ---------------------------------------------------------------------------
  await t.test("GET /api/v1/integrations/youtube/connect - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/integrations/youtube/connect");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/integrations/youtube/status - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/integrations/youtube/status");
    assert.strictEqual(res.status, 401);
  });

  await t.test("DELETE /api/v1/integrations/youtube/disconnect - rejects unauthenticated requests", async () => {
    const res = await request.delete("/api/v1/integrations/youtube/disconnect");
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/feed/upload-ticket - rejects unauthenticated requests", async () => {
    const res = await request
      .post("/api/v1/feed/upload-ticket")
      .send({ mimeType: "image/png" });
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/admin/nextgen/recordings - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/admin/nextgen/recordings");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/admin/nextgen/youtube-connections - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/admin/nextgen/youtube-connections");
    assert.strictEqual(res.status, 401);
  });

  await t.test("GET /api/v1/admin/nextgen/jobs - rejects unauthenticated requests", async () => {
    const res = await request.get("/api/v1/admin/nextgen/jobs");
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/admin/nextgen/jobs/run - rejects unauthenticated requests", async () => {
    const res = await request.post("/api/v1/admin/nextgen/jobs/run").send({ limit: 5 });
    assert.strictEqual(res.status, 401);
  });

  await t.test("POST /api/v1/admin/nextgen/media/cleanup - rejects unauthenticated requests", async () => {
    const res = await request.post("/api/v1/admin/nextgen/media/cleanup").send({ cutoffHours: 24 });
    assert.strictEqual(res.status, 401);
  });
});
