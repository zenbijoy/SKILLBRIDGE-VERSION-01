import { Router } from "express";
import { admin } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";

export const health = Router();

health.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "skillbridge-api v2.0.1 is running",
  });
});

health.get("/ready", async (_req, res) => {
  const data: Record<string, string> = {
    api: "ok",
    database: env.SUPABASE_URL ? "unhealthy" : "unconfigured",
    redis: env.REDIS_URL ? "unhealthy" : "disabled",
    livekit: env.LIVEKIT_URL ? "enabled" : "disabled",
    firebase: "disabled", // Not configured in env.ts yet
    ai: env.AI_PROVIDER_URL ? "enabled" : "disabled",
  };

  if (env.SUPABASE_URL) {
    try {
      const { error } = await admin.from("profiles").select("id").limit(1);
      if (!error) {
        data.database = "enabled";
      }
    } catch (e) {
      data.database = "unhealthy";
    }
  }

  if (env.REDIS_URL) {
    try {
      if (redis.status === "ready" || redis.status === "connect") {
        data.redis = "enabled";
      } else {
        await redis.ping();
        data.redis = "enabled";
      }
    } catch (e) {
      data.redis = "unhealthy";
    }
  }

  const ok =
    data.api === "ok" &&
    (data.database === "enabled" || data.database === "unconfigured") &&
    (data.redis === "enabled" || data.redis === "disabled");

  res.status(ok ? 200 : 503).json({
    success: ok,
    data,
  });
});
