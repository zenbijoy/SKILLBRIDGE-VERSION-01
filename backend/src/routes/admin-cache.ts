import { Router } from "express";
import { z } from "zod";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { cacheDelPattern } from "../lib/redis.js";

export const adminCacheRoutes = Router();

const cacheTargetSchema = z.object({
  target: z.enum(["dashboard", "catalog", "rooms"]),
  reason: z.string().trim().min(3).max(300),
});

adminCacheRoutes.post(
  "/clear",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { target, reason } = cacheTargetSchema.parse(req.body);

    let pattern = "";
    if (target === "dashboard") pattern = "dashboard:*";
    else if (target === "catalog") pattern = "catalog:*";
    else if (target === "rooms") pattern = "rooms:*";

    await cacheDelPattern(pattern);

    await audit(req.userId!, "admin.cache.clear", "cache", target, {
      namespace: target,
      pattern,
      reason,
    });

    res.json({
      success: true,
      target,
      clearedPattern: pattern,
      clearedAt: new Date().toISOString(),
    });
  }),
);
