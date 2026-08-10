import { Router } from "express";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const gamification = Router();
gamification.get(
  "/leaderboard",
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id,full_name,username,avatar_url,bio,university,department,batch,roles,reputation,profile_visibility",
      )
      .neq("profile_visibility", "private")
      .order("reputation", { ascending: false })
      .limit(50);
    if (error) throw error;
    const leaders = await Promise.all(
      (data ?? []).map(async (p) => {
        const { count } = await admin
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("teacher_id", p.id)
          .eq("status", "completed");
        return { ...p, sessions_taught: count ?? 0 };
      }),
    );
    res.json({ leaders });
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
