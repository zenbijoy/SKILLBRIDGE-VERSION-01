import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { getAuthFailureMetrics } from "../middleware/auth.js";
import { RedisService } from "../services/RedisService.js";
import { env } from "../config/env.js";

export const adminAlertsRoutes = Router();

const dismissedAlertIds = new Set<string>();

adminAlertsRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const alerts: Array<{
      id: string;
      title: string;
      description: string;
      category: "security" | "moderation" | "system" | "integration" | "data_quality";
      severity: "critical" | "warning" | "info";
      link: string;
      createdAt: string;
    }> = [];

    // 1. Check Moderation Reports
    const { count: openReports } = await db
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "reviewing"]);

    if ((openReports ?? 0) > 0) {
      alerts.push({
        id: "alert-mod-pending",
        title: `${openReports} Unresolved Moderation Reports`,
        description: `There are ${openReports} reports awaiting triage and resolution by administrators.`,
        category: "moderation",
        severity: (openReports ?? 0) > 10 ? "critical" : "warning",
        link: "/moderation",
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Check Auth Degradation
    const authMetrics = await getAuthFailureMetrics();
    if (authMetrics.isAuthDegraded) {
      alerts.push({
        id: "alert-auth-failures",
        title: "High Authentication Failure Rate",
        description: `Spike detected: ${authMetrics.failuresPerMinute} failures/min in the last 5 minutes.`,
        category: "security",
        severity: "critical",
        link: "/system-status",
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Check Redis Status
    const redisStatus = RedisService.getStatus();
    if (env.REDIS_URL && redisStatus !== "UP") {
      alerts.push({
        id: "alert-redis-status",
        title: "Redis Cache Degraded or Disconnected",
        description: `Redis connection state is currently ${redisStatus}. Fallback memory cache is in use.`,
        category: "system",
        severity: "warning",
        link: "/system-status",
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Check Integrations
    if (!env.EXPO_PUSH_ACCESS_TOKEN) {
      alerts.push({
        id: "alert-push-missing",
        title: "Expo Push Service Not Configured",
        description: "EXPO_PUSH_ACCESS_TOKEN is missing. Mobile push notifications cannot be delivered.",
        category: "integration",
        severity: "info",
        link: "/api-mgmt",
        createdAt: new Date().toISOString(),
      });
    }

    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY) {
      alerts.push({
        id: "alert-livekit-missing",
        title: "LiveKit Audio/Video Not Configured",
        description: "LiveKit credentials not configured. Realtime video calling will use WebRTC P2P fallback.",
        category: "integration",
        severity: "info",
        link: "/api-mgmt",
        createdAt: new Date().toISOString(),
      });
    }

    // 5. Filter dismissed
    const activeAlerts = alerts.filter((a) => !dismissedAlertIds.has(a.id));

    res.json({
      alerts: activeAlerts,
      unreadCount: activeAlerts.length,
      categories: ["security", "moderation", "system", "integration", "data_quality"],
    });
  }),
);

adminAlertsRoutes.post(
  "/dismiss",
  wrap(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.body);
    dismissedAlertIds.add(id);
    res.json({ success: true, dismissedId: id });
  }),
);

adminAlertsRoutes.post(
  "/dismiss-all",
  wrap(async (_req, res) => {
    dismissedAlertIds.add("alert-mod-pending");
    dismissedAlertIds.add("alert-auth-failures");
    dismissedAlertIds.add("alert-redis-status");
    dismissedAlertIds.add("alert-push-missing");
    dismissedAlertIds.add("alert-livekit-missing");
    res.json({ success: true });
  }),
);
