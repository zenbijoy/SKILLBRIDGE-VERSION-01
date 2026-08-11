import { Redis } from "ioredis";

export type RedisStatus = "UP" | "DEGRADED" | "DISABLED";

class RedisServiceManager {
  private client: Redis | null = null;
  private status: RedisStatus = "DISABLED";
  private hits = 0;
  private misses = 0;
  private errors = 0;
  private singleFlightLocks = new Map<string, Promise<any>>();
  private memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    this.init();
  }

  private init() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log("[RedisService] REDIS_URL not set. Running in DISABLED mode (Graceful DB Fallback).");
      this.status = "DISABLED";
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.status = "DEGRADED";
            return null;
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.client.on("connect", () => {
        console.log("[RedisService] Connected to Redis acceleration layer.");
        this.status = "UP";
      });

      this.client.on("ready", () => {
        this.status = "UP";
      });

      this.client.on("error", (err: any) => {
        this.errors++;
        if (this.status !== "DISABLED") {
          console.warn("[RedisService] Redis error (Degraded fallback active):", err?.message || err);
          this.status = "DEGRADED";
        }
      });
    } catch (err: any) {
      console.warn("[RedisService] Failed to initialize Redis client:", err?.message || err);
      this.status = "DISABLED";
    }
  }

  public getStatus(): RedisStatus {
    return this.status;
  }

  public getMetrics() {
    return {
      status: this.status,
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
    };
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.status !== "UP" || !this.client) {
      this.misses++;
      return null;
    }
    try {
      const data = await this.client.get(key);
      if (!data) {
        this.misses++;
        return null;
      }
      this.hits++;
      return JSON.parse(data) as T;
    } catch {
      this.errors++;
      return null;
    }
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (this.status !== "UP" || !this.client) return;
    try {
      const stringified = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, stringified, "EX", ttlSeconds);
      } else {
        await this.client.set(key, stringified);
      }
    } catch {
      this.errors++;
    }
  }

  public async del(key: string): Promise<void> {
    if (this.status !== "UP" || !this.client) return;
    try {
      await this.client.del(key);
    } catch {
      this.errors++;
    }
  }

  public async invalidatePattern(pattern: string): Promise<void> {
    if (this.status !== "UP" || !this.client) return;
    try {
      const stream = this.client.scanStream({ match: pattern, count: 100 });
      stream.on("data", (keys: string[]) => {
        if (keys.length && this.client) {
          const pipeline = this.client.pipeline();
          keys.forEach((key) => pipeline.del(key));
          pipeline.exec().catch(() => {});
        }
      });
    } catch {
      this.errors++;
    }
  }

  public async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const freshData = await fetchFn();
    if (freshData !== null && freshData !== undefined) {
      await this.set(key, freshData, ttlSeconds);
    }
    return freshData;
  }

  public async singleFlight<T>(lockKey: string, fetchFn: () => Promise<T>, ttlSeconds: number): Promise<T> {
    if (this.singleFlightLocks.has(lockKey)) {
      return this.singleFlightLocks.get(lockKey);
    }

    const promise = (async () => {
      try {
        return await this.getOrSet(lockKey, fetchFn, ttlSeconds);
      } finally {
        this.singleFlightLocks.delete(lockKey);
      }
    })();

    this.singleFlightLocks.set(lockKey, promise);
    return promise;
  }

  public async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const now = Date.now();
    const redisKey = `ratelimit:${key}`;

    if (this.status === "UP" && this.client) {
      try {
        const current = await this.client.incr(redisKey);
        if (current === 1) {
          await this.client.expire(redisKey, windowSeconds);
        }
        const ttl = await this.client.ttl(redisKey);
        const resetMs = now + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000);
        return {
          allowed: current <= limit,
          remaining: Math.max(0, limit - current),
          resetMs,
        };
      } catch {
        this.errors++;
      }
    }

    let record = this.memoryRateLimitMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowSeconds * 1000 };
      this.memoryRateLimitMap.set(key, record);
    } else {
      record.count++;
    }

    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      resetMs: record.resetAt,
    };
  }
}

export const RedisService = new RedisServiceManager();
