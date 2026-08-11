import { Request, Response, NextFunction } from "express";
import { RedisService } from "../services/RedisService.js";

export function redisRateLimit(opts: { windowSeconds: number; limit: number; keyPrefix?: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const prefix = opts.keyPrefix || req.baseUrl || "global";
    const key = `${prefix}:${ip}:${req.userId || "anon"}`;

    const { allowed, remaining, resetMs } = await RedisService.checkRateLimit(
      key,
      opts.limit,
      opts.windowSeconds
    );

    res.setHeader("RateLimit-Limit", String(opts.limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetMs / 1000)));

    if (!allowed) {
      res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfterMs: Math.max(0, resetMs - Date.now()),
      });
      return;
    }

    next();
  };
}
