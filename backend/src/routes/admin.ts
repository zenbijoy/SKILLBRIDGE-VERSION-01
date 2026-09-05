import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { env } from "../config/env.js";
import { sanitizeIlike } from "../lib/query-helpers.js";
import { cacheDelPattern } from "../lib/redis.js";
import { adminSystemRoutes } from "./admin-system.js";
import { adminAnalyticsRoutes } from "./admin-analytics.js";
import { adminSkillsRoutes } from "./admin-skills.js";
import { adminLearningRoutes } from "./admin-learning.js";
import { adminCommunityRoutes } from "./admin-community.js";
import { adminCampaignsRoutes } from "./admin-campaigns.js";
import { adminTrustCasesRoutes } from "./admin-trust-cases.js";
import { adminAlertsRoutes } from "./admin-alerts.js";
import { adminDiscoveryRoutes } from "./admin-discovery.js";
import { adminDataQualityRoutes } from "./admin-data-quality.js";
import { adminPrivacyRoutes } from "./admin-privacy.js";
import { adminCacheRoutes } from "./admin-cache.js";

export const adminRoutes = Router();

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
const elevatedRoles = ["moderator", "admin"] as const;
const audienceRoleSchema = z.enum(["student", "tutor", "peer_tutor", "club_admin", "researcher", "moderator", "admin"]);
const defaultAudienceRoles = ["student", "tutor", "peer_tutor", "club_admin", "researcher", "moderator", "admin"] as const;
const semverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
const actionUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("https://"),
    "Use an internal path or HTTPS URL",
  );
const contentIdSchema = z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/);
const experienceCopySchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(1200),
}).strict();
const welcomeContentSchema = z.array(experienceCopySchema.extend({ id: contentIdSchema }).strict()).min(1).max(12);
const onboardingContentSchema = z.object({
  language: experienceCopySchema,
  identity: experienceCopySchema,
  academic: experienceCopySchema,
  mission: experienceCopySchema,
  skills: experienceCopySchema,
  preferences: experienceCopySchema,
  privacy: experienceCopySchema,
  notifications: experienceCopySchema,
  review: experienceCopySchema,
}).strict();
const tourContentSchema = z.array(experienceCopySchema.extend({
  id: contentIdSchema,
  route: z.string().trim().min(1).max(160).refine((value) => value.startsWith("/") && !value.startsWith("//"), "Tour route must be internal"),
}).strict()).min(1).max(20).refine(
  (items) => new Set(items.map((item) => item.id)).size === items.length,
  "Tour chapter IDs must be unique",
);

function parseExperienceContent(contentType: "welcome" | "onboarding" | "tour", content: unknown) {
  if (contentType === "welcome") return welcomeContentSchema.parse(content);
  if (contentType === "onboarding") return onboardingContentSchema.parse(content);
  return tourContentSchema.parse(content);
}

function pagination(query: Record<string, unknown>) {
  const page = pageSchema.parse(query.page ?? 1);
  const limit = limitSchema.parse(query.limit ?? 20);
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

adminRoutes.get(
  "/reports",
  wrap(async (req, res) => {
    const { page, limit, from, to } = pagination(req.query as Record<string, unknown>);
    const status = z.enum(["open", "reviewing", "resolved", "dismissed"]).optional().parse(req.query.status);
    let query = db.from("reports").select("*", { count: "exact" });
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    res.json({ reports: data ?? [], total: count ?? 0, page, limit });
  }),
);

adminRoutes.patch(
  "/reports/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const b = z
      .object({
        status: z.enum(["reviewing", "resolved", "dismissed"]),
        action: z.string().trim().min(3).max(200).optional(),
      })
      .parse(req.body);

    const { data, error } = await db.rpc("admin_decide_report_atomic", {
      p_admin_id: req.userId!,
      p_report_id: id,
      p_status: b.status,
      p_action: b.action ?? `Report marked ${b.status}`,
    });

    if (error) throw error;
    res.json(data);
  }),
);

adminRoutes.patch(
  "/users/:id/status",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status, reason } = z.object({
      status: z.enum(["active", "suspended", "banned"]),
      reason: z.string().max(300).optional(),
    }).parse(req.body);

    const { data, error } = await db.rpc("admin_mutate_user_status_atomic", {
      p_admin_id: req.userId!,
      p_target_id: id,
      p_new_status: status,
      p_reason: reason ?? null,
    });

    if (error) {
      if (error.message.includes("Moderators cannot modify administrator")) {
        return res.status(403).json({ error: "Only administrators can modify other administrator accounts" });
      }
      if (error.message.includes("Cannot suspend or ban your own")) {
        return res.status(400).json({ error: "You cannot suspend or ban your own admin account" });
      }
      throw error;
    }

    res.json(data);
  }),
);

adminRoutes.get(
  "/stats",
  wrap(async (_req, res) => {
    const [
      { count: users, error: usersError },
      { count: activeUsers, error: activeUsersError },
      { count: rooms, error: roomsError },
      { count: activeSessions, error: sessionsError },
      { count: reports, error: reportsError },
      { count: pendingReports, error: pendingError },
      { data: recentActivity, error: auditError },
    ] = await Promise.all([
      db.from("profiles").select("*", { count: "exact", head: true }),
      db.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "active"),
      db.from("rooms").select("*", { count: "exact", head: true }),
      db.from("sessions").select("*", { count: "exact", head: true }).in("status", ["scheduled", "live"]),
      db.from("reports").select("*", { count: "exact", head: true }),
      db.from("reports").select("*", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
      db.from("audit_logs").select("id,action,target_type,target_id,created_at").order("created_at", { ascending: false }).limit(8),
    ]);

    const firstError = usersError ?? activeUsersError ?? roomsError ?? sessionsError ?? reportsError ?? pendingError ?? auditError;
    if (firstError) throw firstError;

    const normalizedActivity = (recentActivity ?? []).map((item) => ({
      id: String(item.id),
      action: item.action,
      targetType: item.target_type,
      targetId: item.target_id,
      timestamp: item.created_at,
    }));

    res.json({
      totalUsers: users ?? 0,
      activeUsers: activeUsers ?? 0,
      totalRooms: rooms ?? 0,
      activeSessions: activeSessions ?? 0,
      totalReports: reports ?? 0,
      pendingReports: pendingReports ?? 0,
      recentActivity: normalizedActivity,
      // Backwards-compatible compact counters used by older admin clients.
      users: users ?? 0,
      rooms: rooms ?? 0,
      sessions: activeSessions ?? 0,
      reports: reports ?? 0,
    });
  }),
);

adminRoutes.get(
  "/users",
  wrap(async (req, res) => {
    const { page, limit, from, to } = pagination(req.query as Record<string, unknown>);
    const q = z.string().trim().max(120).optional().parse(req.query.q);

    let query = db.from("profiles").select("*", { count: "exact" });
    if (q) {
      const safe = sanitizeIlike(q);
      if (safe) query = query.or(`full_name.ilike.%${safe}%,username.ilike.%${safe}%,university.ilike.%${safe}%`);
    }

    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    res.json({ users: data ?? [], total: count ?? 0, page, limit });
  }),
);

adminRoutes.get(
  "/users/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [
      { data: profile, error: profileError },
      { data: skills, error: skillsError },
      { data: rooms, error: roomsError },
      { data: sessions, error: sessionsError },
      { data: activity, error: activityError },
    ] = await Promise.all([
      db.from("profiles").select("*").eq("id", id).single(),
      db.from("user_skills").select("kind,proficiency,verified,skill:skills(id,name,category)").eq("user_id", id).limit(100),
      db.from("room_members").select("role,joined_at,room:rooms(id,title,status,visibility,topic)").eq("user_id", id).order("joined_at", { ascending: false }).limit(30),
      db.from("session_participants").select("status,attendance_status,session:sessions(id,starts_at,ends_at,status,mode,room_id)").eq("user_id", id).limit(30),
      db.from("audit_logs").select("id,action,target_type,target_id,metadata,created_at").eq("target_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
    if (profileError) throw profileError;
    const firstError = skillsError ?? roomsError ?? sessionsError ?? activityError;
    if (firstError) throw firstError;
    res.json({ profile, skills: skills ?? [], rooms: rooms ?? [], sessions: sessions ?? [], activity: activity ?? [] });
  }),
);

adminRoutes.get(
  "/rooms",
  wrap(async (req, res) => {
    const { page, limit, from, to } = pagination(req.query as Record<string, unknown>);
    const { data, count, error } = await db
      .from("rooms")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    res.json({ rooms: data ?? [], total: count ?? 0, page, limit });
  }),
);

adminRoutes.get(
  "/audit-logs",
  wrap(async (req, res) => {
    const isCsvExport = req.query.export === "csv";
    const limitMax = isCsvExport ? 2000 : 100;
    const page = pageSchema.parse(req.query.page ?? 1);
    const limit = z.coerce.number().int().min(1).max(limitMax).default(isCsvExport ? 1000 : 20).parse(req.query.limit ?? (isCsvExport ? 1000 : 20));
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    const action = z.string().trim().max(120).optional().parse(req.query.action);
    const actorId = z.string().trim().max(100).optional().parse(req.query.actor_id);
    const targetType = z.string().trim().max(60).optional().parse(req.query.target_type);
    const targetId = z.string().trim().max(120).optional().parse(req.query.target_id);
    const fromDate = z.string().trim().datetime({ offset: true }).optional().parse(req.query.from_date);
    const toDate = z.string().trim().datetime({ offset: true }).optional().parse(req.query.to_date);

    let query = db.from("audit_logs").select("*", { count: "exact" });
    if (action) query = query.ilike("action", `%${sanitizeIlike(action)}%`);
    if (actorId) query = query.eq("actor_id", actorId);
    if (targetType) query = query.eq("target_type", targetType);
    if (targetId) query = query.eq("target_id", targetId);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate);

    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;

    // Sanitize metadata to prevent leaking any tokens/passwords/service keys/urls
    const sanitizedLogs = (data ?? []).map((row) => {
      const meta = (row.metadata && typeof row.metadata === "object") ? { ...row.metadata } : {};
      const SENSITIVE_KEYS = ["token", "password", "secret", "authorization", "auth", "key", "service_role", "redis_url", "cookie"];
      for (const k of Object.keys(meta)) {
        if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
          meta[k] = "[REDACTED]";
        }
      }
      return {
        ...row,
        metadata: meta,
      };
    });

    if (isCsvExport) {
      const headers = ["id", "created_at", "actor_id", "action", "target_type", "target_id", "ip_address", "metadata"];
      const escapeCsv = (val: unknown) => {
        if (val === null || val === undefined) return '""';
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };
      const rows = sanitizedLogs.map((log) => [
        escapeCsv(log.id),
        escapeCsv(log.created_at),
        escapeCsv(log.actor_id),
        escapeCsv(log.action),
        escapeCsv(log.target_type),
        escapeCsv(log.target_id),
        escapeCsv(log.ip_address),
        escapeCsv(log.metadata),
      ].join(","));

      const csvContent = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(csvContent);
    }

    res.json({ logs: sanitizedLogs, total: count ?? 0, page, limit });
  }),
);

adminRoutes.put(
  "/users/:id/roles",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { elevatedRole } = z.object({ elevatedRole: z.enum(elevatedRoles).nullable() }).parse(req.body);
    if (id === req.userId && elevatedRole !== "admin") {
      return res.status(400).json({ error: "You cannot remove your own admin role" });
    }
    const { data: user, error: readError } = await db.from("profiles").select("roles").eq("id", id).single();
    if (readError) throw readError;
    const baseRoles = (user?.roles ?? ["student"]).filter((role: string) => !elevatedRoles.includes(role as (typeof elevatedRoles)[number]));
    const roles = elevatedRole ? [...new Set([...baseRoles, elevatedRole])] : [...new Set(baseRoles.length ? baseRoles : ["student"])];
    const { data, error } = await db.from("profiles").update({ roles }).eq("id", id).select("id,roles").single();
    if (error) throw error;
    await audit(req.userId!, "admin.user.roles.replace", "user", id, { roles });
    await cacheDelPattern(`dashboard:${id}:*`);
    res.json({ success: true, ...data });
  }),
);

// Backwards-compatible endpoint. It is intentionally admin-only and allow-listed.
adminRoutes.post(
  "/users/:id/role",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { role } = z.object({ role: z.enum(["student", "moderator", "admin"]) }).parse(req.body);
    const elevatedRole = role === "student" ? null : role;
    if (id === req.userId && elevatedRole !== "admin") {
      return res.status(400).json({ error: "You cannot remove your own admin role" });
    }
    const { data: user, error: readError } = await db.from("profiles").select("roles").eq("id", id).single();
    if (readError) throw readError;
    const baseRoles = (user?.roles ?? ["student"]).filter((value: string) => !elevatedRoles.includes(value as (typeof elevatedRoles)[number]));
    const roles = elevatedRole ? [...new Set([...baseRoles, elevatedRole])] : [...new Set(baseRoles.length ? baseRoles : ["student"])];
    const { error } = await db.from("profiles").update({ roles }).eq("id", id);
    if (error) throw error;
    await audit(req.userId!, "admin.user.role.assign", "user", id, { role, roles });
    await cacheDelPattern(`dashboard:${id}:*`);
    res.json({ success: true, roles });
  }),
);

adminRoutes.post(
  "/users/:id/verify",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({
      action: z.enum(["APPROVE_OVERRIDE", "REJECT_OVERRIDE", "BYPASS_REQUIRED_STEP"]),
      reason: z.string().trim().min(5).max(500),
    }).parse(req.body);
    const { data: profile, error } = await db.from("profiles").select("id,full_name,username").eq("id", id).single();
    if (error) throw error;
    await audit(req.userId!, "admin.verification.override", "user", id, body);
    res.status(201).json({ success: true, profile, ...body, recordedAt: new Date().toISOString() });
  }),
);

adminRoutes.get(
  "/verification-overrides",
  requireRole("admin"),
  wrap(async (_req, res) => {
    const { data, error } = await db
      .from("audit_logs")
      .select("id,actor_id,target_id,metadata,created_at")
      .eq("action", "admin.verification.override")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ overrides: data ?? [] });
  }),
);

adminRoutes.use("/system", adminSystemRoutes);
adminRoutes.use("/analytics", adminAnalyticsRoutes);
adminRoutes.use("/skills-intelligence", adminSkillsRoutes);
adminRoutes.use("/learning-ops", adminLearningRoutes);
adminRoutes.use("/community", adminCommunityRoutes);
adminRoutes.use("/campaigns", adminCampaignsRoutes);
adminRoutes.use("/trust-cases", adminTrustCasesRoutes);
adminRoutes.use("/alerts", adminAlertsRoutes);
adminRoutes.use("/discovery-insights", adminDiscoveryRoutes);
adminRoutes.use("/data-quality", adminDataQualityRoutes);
adminRoutes.use("/privacy", adminPrivacyRoutes);
adminRoutes.use("/cache", adminCacheRoutes);

adminRoutes.get(
  "/system",
  wrap(async (_req, res) => {
    const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
    const { error: dbError } = await db.from("profiles").select("id", { head: true }).limit(1);
    res.json({
      environment: env.NODE_ENV,
      api: { status: "operational", port: env.PORT, startedAt, uptimeSeconds: Math.floor(process.uptime()) },
      database: { status: dbError ? "degraded" : "operational" },
      capabilities: {
        redis: Boolean(env.REDIS_URL),
        livekit: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
        push: Boolean(env.EXPO_PUSH_ACCESS_TOKEN),
        ai: Boolean(env.AI_PROVIDER_URL && env.AI_PROVIDER_API_KEY),
      },
      runtimePolicy: {
        maxRoomCapacity: env.MAX_ROOM_CAPACITY,
        maintenanceMode: env.MAINTENANCE_MODE,
        globalRateLimitPerMinute: env.GLOBAL_RATE_LIMIT_PER_MINUTE,
      },
    });
  }),
);

adminRoutes.get(
  "/rbac/roles",
  requireRole("admin"),
  wrap(async (_req, res) => {
    const { data, error } = await db.from("admin_roles").select("*").order("id");
    if (error) throw error;
    res.json({ roles: data ?? [] });
  }),
);

adminRoutes.post(
  "/rbac/assignments",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { user_id, role_id } = z.object({ user_id: z.string().uuid(), role_id: z.string().min(1).max(80) }).parse(req.body);
    const { data, error } = await db
      .from("admin_assignments")
      .insert({ user_id, role_id, assigned_by: req.userId! })
      .select()
      .single();
    if (error) throw error;
    await audit(req.userId!, "admin.rbac.assign", "user", user_id, { role_id });
    res.status(201).json(data);
  }),
);

// Version & App Release Operations Control
adminRoutes.get(
  "/version-control",
  wrap(async (_req, res) => {
    const { data: config } = await db.from("app_version_control").select("*").eq("id", "default").maybeSingle();

    // Query real adoption metrics from user_push_tokens if available
    const { data: tokens } = await db.from("user_push_tokens").select("app_version");
    const adoptionMap = new Map<string, number>();
    if (tokens && tokens.length > 0) {
      for (const t of tokens) {
        if (t.app_version) {
          adoptionMap.set(t.app_version, (adoptionMap.get(t.app_version) ?? 0) + 1);
        }
      }
    }
    const adoption = Array.from(adoptionMap.entries()).map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count);

    res.json({
      config: config ?? {
        id: "default",
        min_supported_version: "2.0.0",
        recommended_version: "2.1.0",
        maintenance_mode: false,
        maintenance_message: "SkillBridge is undergoing scheduled maintenance.",
        update_prompt_enabled: true,
        update_title: "New Version Available",
        update_message: "Please update your application to continue accessing all features.",
        store_url_android: null,
        store_url_ios: null,
      },
      adoption,
    });
  }),
);

adminRoutes.patch(
  "/version-control",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = z.object({
      min_supported_version: semverSchema.optional(),
      recommended_version: semverSchema.optional(),
      maintenance_mode: z.boolean().optional(),
      maintenance_message: z.string().trim().min(5).max(500).optional(),
      update_prompt_enabled: z.boolean().optional(),
      update_title: z.string().trim().min(2).max(100).optional(),
      update_message: z.string().trim().min(5).max(500).optional(),
      store_url_android: z.string().url().nullable().optional(),
      store_url_ios: z.string().url().nullable().optional(),
    }).strict().refine((val) => Object.keys(val).length > 0, "At least one update field is required").parse(req.body);

    const { data, error } = await db
      .from("app_version_control")
      .upsert({
        id: "default",
        ...body,
        updated_at: new Date().toISOString(),
        updated_by: req.userId,
      })
      .select()
      .single();

    if (error) throw error;

    await audit(req.userId!, "admin.version_control.update", "app_version_control", "default", body);
    await cacheDelPattern("config:*");
    await cacheDelPattern("dashboard:*");

    res.json({ success: true, config: data });
  }),
);

// Dashboard Configs Management
adminRoutes.get(
  "/dashboard-configs",
  wrap(async (_req, res) => {
    const { data, error } = await db.from("dashboard_configs").select("*").order("default_order");
    if (error) throw error;
    res.json({ configs: data ?? [] });
  }),
);

adminRoutes.patch(
  "/dashboard-configs/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({
      default_order: z.number().int().min(1).max(1000).optional(),
      is_required: z.boolean().optional(),
      is_enabled: z.boolean().optional(),
      title_en: z.string().trim().min(2).max(100).optional(),
      title_bn: z.string().trim().min(2).max(100).optional(),
      target_roles: z.array(audienceRoleSchema).min(1).optional(),
      target_campus: z.string().trim().min(2).max(120).nullable().optional(),
      min_app_version: semverSchema.optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "At least one dashboard field is required").parse(req.body);

    const { data, error } = await db
      .from("dashboard_configs")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.dashboard_config.update", "dashboard_config", id, body);
    await cacheDelPattern("dashboard:*");
    res.json(data);
  }),
);

// Announcements Management
adminRoutes.get(
  "/announcements",
  wrap(async (_req, res) => {
    const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ announcements: data ?? [] });
  }),
);

adminRoutes.post(
  "/announcements",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = z.object({
      title_en: z.string().trim().min(2).max(160),
      title_bn: z.string().trim().min(2).max(160),
      body_en: z.string().trim().min(2).max(2000),
      body_bn: z.string().trim().min(2).max(2000),
      tone: z.enum(["info", "warning", "success", "accent"]).default("info"),
      action_url: actionUrlSchema.optional(),
      action_label_en: z.string().trim().min(1).max(80).optional(),
      action_label_bn: z.string().trim().min(1).max(80).optional(),
      is_active: z.boolean().default(true),
      is_dismissible: z.boolean().default(true),
      target_roles: z.array(audienceRoleSchema).min(1).default([...defaultAudienceRoles]),
      target_campus: z.string().trim().min(2).max(120).nullable().optional(),
      starts_at: z.string().datetime({ offset: true }).optional(),
      ends_at: z.string().datetime({ offset: true }).nullable().optional(),
    }).strict()
      .refine((value) => !value.ends_at || !value.starts_at || new Date(value.ends_at) > new Date(value.starts_at), {
        message: "Announcement end time must be after its start time",
        path: ["ends_at"],
      })
      .refine((value) => !value.action_url || Boolean(value.action_label_en && value.action_label_bn), {
        message: "Localized action labels are required when an action URL is provided",
        path: ["action_label_en"],
      })
      .refine((value) => Boolean(value.action_url) || (!value.action_label_en && !value.action_label_bn), {
        message: "Action labels require an action URL",
        path: ["action_url"],
      })
      .parse(req.body);

    const { data, error } = await db
      .from("announcements")
      .insert(body)
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.announcement.create", "announcement", data.id, body);
    await cacheDelPattern("dashboard:*");
    res.status(201).json(data);
  }),
);

adminRoutes.patch(
  "/announcements/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({
      title_en: z.string().trim().min(2).max(160).optional(),
      title_bn: z.string().trim().min(2).max(160).optional(),
      body_en: z.string().trim().min(2).max(2000).optional(),
      body_bn: z.string().trim().min(2).max(2000).optional(),
      tone: z.enum(["info", "warning", "success", "accent"]).optional(),
      action_url: actionUrlSchema.nullable().optional(),
      action_label_en: z.string().trim().min(1).max(80).nullable().optional(),
      action_label_bn: z.string().trim().min(1).max(80).nullable().optional(),
      is_active: z.boolean().optional(),
      is_dismissible: z.boolean().optional(),
      target_roles: z.array(audienceRoleSchema).min(1).optional(),
      target_campus: z.string().trim().min(2).max(120).nullable().optional(),
      starts_at: z.string().datetime({ offset: true }).optional(),
      ends_at: z.string().datetime({ offset: true }).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "At least one announcement field is required").parse(req.body);

    const { data: current, error: currentError } = await db
      .from("announcements")
      .select("starts_at,ends_at,action_url,action_label_en,action_label_bn")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;
    const nextStart = body.starts_at ?? current.starts_at;
    const nextEnd = body.ends_at === undefined ? current.ends_at : body.ends_at;
    if (nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
      return res.status(400).json({ error: "Announcement end time must be after its start time" });
    }
    const nextUrl = body.action_url === undefined ? current.action_url : body.action_url;
    const nextLabelEn = body.action_url === null ? null : (body.action_label_en === undefined ? current.action_label_en : body.action_label_en);
    const nextLabelBn = body.action_url === null ? null : (body.action_label_bn === undefined ? current.action_label_bn : body.action_label_bn);
    if (nextUrl && (!nextLabelEn || !nextLabelBn)) {
      return res.status(400).json({ error: "Localized action labels are required when an action URL is provided" });
    }
    if (!nextUrl && (nextLabelEn || nextLabelBn)) {
      return res.status(400).json({ error: "Action labels require an action URL" });
    }
    const updatePayload = body.action_url === null
      ? { ...body, action_label_en: null, action_label_bn: null }
      : body;

    const { data, error } = await db
      .from("announcements")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.announcement.update", "announcement", id, updatePayload);
    await cacheDelPattern("dashboard:*");
    res.json(data);
  }),
);

// Feature Flags Management
adminRoutes.get(
  "/feature-flags",
  wrap(async (_req, res) => {
    const { data, error } = await db.from("feature_flags").select("*").order("key");
    if (error) throw error;
    res.json({ flags: data ?? [] });
  }),
);

adminRoutes.post(
  "/feature-flags",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = z.object({
      key: z.string().trim().min(2).max(60).regex(/^[a-z0-9_.-]+$/),
      description: z.string().trim().max(500).optional(),
      is_enabled: z.boolean().default(true),
      rollout_percentage: z.number().int().min(0).max(100).default(100),
      target_roles: z.array(audienceRoleSchema).min(1).default([...defaultAudienceRoles]),
    }).strict().parse(req.body);

    const { data, error } = await db
      .from("feature_flags")
      .insert(body)
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.feature_flag.create", "feature_flag", data.id, body);
    await cacheDelPattern("dashboard:*");
    res.status(201).json(data);
  }),
);

adminRoutes.patch(
  "/feature-flags/:key",
  requireRole("admin"),
  wrap(async (req, res) => {
    const key = z.string().trim().min(2).max(60).regex(/^[a-z0-9_.-]+$/).parse(req.params.key);
    const body = z.object({
      description: z.string().trim().max(500).optional(),
      is_enabled: z.boolean().optional(),
      rollout_percentage: z.number().int().min(0).max(100).optional(),
      target_roles: z.array(audienceRoleSchema).min(1).optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "At least one feature flag field is required").parse(req.body);

    const { data, error } = await db
      .from("feature_flags")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("key", key)
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.feature_flag.update", "feature_flag", key, body);
    await cacheDelPattern("dashboard:*");
    res.json(data);
  }),
);

adminRoutes.get(
  "/experience-content",
  wrap(async (req, res) => {
    const type = z.enum(["welcome", "onboarding", "tour"]).optional().parse(req.query.type);
    const locale = z.enum(["en", "bn"]).optional().parse(req.query.locale);
    let query = db.from("experience_content_sets").select("*");
    if (type) query = query.eq("content_type", type);
    if (locale) query = query.eq("locale", locale);
    const { data, error } = await query.order("content_type").order("locale").order("version", { ascending: false });
    if (error) throw error;
    res.json({ contentSets: data ?? [] });
  }),
);

adminRoutes.post(
  "/experience-content/:type/:locale/publish",
  requireRole("admin"),
  wrap(async (req, res) => {
    const contentType = z.enum(["welcome", "onboarding", "tour"]).parse(req.params.type);
    const locale = z.enum(["en", "bn"]).parse(req.params.locale);
    const raw = z.object({ content: z.unknown() }).strict().parse(req.body);
    const content = parseExperienceContent(contentType, raw.content);
    const { data, error } = await db.rpc("publish_experience_content_atomic", {
      p_actor_id: req.userId!,
      p_content_type: contentType,
      p_locale: locale,
      p_content: content,
    });
    if (error) throw error;
    const published = data as { id?: string; version?: number };
    await audit(req.userId!, "admin.experience_content.publish", "experience_content", published.id ?? `${contentType}:${locale}`, {
      content_type: contentType,
      locale,
      version: published.version,
    });
    await cacheDelPattern("dashboard:*");
    res.status(201).json(published);
  }),
);
