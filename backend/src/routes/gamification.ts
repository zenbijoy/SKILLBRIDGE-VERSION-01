import { Router } from "express";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const gamification = Router();
gamification.get(
  "/leaderboard",
  wrap(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : "reputation";

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
        const [taughtRes, attendedRes, researchRes] = await Promise.all([
          admin
            .from("sessions")
            .select("*", { count: "exact", head: true })
            .eq("teacher_id", p.id)
            .eq("status", "completed"),
          admin
            .from("session_attendees")
            .select("*", { count: "exact", head: true })
            .eq("user_id", p.id),
          admin
            .from("research_projects")
            .select("*", { count: "exact", head: true })
            .eq("lead_author_id", p.id),
        ]);

        return {
          ...p,
          sessions_taught: taughtRes.count ?? 0,
          sessions_attended: attendedRes.count ?? 0,
          research_count: researchRes.count ?? 0,
        };
      }),
    );

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
