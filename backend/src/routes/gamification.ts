import { Router } from "express";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const gamification = Router();

gamification.get(
  "/leaderboard",
  wrap(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : "reputation";

    const { data: profiles, error } = await admin
      .from("profiles")
      .select(
        "id, full_name, username, avatar_url, bio, university, department, batch, roles, reputation, profile_visibility",
      )
      .eq("account_status", "active")
      .neq("profile_visibility", "private")
      .order("reputation", { ascending: false })
      .limit(50);

    if (error) throw error;

    const userIds = (profiles ?? []).map((p) => p.id);

    if (userIds.length === 0) {
      return res.json({ leaders: [], category });
    }

    // Batch query counts across the schema
    const [taughtRows, attendedRows, researchRows] = await Promise.all([
      admin
        .from("sessions")
        .select("teacher_id")
        .in("teacher_id", userIds)
        .eq("status", "completed"),
      admin
        .from("session_participants")
        .select("user_id")
        .in("user_id", userIds)
        .in("status", ["confirmed", "attended"]),
      admin
        .from("research_projects")
        .select("owner_id")
        .in("owner_id", userIds),
    ]);

    // Map counts in-memory in O(N)
    const taughtMap = new Map<string, number>();
    (taughtRows.data ?? []).forEach((r: any) => {
      taughtMap.set(r.teacher_id, (taughtMap.get(r.teacher_id) || 0) + 1);
    });

    const attendedMap = new Map<string, number>();
    (attendedRows.data ?? []).forEach((r: any) => {
      attendedMap.set(r.user_id, (attendedMap.get(r.user_id) || 0) + 1);
    });

    const researchMap = new Map<string, number>();
    (researchRows.data ?? []).forEach((r: any) => {
      researchMap.set(r.owner_id, (researchMap.get(r.owner_id) || 0) + 1);
    });

    const leaders = (profiles ?? []).map((p) => ({
      ...p,
      sessions_taught: taughtMap.get(p.id) || 0,
      sessions_attended: attendedMap.get(p.id) || 0,
      research_count: researchMap.get(p.id) || 0,
    }));

    // Sort by requested category
    let sorted = leaders;
    if (category === "tutors") {
      sorted = leaders.sort((a, b) => b.sessions_taught - a.sessions_taught || b.reputation - a.reputation);
    } else if (category === "learners") {
      sorted = leaders.sort((a, b) => b.sessions_attended - a.sessions_attended || b.reputation - a.reputation);
    } else if (category === "research") {
      sorted = leaders.sort((a, b) => b.research_count - a.research_count || b.reputation - a.reputation);
    } else {
      sorted = leaders.sort((a, b) => b.reputation - a.reputation);
    }

    res.json({ leaders: sorted, category });
  }),
);

gamification.get(
  "/ledger",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("points_ledger")
      .select("*")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ entries: data ?? [] });
  }),
);
