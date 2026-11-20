import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { getSocketServer, roomPresenceRoom } from "../socket.js";
import { getRoomMembership } from "./room-live.js";

export const roomAttendance = Router({ mergeParams: true });

// Live Session Attendance Record interface
export interface LiveAttendanceItem {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  status: "present" | "left" | "absent";
  joinedAt: string;
  leftAt: string | null;
  lastSeenAt: string;
  durationSeconds: number;
  durationFormatted: string;
  isHost: boolean;
  isManual?: boolean;
}

// In-memory session attendance cache for real-time responsiveness & zero-downtime
const liveAttendanceStore = new Map<string, Map<string, LiveAttendanceItem>>();

export function getSessionAttendanceMap(sessionId: string): Map<string, LiveAttendanceItem> {
  let map = liveAttendanceStore.get(sessionId);
  if (!map) {
    map = new Map<string, LiveAttendanceItem>();
    liveAttendanceStore.set(sessionId, map);
  }
  return map;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (mins < 60) {
    return remainingSec > 0 ? `${mins}m ${remainingSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /rooms/:id/attendance/live
// Responsive Live Session Attendance Roster & Summary
// ─────────────────────────────────────────────────────────────────────────────
roomAttendance.get(
  "/live",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const requestedSessionId = req.query.sessionId as string | undefined;

    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({ error: "Room membership required" });
    }

    const isTeacher = Boolean(isOwner || role === "owner" || role === "admin" || role === "teacher");

    // 1. Resolve target session: requestedSessionId or current active open/study session
    let sessionId = requestedSessionId;
    let sessionMeta: any = null;

    if (!sessionId) {
      // Check active open session first
      const { data: openSess } = await admin
        .from("room_open_sessions")
        .select("id, room_id, media, status, started_at, host_id")
        .eq("room_id", roomId)
        .eq("status", "live")
        .maybeSingle();

      if (openSess) {
        sessionId = openSess.id;
        sessionMeta = {
          id: openSess.id,
          media: openSess.media,
          status: openSess.status,
          startedAt: openSess.started_at,
          title: `${openSess.media === "video" ? "Video Class" : "Audio Session"}`,
          hostId: openSess.host_id,
        };
      } else {
        // Check active study session
        const { data: studySess } = await admin
          .from("sessions")
          .select("id, title, media, status, starts_at, teacher_id")
          .eq("room_id", roomId)
          .eq("status", "live")
          .maybeSingle();

        if (studySess) {
          sessionId = studySess.id;
          sessionMeta = {
            id: studySess.id,
            media: studySess.media,
            status: studySess.status,
            startedAt: studySess.starts_at,
            title: studySess.title,
            hostId: studySess.teacher_id,
          };
        }
      }
    }

    if (!sessionId) {
      return res.json({
        hasActiveSession: false,
        session: null,
        summary: { totalEnrolled: 0, presentCount: 0, leftCount: 0, attendanceRate: 0 },
        records: [],
      });
    }

    // 2. Fetch session roster from in-memory cache and/or DB
    const attendanceMap = getSessionAttendanceMap(sessionId);

    // If cache has few/no entries, sync from room_open_participants or livekit_attendance
    if (attendanceMap.size === 0) {
      try {
        const { data: participants } = await admin
          .from("room_open_participants")
          .select("user_id, joined_at, left_at, is_host")
          .eq("session_id", sessionId);

        if (participants && participants.length > 0) {
          const uIds = participants.map((p) => p.user_id);
          const { data: profiles } = await admin
            .from("profiles")
            .select("id, full_name, username, avatar_url")
            .in("id", uIds);

          const { data: roles } = await admin
            .from("room_members")
            .select("user_id, role")
            .eq("room_id", roomId)
            .in("user_id", uIds);

          const pMap = new Map((profiles || []).map((p) => [p.id, p]));
          const rMap = new Map((roles || []).map((r) => [r.user_id, r.role]));

          for (const p of participants) {
            const prof = pMap.get(p.user_id);
            const joinedTime = new Date(p.joined_at).getTime();
            const leftTime = p.left_at ? new Date(p.left_at).getTime() : Date.now();
            const duration = Math.max(0, Math.floor((leftTime - joinedTime) / 1000));
            const status: "present" | "left" = p.left_at ? "left" : "present";

            attendanceMap.set(p.user_id, {
              userId: p.user_id,
              fullName: prof?.full_name || (prof?.username ? `@${prof.username}` : "Student"),
              username: prof?.username || "student",
              avatarUrl: prof?.avatar_url || null,
              role: rMap.get(p.user_id) || (p.is_host ? "teacher" : "member"),
              status,
              joinedAt: p.joined_at,
              leftAt: p.left_at || null,
              lastSeenAt: new Date().toISOString(),
              durationSeconds: duration,
              durationFormatted: formatDuration(duration),
              isHost: Boolean(p.is_host),
            });
          }
        }
      } catch {}
    }

    // 3. Count total room members to calculate attendance rate
    const { count: memberCount } = await admin
      .from("room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId);

    const totalEnrolled = Math.max(memberCount || 1, attendanceMap.size);
    const records = Array.from(attendanceMap.values());
    const presentCount = records.filter((r) => r.status === "present").length;
    const leftCount = records.filter((r) => r.status === "left").length;
    const attendanceRate = totalEnrolled > 0 ? Math.round(((presentCount + leftCount) / totalEnrolled) * 100) : 0;

    // Students only need their own summary or full roster if authorized
    res.json({
      hasActiveSession: true,
      session: sessionMeta,
      summary: {
        totalEnrolled,
        presentCount,
        leftCount,
        attendanceRate,
        isTeacher,
      },
      records: isTeacher ? records : records.filter((r) => r.userId === userId || r.status === "present"),
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /rooms/:id/attendance/heartbeat
// Student client sends periodic heartbeat (every 30s) to keep active attendance duration accurate
// ─────────────────────────────────────────────────────────────────────────────
const heartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

roomAttendance.post(
  "/heartbeat",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = heartbeatSchema.parse(req.body);

    const attendanceMap = getSessionAttendanceMap(body.sessionId);
    let item = attendanceMap.get(userId);

    if (item) {
      item.lastSeenAt = new Date().toISOString();
      item.status = "present";
      item.leftAt = null;
      if (body.durationSeconds !== undefined && body.durationSeconds > item.durationSeconds) {
        item.durationSeconds = body.durationSeconds;
      } else {
        const joinedTime = new Date(item.joinedAt).getTime();
        item.durationSeconds = Math.max(0, Math.floor((Date.now() - joinedTime) / 1000));
      }
      item.durationFormatted = formatDuration(item.durationSeconds);
      attendanceMap.set(userId, item);
    } else {
      // Auto-register presence if not in map
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      const { data: membership } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

      const duration = body.durationSeconds || 30;
      item = {
        userId,
        fullName: profile?.full_name || "Student",
        username: profile?.username || "student",
        avatarUrl: profile?.avatar_url || null,
        role: membership?.role || "member",
        status: "present",
        joinedAt: new Date(Date.now() - duration * 1000).toISOString(),
        leftAt: null,
        lastSeenAt: new Date().toISOString(),
        durationSeconds: duration,
        durationFormatted: formatDuration(duration),
        isHost: membership?.role === "owner" || membership?.role === "teacher",
      };
      attendanceMap.set(userId, item);
    }

    res.json({ success: true, item });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /rooms/:id/attendance/record
// Record Join or Leave explicitly from LiveKit/WebRTC clients
// ─────────────────────────────────────────────────────────────────────────────
const recordSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(["join", "leave"]),
  durationSeconds: z.number().int().nonnegative().optional(),
});

roomAttendance.post(
  "/record",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = recordSchema.parse(req.body);

    const attendanceMap = getSessionAttendanceMap(body.sessionId);
    let item = attendanceMap.get(userId);

    if (body.action === "join") {
      if (!item) {
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, username, avatar_url")
          .eq("id", userId)
          .maybeSingle();

        const { data: membership } = await admin
          .from("room_members")
          .select("role")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();

        item = {
          userId,
          fullName: profile?.full_name || "Student",
          username: profile?.username || "student",
          avatarUrl: profile?.avatar_url || null,
          role: membership?.role || "member",
          status: "present",
          joinedAt: new Date().toISOString(),
          leftAt: null,
          lastSeenAt: new Date().toISOString(),
          durationSeconds: 0,
          durationFormatted: "0s",
          isHost: membership?.role === "owner" || membership?.role === "teacher",
        };
      } else {
        item.status = "present";
        item.leftAt = null;
        item.lastSeenAt = new Date().toISOString();
      }
      attendanceMap.set(userId, item);
    } else if (body.action === "leave") {
      if (item) {
        item.status = "left";
        item.leftAt = new Date().toISOString();
        if (body.durationSeconds !== undefined) {
          item.durationSeconds = Math.max(item.durationSeconds, body.durationSeconds);
        } else {
          const joinedTime = new Date(item.joinedAt).getTime();
          item.durationSeconds = Math.max(0, Math.floor((Date.now() - joinedTime) / 1000));
        }
        item.durationFormatted = formatDuration(item.durationSeconds);
        attendanceMap.set(userId, item);
      }
    }

    // Broadcast attendance update via socket
    const io = getSocketServer();
    if (io) {
      io.to(roomPresenceRoom(roomId)).emit("room:live:attendance_updated", {
        roomId,
        sessionId: body.sessionId,
        item,
      });
    }

    res.json({ success: true, item });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /rooms/:id/attendance/manual
// Teacher or Room Admin manually adjusts student attendance
// ─────────────────────────────────────────────────────────────────────────────
const manualSchema = z.object({
  sessionId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  status: z.enum(["present", "left", "absent"]),
  note: z.string().optional(),
});

roomAttendance.post(
  "/manual",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = manualSchema.parse(req.body);

    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    if (!isMember || (!isOwner && role !== "teacher" && role !== "admin")) {
      return res.status(403).json({ error: "Only a room teacher or admin can modify attendance records" });
    }

    const attendanceMap = getSessionAttendanceMap(body.sessionId);
    let item = attendanceMap.get(body.targetUserId);

    if (!item) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", body.targetUserId)
        .maybeSingle();

      const { data: membership } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", body.targetUserId)
        .maybeSingle();

      item = {
        userId: body.targetUserId,
        fullName: profile?.full_name || "Student",
        username: profile?.username || "student",
        avatarUrl: profile?.avatar_url || null,
        role: membership?.role || "member",
        status: body.status,
        joinedAt: new Date().toISOString(),
        leftAt: body.status === "left" ? new Date().toISOString() : null,
        lastSeenAt: new Date().toISOString(),
        durationSeconds: body.status === "present" ? 1800 : 0,
        durationFormatted: body.status === "present" ? "30m (Manual)" : "0s",
        isHost: false,
        isManual: true,
      };
    } else {
      item.status = body.status;
      item.isManual = true;
      if (body.status === "left" && !item.leftAt) {
        item.leftAt = new Date().toISOString();
      }
    }

    attendanceMap.set(body.targetUserId, item);

    const io = getSocketServer();
    if (io) {
      io.to(roomPresenceRoom(roomId)).emit("room:live:attendance_updated", {
        roomId,
        sessionId: body.sessionId,
        item,
      });
    }

    res.json({ success: true, item });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /rooms/:id/attendance/export
// Export attendance as CSV or JSON format
// ─────────────────────────────────────────────────────────────────────────────
roomAttendance.get(
  "/export",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const sessionId = req.query.sessionId as string;

    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    if (!isMember || (!isOwner && role !== "teacher" && role !== "admin")) {
      return res.status(403).json({ error: "Only a room teacher or admin can export attendance" });
    }

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId query parameter is required" });
    }

    const attendanceMap = getSessionAttendanceMap(sessionId);
    const records = Array.from(attendanceMap.values());

    const format = req.query.format === "json" ? "json" : "csv";

    if (format === "json") {
      return res.json({ roomId, sessionId, exportedAt: new Date().toISOString(), records });
    }

    // CSV format
    const headers = "User ID,Full Name,Username,Role,Status,Joined At,Left At,Duration (Seconds),Duration Formatted\n";
    const rows = records.map((r) =>
      `"${r.userId}","${r.fullName.replace(/"/g, '""')}","${r.username}","${r.role}","${r.status}","${r.joinedAt}","${r.leftAt || ""}","${r.durationSeconds}","${r.durationFormatted}"`
    ).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=attendance-${roomId.slice(0, 8)}-${Date.now()}.csv`);
    res.send(headers + rows);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /rooms/:id/attendance/me
// My historical attendance % + certificate status
// ─────────────────────────────────────────────────────────────────────────────
roomAttendance.get(
  "/me",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: sessions } = await admin
      .from("sessions").select("id, status").eq("room_id", roomId);
    const sids = ((sessions as any[]) ?? []).map((s) => s.id);
    if (sids.length === 0) {
      return res.json({ totalSessions: 0, attended: 0, percent: 0, eligible: false });
    }
    const { data: rows } = await admin.from("livekit_attendance")
      .select("session_id, duration_seconds").eq("user_id", req.userId!).in("session_id", sids);
    const attendedSet = new Set(((rows as any[]) ?? []).map((r) => r.session_id));
    const attended = attendedSet.size;
    const percent = Math.round((attended / sids.length) * 100);
    let cert: any = null;
    try {
      const { data } = await admin.from("room_certificates")
        .select("*").eq("room_id", roomId).eq("user_id", req.userId!).maybeSingle();
      cert = data ?? null;
    } catch { cert = null; }
    res.json({ totalSessions: sids.length, attended, percent, eligible: percent >= 80, certificate: cert });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /rooms/:id/attendance/claim
// 80%+ certificate + 100 XP
// ─────────────────────────────────────────────────────────────────────────────
roomAttendance.post(
  "/claim",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: sessions } = await admin
      .from("sessions").select("id").eq("room_id", roomId);
    const sids = ((sessions as any[]) ?? []).map((s) => s.id);
    if (sids.length === 0) return res.status(400).json({ error: "No sessions yet" });
    const { data: rows } = await admin.from("livekit_attendance")
      .select("session_id").eq("user_id", req.userId!).in("session_id", sids);
    const attended = new Set(((rows as any[]) ?? []).map((r) => r.session_id)).size;
    const percent = Math.round((attended / sids.length) * 100);
    if (percent < 80) return res.status(400).json({ error: `Need 80%, you have ${percent}%` });
    const code = `SB-${roomId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    let cert: any = null;
    try {
      const { data, error } = await admin.from("room_certificates").upsert(
        { room_id: roomId, user_id: req.userId!, percent, code },
        { onConflict: "room_id,user_id" },
      ).select().single();
      if (error) throw error;
      cert = data;
    } catch {
      cert = { room_id: roomId, user_id: req.userId, percent, code };
    }
    await admin.rpc("award_reputation_atomic", {
      p_user_id: req.userId!, p_event_type: "room_certificate", p_points: 100,
      p_reference_type: "room", p_reference_id: roomId,
    }).then(() => null, () => null);
    res.status(201).json({ certificate: cert, percent, xp: 100 });
  }),
);
