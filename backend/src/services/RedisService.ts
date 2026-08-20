import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";

export class RedisService {
  static getStatus(): "UP" | "DEGRADED" | "DOWN" {
    if (!env.REDIS_URL) return "DOWN";
    if (redis.status === "ready" || redis.status === "connect") return "UP";
    if (redis.status === "connecting" || redis.status === "reconnecting" || redis.status === "wait") return "DEGRADED";
    return "DOWN";
  }

  static getMetrics() {
    return {
      status: redis.status,
      configured: Boolean(env.REDIS_URL),
    };
  }
}
