import { Router } from "express";
import { admin } from "../lib/db.js";
import { env } from "../config/env.js";
import { RedisService } from "../services/RedisService.js";

export const health = Router();

health.get("/", (_req, res) => {
  res.json({
    success: true,
    status: "UP",
    version: "2.0.1",
    service: "skillbridge-api",
  });
});

health.get("/ready", async (_req, res) => {
  const services: Record<string, string> = {
    api: "ok",
    supabase: env.SUPABASE_URL ? "enabled" : "unconfigured",
    database: env.SUPABASE_URL ? "enabled" : "unconfigured",
    redis: RedisService.getStatus() === "UP" ? "enabled" : RedisService.getStatus() === "DEGRADED" ? "degraded" : "disabled",
    socketio: "enabled",
    storage: env.SUPABASE_URL ? "enabled" : "unconfigured",
    push: process.env.EXPO_ACCESS_TOKEN || process.env.ENABLE_PUSH_WORKER !== "false" ? "enabled" : "disabled",
    livekit: env.LIVEKIT_URL ? "enabled" : "disabled",
    firebase: "disabled",
    ai: env.AI_PROVIDER_URL ? "enabled" : "disabled",
  };

  if (env.SUPABASE_URL) {
    try {
      const { error } = await admin.from("profiles").select("id").limit(1);
      if (!error) {
        services.supabase = "enabled";
        services.database = "enabled";
      } else {
        services.supabase = "unhealthy";
        services.database = "unhealthy";
      }
    } catch {
      services.supabase = "unhealthy";
      services.database = "unhealthy";
    }
  }

  const isHealthy =
    services.api === "ok" &&
    (services.database === "enabled" || services.database === "unconfigured") &&
    (services.redis === "enabled" || services.redis === "disabled");

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? "UP" : "DEGRADED",
    data: services,
    services,
    redisMetrics: RedisService.getMetrics(),
  });
});
