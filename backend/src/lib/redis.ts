import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
    })
  : null;

if (redis) {
  redis.on("error", () => undefined);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = 60): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    return;
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.del(key);
  } catch {
    return;
  }
}

