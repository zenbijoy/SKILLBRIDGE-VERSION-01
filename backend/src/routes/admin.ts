import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { env } from "../config/env.js";

export const adminRoutes = Router();

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
const elevatedRoles = ["moderator", "admin"] as const;

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
    const action = b.action ?? `Report marked ${b.status}`;
    const { data, error } = await db
      .from("reports")
      .update({
        status: b.status,
        action,
        reviewed_by: req.userId!,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await audit(req.userId!, "moderation.report.update", "report", id, { status: b.status, action });
    res.json(data);
  }),
);

adminRoutes.patch(
  "/users/:id/status",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z.object({ status: z.enum(["active", "suspended", "banned"]) }).parse(req.body);
    if (id === req.userId && status !== "active") {
      return res.status(400).json({ error: "You cannot suspend or ban your own admin account" });
    }
    const { data, error } = await db
      .from("profiles")
      .update({ account_status: status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await audit(req.userId!, "moderation.user.status", "user", id, { status });
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
      const safe = q.replace(/[,%()]/g, " ").trim();
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
    const { page, limit, from, to } = pagination(req.query as Record<string, unknown>);
    const action = z.string().trim().max(120).optional().parse(req.query.action);
    let query = db.from("audit_logs").select("*", { count: "exact" });
    if (action) query = query.ilike("action", `%${action}%`);
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    res.json({ logs: data ?? [], total: count ?? 0, page, limit });
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
