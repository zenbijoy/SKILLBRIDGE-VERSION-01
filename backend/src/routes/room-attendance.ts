import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const roomAttendance = Router({ mergeParams: true });

// GET /rooms/:id/attendance/me — my attendance % + certificate status
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

// POST /rooms/:id/attendance/claim — 80%+ hole certificate + 100 XP
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
