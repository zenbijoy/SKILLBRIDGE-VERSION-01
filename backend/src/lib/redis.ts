import { Redis } from "ioredis";
import { env } from "../config/env.js";
export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  : new Redis({ lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on("error", () => undefined);
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (redis.status === "wait") await redis.connect();
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export async function cacheSet(key: string, value: unknown, ttl = 60) {
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    return;
  }
}
