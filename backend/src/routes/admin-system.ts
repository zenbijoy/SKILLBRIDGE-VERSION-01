import { Router } from "express";
import { performance } from "node:perf_hooks";
import { admin as db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { RedisService } from "../services/RedisService.js";
import { getAuthFailureMetrics, requireRole } from "../middleware/auth.js";
import { wrap } from "../middleware/error.js";
import { env } from "../config/env.js";

export const adminSystemRoutes = Router();

// Only administrators can view full system health diagnostics
adminSystemRoutes.get(
  "/status",
  requireRole("admin"),
  wrap(async (_req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const startedAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();
    const isRecentRestart = uptimeSeconds < 300; // Under 5 minutes

    // 1. Measure DB round-trip latency
    let dbStatus: "operational" | "degraded" | "unconfigured" = env.SUPABASE_URL ? "operational" : "unconfigured";
    let dbLatencyMs: number | null = null;
    let dbErrorMsg: string | null = null;

    if (env.SUPABASE_URL) {
      try {
        const start = performance.now();
        const { error } = await db.from("profiles").select("id", { head: true }).limit(1);
        dbLatencyMs = Math.round(performance.now() - start);
        if (error) {
          dbStatus = "degraded";
          dbErrorMsg = error.message;
        }
      } catch (err: any) {
        dbStatus = "degraded";
        dbErrorMsg = err?.message || "Failed to query database";
      }
    }

    // 2. Measure Redis status and ping latency
    const redisStatus = RedisService.getStatus();
    let redisLatencyMs: number | null = null;
    if (redis && (redisStatus === "UP" || redis.status === "ready")) {
      try {
        const start = performance.now();
        await redis.ping();
        redisLatencyMs = Math.round(performance.now() - start);
      } catch {
        // Non-fatal, keep null latency
      }
    }

    // 3. Process memory stats in MB
    const memoryUsageRaw = process.memoryUsage();
    const memory = {
      rssMB: Number((memoryUsageRaw.rss / (1024 * 1024)).toFixed(1)),
      heapTotalMB: Number((memoryUsageRaw.heapTotal / (1024 * 1024)).toFixed(1)),
      heapUsedMB: Number((memoryUsageRaw.heapUsed / (1024 * 1024)).toFixed(1)),
      externalMB: Number((memoryUsageRaw.external / (1024 * 1024)).toFixed(1)),
    };

    // 4. Auth failures & degradation
    const authMetrics = await getAuthFailureMetrics();

    // 5. Service status summaries
    const services = {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        error: dbErrorMsg,
      },
      redis: {
        status: redisStatus === "UP" ? "operational" : redisStatus === "DEGRADED" ? "degraded" : "disabled",
        latencyMs: redisLatencyMs,
        metrics: RedisService.getMetrics(),
      },
      auth: {
        status: authMetrics.isAuthDegraded ? "degraded" : "operational",
        failuresLast5Min: authMetrics.count,
        failuresPerMinute: authMetrics.failuresPerMinute,
        isAuthDegraded: authMetrics.isAuthDegraded,
      },
      socketio: {
        status: "operational",
      },
      push: {
        status: env.EXPO_PUSH_ACCESS_TOKEN ? "configured" : "unconfigured",
      },
      livekit: {
        status: (env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) ? "configured" : "unconfigured",
      },
      ai: {
        status: (env.AI_PROVIDER_URL && env.AI_PROVIDER_API_KEY) ? "configured" : "unconfigured",
      },
    };

    // 6. Plain-English issues compilation
    const issues: string[] = [];

    if (services.database.status === "degraded") {
      issues.push(`Database connection is degraded: ${dbErrorMsg || "error executing health query"}`);
    } else if (dbLatencyMs !== null && dbLatencyMs > 500) {
      issues.push(`Database latency is elevated (${dbLatencyMs}ms > 500ms threshold)`);
    }

    if (env.REDIS_URL && services.redis.status !== "operational") {
      issues.push(`Redis cache is degraded or disconnected (status: ${services.redis.status})`);
    } else if (redisLatencyMs !== null && redisLatencyMs > 100) {
      issues.push(`Redis latency is elevated (${redisLatencyMs}ms > 100ms threshold)`);
    }

    if (authMetrics.isAuthDegraded) {
      issues.push(`Authentication failure rate elevated (${authMetrics.failuresPerMinute}/min > 20/min threshold)`);
    }

    if (services.livekit.status === "unconfigured") {
      issues.push("LiveKit video calling infrastructure is not configured (missing URL or API credentials)");
    }

    if (services.push.status === "unconfigured") {
      issues.push("Expo push notification delivery is not configured (missing access token)");
    }

    if (uptimeSeconds < 60) {
      issues.push(`Server restarted recently (${uptimeSeconds}s ago)`);
    }

    if (memory.rssMB > 512) {
      issues.push(`Server memory consumption is elevated (RSS: ${memory.rssMB} MB)`);
    }

    res.json({
      timestamp: new Date().toISOString(),
      server: {
        uptimeSeconds,
        startedAt,
        isRecentRestart,
        nodeVersion: process.version,
        environment: env.NODE_ENV,
      },
      memory,
      rateLimit: {
        globalLimitPerMinute: env.GLOBAL_RATE_LIMIT_PER_MINUTE,
      },
      services,
      issues,
      healthy: issues.length === 0,
    });
  }),
);
