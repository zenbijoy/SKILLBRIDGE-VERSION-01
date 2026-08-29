import type { NextFunction, Request, Response } from "express";
import { admin } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { requestContext } from "../lib/context.js";
import { logger } from "../lib/logger.js";

const AUTH_FAILURE_METRICS_KEY = "metrics:auth_failures";
const AUTH_FAILURE_WINDOW_SECONDS = 300; // 5 minutes
const AUTH_DEGRADED_FAILURES_PER_MINUTE = 20;

let inMemoryAuthFailures: number[] = [];

export async function recordAuthFailure(): Promise<void> {
  const now = Date.now();
  inMemoryAuthFailures.push(now);
  // Clean up in-memory timestamps older than window
  const windowStart = now - AUTH_FAILURE_WINDOW_SECONDS * 1000;
  inMemoryAuthFailures = inMemoryAuthFailures.filter((t) => t >= windowStart);

  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const count = await redis.incr(AUTH_FAILURE_METRICS_KEY);
      if (count === 1) {
        await redis.expire(AUTH_FAILURE_METRICS_KEY, AUTH_FAILURE_WINDOW_SECONDS);
      }
    } catch {
      // Non-blocking telemetry failure
    }
  }
}

export async function getAuthFailureMetrics(): Promise<{
  count: number;
  failuresPerMinute: number;
  isAuthDegraded: boolean;
  windowSeconds: number;
}> {
  const now = Date.now();
  const windowStart = now - AUTH_FAILURE_WINDOW_SECONDS * 1000;
  inMemoryAuthFailures = inMemoryAuthFailures.filter((t) => t >= windowStart);
  let count = inMemoryAuthFailures.length;

  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const redisVal = await redis.get(AUTH_FAILURE_METRICS_KEY);
      if (redisVal !== null) {
        const parsed = parseInt(redisVal, 10);
        if (!isNaN(parsed)) {
          count = parsed;
        }
      }
    } catch {
      // Fallback to in-memory counter
    }
  }

  const failuresPerMinute = Number((count / (AUTH_FAILURE_WINDOW_SECONDS / 60)).toFixed(1));
  const isAuthDegraded = failuresPerMinute > AUTH_DEGRADED_FAILURES_PER_MINUTE;

  return {
    count,
    failuresPerMinute,
    isAuthDegraded,
    windowSeconds: AUTH_FAILURE_WINDOW_SECONDS,
  };
}

export async function resetAuthFailureMetrics(): Promise<void> {
  inMemoryAuthFailures = [];
  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      await redis.del(AUTH_FAILURE_METRICS_KEY);
    } catch {
      // Non-blocking
    }
  }
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  if (req.originalUrl === "/api/v1/admin/bootstrap/status") {
    return next();
  }
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    void recordAuthFailure();
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = h.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    void recordAuthFailure();
    return res.status(401).json({ error: "Invalid session" });
  }
  req.userId = data.user.id;
  req.accessToken = token;
  requestContext.setUserId(data.user.id);
  const [
    profileResult,
    adminResult
  ] = await Promise.all([
    admin.from("profiles").select("roles, account_status").eq("id", data.user.id).maybeSingle(),
    admin.from("admin_accounts").select("role, status, must_change_credentials, mfa_required").eq("user_id", data.user.id).maybeSingle()
  ]);

  const p = profileResult?.data;
  const pError = profileResult?.error;
  const adminData = adminResult?.data;

  if (pError) {
    return res.status(503).json({ error: "Failed to verify account status, please retry" });
  }

  if (p) {
    if (p.account_status === "suspended" || p.account_status === "banned") {
      void recordAuthFailure();
      return res.status(403).json({ error: `Account is ${p.account_status}` });
    }
    if (p.account_status === "deactivated") {
      if (!req.originalUrl.endsWith("/account/reactivate")) {
        void recordAuthFailure();
        return res.status(403).json({ error: "Account is deactivated. Reactivation required." });
      }
    }
  }

  const userRoles = p?.roles ? [...p.roles] : ["student"];
  if (adminData && adminData.status === "active") {
    userRoles.push(adminData.role);
  }
  req.userRoles = userRoles;
  requestContext.setUserRoles(userRoles);
  
  // Attach admin-specific info to request for specialized middleware
  req.adminRole = adminData?.role;
  req.adminStatus = adminData?.status;
  req.mustChangeCredentials = adminData?.must_change_credentials;
  req.mfaRequired = adminData?.mfa_required;
  req.aal = data.user.factors && data.user.factors.length > 0 ? "aal2" : "aal1"; // Very basic AAL check

  // If this is an admin route, enforce mustChangeCredentials
  if (req.originalUrl.startsWith("/api/v1/admin")) {
    const isAllowedSetupRoute = req.originalUrl === "/api/v1/admin/me" || 
                                req.originalUrl === "/api/v1/admin/bootstrap/complete" ||
                                req.originalUrl === "/api/v1/admin/bootstrap/status";
    
    if (adminData && adminData.must_change_credentials && !isAllowedSetupRoute) {
      void recordAuthFailure();
      return res.status(403).json({ error: "Credentials must be changed before accessing this resource" });
    }
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (Boolean(req.userRoles?.some((r) => roles.includes(r)))) {
      return next();
    }
    void recordAuthFailure();
    return res.status(403).json({ error: "Insufficient role" });
  };
}

