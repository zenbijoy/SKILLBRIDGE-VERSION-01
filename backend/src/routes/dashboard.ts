import { Router } from "express";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
export const dashboard = Router();
dashboard.get(
  "/",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const mode = req.query.mode === "teach" ? "teach" : "learn";
    const key = `dashboard:${uid}:${mode}`;
    const cached = await cacheGet<any>(key);
    if (cached) return res.json(cached);
    const [
      roomsQ,
      peopleQ,
      sessionsQ,
      eventsQ,
      connectionsQ,
      taughtQ,
      attendedQ,
      profileQ,
    ] = await Promise.all([
      admin
        .from("rooms")
        .select("*")
        .eq("visibility", "public")
        .in("status", ["open", "scheduled", "live"])
        .order("created_at", { ascending: false })
        .limit(8),
      admin.rpc("recommend_people", { p_user_id: uid, p_limit: 6 }),
      admin
        .from("session_participants")
        .select("sessions(*)")
        .eq("user_id", uid)
        .limit(8),
      admin
        .from("events")
        .select("*")
        .in("status", ["published", "open"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(6),
      admin
        .from("connections")
        .select("*", { count: "exact", head: true })
        .or(`user_a.eq.${uid},user_b.eq.${uid}`),
      admin
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("status", "completed"),
      admin
        .from("session_participants")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("attendance_status", "attended"),
      admin.from("profiles").select("reputation").eq("id", uid).single(),
    ]);
    const result = {
      urgentRooms: roomsQ.data ?? [],
      recommendedPeople: peopleQ.data ?? [],
      upcomingSessions: (sessionsQ.data ?? [])
        .map((x: any) => x.sessions)
        .filter(Boolean),
      events: eventsQ.data ?? [],
      stats: {
        reputation: profileQ.data?.reputation ?? 0,
        connections: connectionsQ.count ?? 0,
        sessionsTaught: taughtQ.count ?? 0,
        sessionsAttended: attendedQ.count ?? 0,
      },
    };
    await cacheSet(key, result, 30);
    res.json(result);
  }),
);
