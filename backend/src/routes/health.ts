import { Router } from "express";
import { admin } from "../lib/db.js";
import { env } from "../config/env.js";
import { RedisService } from "../services/RedisService.js";

export const health = Router();

// Liveness Probe (GET /health and GET /api/v1/health)
// Rapidly tells Render/Docker that the Node process is running
health.get("/", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "skillbridge-api",
    version: "2.0.1",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness Probe (GET /health/ready and GET /api/v1/health/ready)
// Verifies external service connectivity without coupling to private user data
health.get("/ready", async (_req, res) => {
  let supabaseStatus = env.SUPABASE_URL ? "unhealthy" : "unconfigured";

  if (env.SUPABASE_URL) {
    try {
      // Safe, dedicated health probe avoiding private user data in profiles
      const { data, error } = await admin.rpc("health_check");
      if (!error && (data?.status === "healthy" || data?.status === "ok")) {
        supabaseStatus = "healthy";
      } else if (error?.code === "PGRST202" || error?.code === "42501") {
        // PostgREST and PostgreSQL are reachable and returned a database engine response
        supabaseStatus = "healthy";
      } else {
        supabaseStatus = "unhealthy";
      }
    } catch {
      supabaseStatus = "unhealthy";
    }
  }

  const rawRedisStatus = RedisService.getStatus();
  const redisStatus =
    rawRedisStatus === "UP"
      ? "healthy"
      : rawRedisStatus === "DEGRADED"
        ? "degraded"
        : env.REDIS_URL
          ? "degraded"
          : "disabled";

  const servicesData: Record<string, string> = {
    api: "healthy",
    supabase: supabaseStatus,
    database: supabaseStatus,
    redis: redisStatus,
    socketio: "healthy",
    storage: supabaseStatus,
    push: env.EXPO_PUSH_ACCESS_TOKEN ? "enabled" : "disabled",
    livekit: env.LIVEKIT_URL ? "enabled" : "disabled",
    firebase: "disabled",
    ai: env.AI_PROVIDER_URL ? "enabled" : "disabled",
  };

  // Supabase is critical. Redis is optional when REDIS_REQUIRED=false
  const isHealthy =
    servicesData.api === "healthy" &&
    servicesData.supabase === "healthy" &&
    (!env.REDIS_REQUIRED || servicesData.redis === "healthy");

  const overallStatus = isHealthy
    ? servicesData.redis === "degraded"
      ? "ready_degraded_cache"
      : "ready"
    : "unhealthy";

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: overallStatus,
    data: servicesData,
    services: servicesData,
    redisMetrics: RedisService.getMetrics(),
    timestamp: new Date().toISOString(),
  });
});

