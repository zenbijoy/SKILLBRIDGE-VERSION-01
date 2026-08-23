import { redis, cacheGet, cacheSet, cacheDel, cacheDelPattern } from "../lib/redis.js";
import { env } from "../config/env.js";

export class RedisService {
  static getStatus(): "UP" | "DEGRADED" | "DOWN" {
    if (!env.REDIS_URL || !redis) return "DOWN";
    if (redis.status === "ready" || redis.status === "connect") return "UP";
    if (redis.status === "connecting" || redis.status === "reconnecting" || redis.status === "wait") return "DEGRADED";
    return "DOWN";
  }

  static getMetrics() {
    return {
      status: redis?.status ?? "disabled",
      configured: Boolean(env.REDIS_URL),
    };
  }

  /**
   * Cache-aside wrapper: Returns cached value or executes fetcher, caching result for `ttlSeconds`
   */
  static async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await cacheGet<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      await cacheSet(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  /**
   * Set user online presence with 45s heartbeat TTL
   */
  static async setPresence(userId: string, ttlSeconds = 45): Promise<void> {
    await cacheSet(`presence:${userId}`, { online: true, lastSeen: Date.now() }, ttlSeconds);
  }

  /**
   * Check if a user is currently online in Redis
   */
  static async isOnline(userId: string): Promise<boolean> {
    const data = await cacheGet<{ online: boolean }>(`presence:${userId}`);
    return Boolean(data?.online);
  }

  /**
   * Invalidate feed caches
   */
  static async invalidateFeed(): Promise<void> {
    await cacheDelPattern("feed:*");
  }
}
