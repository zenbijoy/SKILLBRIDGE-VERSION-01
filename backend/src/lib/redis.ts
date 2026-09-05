import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn({ event: "redis_reconnect_exhausted", attempt: times }, "Redis max reconnect attempts reached; stopping retries");
          return null;
        }
        const delay = Math.min(times * 200, 1000);
        logger.info({ event: "redis_reconnect", attempt: times, delayMs: delay }, "Scheduling Redis reconnect attempt");
        return delay;
      },
    })
  : null;

if (redis) {
  redis.on("error", (err: Error) => {
    logger.warn({ event: "redis_unavailable", err: err?.message || "Unknown error" }, "Redis connection error");
  });
  redis.on("connect", () => {
    logger.info({ event: "redis_connected" }, "Redis socket connected");
  });
  redis.on("ready", () => {
    logger.info({ event: "redis_ready" }, "Redis ready to process commands");
  });
  redis.on("close", () => {
    logger.debug({ event: "redis_closed" }, "Redis connection closed");
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready" && redis.status !== "connect") return null;
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch (err) {
    logger.warn({ event: "redis_cache_get_failed", key, err: (err as Error).message }, "Redis cache get failed, returning null");
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = 60): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready" && redis.status !== "connect") return;
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn({ event: "redis_cache_set_failed", key, err: (err as Error).message }, "Redis cache set failed");
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready" && redis.status !== "connect") return;
    await redis.del(key);
  } catch (err) {
    logger.warn({ event: "redis_cache_del_failed", key, err: (err as Error).message }, "Redis cache del failed");
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    if (redis.status !== "ready" && redis.status !== "connect") return;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.warn({ event: "redis_cache_del_pattern_failed", pattern, err: (err as Error).message }, "Redis pattern deletion failed");
  }
}

