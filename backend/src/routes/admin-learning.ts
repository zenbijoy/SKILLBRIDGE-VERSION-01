import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { audit } from "../services/audit.js";
import { userConnections } from "../socket.js";
import { env } from "../config/env.js";
import { sanitizeIlike } from "../lib/query-helpers.js";

export const adminLearningRoutes = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().optional(),
});

// 1. Get Rooms
adminLearningRoutes.get(
  "/rooms",
  wrap(async (req, res) => {
    const { page, limit, q, status } = paginationSchema.parse(req.query);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    let query = db
      .from("rooms")
      .select(`
        id, title, topic, status, visibility, max_capacity, created_at,
        owner:profiles!rooms_owner_id_fkey(id, full_name, username, avatar_url)
      `, { count: "exact" });

    if (q) {
      const safe = sanitizeIlike(q);
      if (safe) query = query.ilike("title", `%${safe}%`);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: rooms, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;

    // Enrich with member counts & session counts
    const roomIds = (rooms ?? []).map((r) => r.id);
    const [membersRes, sessionsRes, reportsRes] = await Promise.all([
      db.from("room_members").select("room_id, role").in("room_id", roomIds),
      db.from("sessions").select("room_id, status").in("room_id", roomIds),
      db.from("reports").select("target_id").eq("target_type", "room").in("target_id", roomIds),
    ]);

    const memberCounts = new Map<string, { total: number; teachers: number }>();
    for (const m of membersRes.data ?? []) {
      const c = memberCounts.get(m.room_id) ?? { total: 0, teachers: 0 };
      c.total++;
      if (m.role === "host" || m.role === "cohost") c.teachers++;
      memberCounts.set(m.room_id, c);
    }

    const sessionCounts = new Map<string, number>();
    for (const s of sessionsRes.data ?? []) {
      sessionCounts.set(s.room_id, (sessionCounts.get(s.room_id) ?? 0) + 1);
    }

    const reportCounts = new Map<string, number>();
    for (const rep of reportsRes.data ?? []) {
      reportCounts.set(rep.target_id, (reportCounts.get(rep.target_id) ?? 0) + 1);
    }

    const enriched = (rooms ?? []).map((r: any) => ({
      ...r,
      memberCount: memberCounts.get(r.id)?.total ?? 1,
      teacherCount: memberCounts.get(r.id)?.teachers ?? 1,
      sessionCount: sessionCounts.get(r.id) ?? 0,
      reportCount: reportCounts.get(r.id) ?? 0,
    }));

    res.json({ rooms: enriched, total: count ?? 0, page, limit });
  }),
);

// 2. Mutate Room Status
adminLearningRoutes.patch(
  "/rooms/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { action, reason } = z.object({
      action: z.enum(["archive", "suspend", "activate", "feature"]),
      reason: z.string().trim().min(3).max(300),
    }).parse(req.body);

    let nextStatus = "active";
    if (action === "archive") nextStatus = "archived";
    else if (action === "suspend") nextStatus = "suspended";
    else if (action === "activate") nextStatus = "active";

    const { data: updated, error } = await db
      .from("rooms")
      .update({ status: nextStatus })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await audit(req.userId!, `admin.room.${action}`, "room", id, {
      previousAction: action,
      reason,
      newStatus: nextStatus,
    });

    res.json({ success: true, room: updated });
  }),
);

// 3. Get Sessions
adminLearningRoutes.get(
  "/sessions",
  wrap(async (req, res) => {
    const { page, limit, status } = paginationSchema.parse(req.query);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    let query = db
      .from("sessions")
      .select(`
        id, room_id, host_id, starts_at, ends_at, status, mode,
        room:rooms(id, title),
        host:profiles!sessions_host_id_fkey(id, full_name, username, avatar_url)
      `, { count: "exact" });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: sessions, count, error } = await query.order("starts_at", { ascending: false }).range(from, to);
    if (error) throw error;

    const sessionIds = (sessions ?? []).map((s) => s.id);
    const { data: participants } = await db
      .from("session_participants")
      .select("session_id, attendance_status")
      .in("session_id", sessionIds);

    const partStats = new Map<string, { total: number; attended: number }>();
    for (const p of participants ?? []) {
      const c = partStats.get(p.session_id) ?? { total: 0, attended: 0 };
      c.total++;
      if (p.attendance_status === "attended") c.attended++;
      partStats.set(p.session_id, c);
    }

    const enriched = (sessions ?? []).map((s: any) => ({
      ...s,
      participantsCount: partStats.get(s.id)?.total ?? 0,
      attendedCount: partStats.get(s.id)?.attended ?? 0,
    }));

    res.json({ sessions: enriched, total: count ?? 0, page, limit });
  }),
);

// 4. Mutate Session Status (e.g. Cancel)
adminLearningRoutes.patch(
  "/sessions/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { action, reason } = z.object({
      action: z.enum(["cancel", "complete"]),
      reason: z.string().trim().min(3).max(300),
    }).parse(req.body);

    const nextStatus = action === "cancel" ? "cancelled" : "completed";

    const { data: updated, error } = await db
      .from("sessions")
      .update({ status: nextStatus, ends_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await audit(req.userId!, `admin.session.${action}`, "session", id, {
      action,
      reason,
      newStatus: nextStatus,
    });

    res.json({ success: true, session: updated });
  }),
);

// 5. Realtime Telemetry
adminLearningRoutes.get(
  "/realtime",
  wrap(async (_req, res) => {
    const { count: liveSessionsCount } = await db
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "live");

    const livekitConfigured = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);

    res.json({
      socketStatus: "operational",
      activeOnlineUsers: userConnections.size,
      activeLearningSessions: liveSessionsCount ?? 0,
      livekit: {
        configured: livekitConfigured,
        status: livekitConfigured ? "operational" : "unconfigured",
        p2pFallbackEnabled: env.P2P_CALLS_ENABLED,
      },
    });
  }),
);
