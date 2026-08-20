import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const gamification = Router();

const leaderboardQuerySchema = z.object({
  category: z.enum(["reputation", "tutors", "learners", "research"]).default("reputation"),
  timeWindow: z.enum(["weekly", "monthly", "all-time"]).default("all-time"),
  campus: z.string().optional(),
});

gamification.get(
  "/leaderboard",
  wrap(async (req, res) => {
    const { category, timeWindow, campus } = leaderboardQuerySchema.parse(req.query);

    // Calculate time filter timestamp if applicable
    let sinceDate: string | null = null;
    if (timeWindow === "weekly") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      sinceDate = d.toISOString();
    } else if (timeWindow === "monthly") {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      sinceDate = d.toISOString();
    }

    if (category === "tutors") {
      // Query completed sessions taught
      let query = admin
        .from("sessions")
        .select("teacher_id, starts_at")
        .eq("status", "completed");

      if (sinceDate) {
        query = query.gte("starts_at", sinceDate);
      }

      const { data: sessionRows, error: sessErr } = await query;
      if (sessErr) throw sessErr;

      const tutorCounts = new Map<string, number>();
      (sessionRows ?? []).forEach((s: any) => {
        tutorCounts.set(s.teacher_id, (tutorCounts.get(s.teacher_id) || 0) + 1);
      });

      const topTutorIds = Array.from(tutorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([id]) => id);

      if (topTutorIds.length === 0) {
        return res.json({ leaders: [], category, timeWindow });
      }

      let profileQuery = admin
        .from("profiles")
        .select("id, full_name, username, avatar_url, bio, university, department, batch, roles, reputation, profile_visibility")
        .eq("account_status", "active")
        .eq("profile_visibility", "public")
        .in("id", topTutorIds);

      if (campus) {
        profileQuery = profileQuery.ilike("university", `%${campus}%`);
      }

      const { data: profiles, error: profErr } = await profileQuery;
      if (profErr) throw profErr;

      const leaders = (profiles ?? [])
        .map((p) => ({
          ...p,
          sessions_taught: tutorCounts.get(p.id) || 0,
          sessions_attended: 0,
          research_count: 0,
        }))
        .sort((a, b) => b.sessions_taught - a.sessions_taught || b.reputation - a.reputation);

      return res.json({ leaders, category, timeWindow });
    }

    if (category === "learners") {
      // Query verified attendance only
      let query = admin
        .from("session_participants")
        .select("user_id, created_at")
        .or("attendance_status.eq.attended,status.eq.attended");

      if (sinceDate) {
        query = query.gte("created_at", sinceDate);
      }

      const { data: partRows, error: partErr } = await query;
      if (partErr) throw partErr;

      const learnerCounts = new Map<string, number>();
      (partRows ?? []).forEach((p: any) => {
        learnerCounts.set(p.user_id, (learnerCounts.get(p.user_id) || 0) + 1);
      });

      const topLearnerIds = Array.from(learnerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([id]) => id);

      if (topLearnerIds.length === 0) {
        return res.json({ leaders: [], category, timeWindow });
      }

      let profileQuery = admin
        .from("profiles")
        .select("id, full_name, username, avatar_url, bio, university, department, batch, roles, reputation, profile_visibility")
        .eq("account_status", "active")
        .eq("profile_visibility", "public")
        .in("id", topLearnerIds);

      if (campus) {
        profileQuery = profileQuery.ilike("university", `%${campus}%`);
      }

      const { data: profiles, error: profErr } = await profileQuery;
      if (profErr) throw profErr;

      const leaders = (profiles ?? [])
        .map((p) => ({
          ...p,
          sessions_taught: 0,
          sessions_attended: learnerCounts.get(p.id) || 0,
          research_count: 0,
        }))
        .sort((a, b) => b.sessions_attended - a.sessions_attended || b.reputation - a.reputation);

      return res.json({ leaders, category, timeWindow });
    }

    if (category === "research") {
      // Query active/completed public research projects
      let query = admin
        .from("research_projects")
        .select("owner_id, created_at")
        .in("status", ["active", "completed"])
        .eq("visibility", "public");

      if (sinceDate) {
        query = query.gte("created_at", sinceDate);
      }

      const { data: researchRows, error: resErr } = await query;
      if (resErr) throw resErr;

      const researchCounts = new Map<string, number>();
      (researchRows ?? []).forEach((r: any) => {
        researchCounts.set(r.owner_id, (researchCounts.get(r.owner_id) || 0) + 1);
      });

      const topResearcherIds = Array.from(researchCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([id]) => id);

      if (topResearcherIds.length === 0) {
        return res.json({ leaders: [], category, timeWindow });
      }

      let profileQuery = admin
        .from("profiles")
        .select("id, full_name, username, avatar_url, bio, university, department, batch, roles, reputation, profile_visibility")
        .eq("account_status", "active")
        .eq("profile_visibility", "public")
        .in("id", topResearcherIds);

      if (campus) {
        profileQuery = profileQuery.ilike("university", `%${campus}%`);
      }

      const { data: profiles, error: profErr } = await profileQuery;
      if (profErr) throw profErr;

      const leaders = (profiles ?? [])
        .map((p) => ({
          ...p,
          sessions_taught: 0,
          sessions_attended: 0,
          research_count: researchCounts.get(p.id) || 0,
        }))
        .sort((a, b) => b.research_count - a.research_count || b.reputation - a.reputation);

      return res.json({ leaders, category, timeWindow });
    }

    // Default: Overall Reputation Leaderboard
    let query = admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, bio, university, department, batch, roles, reputation, profile_visibility")
      .eq("account_status", "active")
      .eq("profile_visibility", "public")
      .order("reputation", { ascending: false })
      .limit(50);

    if (campus) {
      query = query.ilike("university", `%${campus}%`);
    }

    const { data: profiles, error } = await query;
    if (error) throw error;

    const leaders = (profiles ?? []).map((p) => ({
      ...p,
      sessions_taught: 0,
      sessions_attended: 0,
      research_count: 0,
    }));

    res.json({ leaders, category, timeWindow });
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
