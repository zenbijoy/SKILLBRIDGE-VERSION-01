import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const recommendations = Router();
recommendations.get(
  "/people",
  wrap(async (req, res) => {
    const { data, error } = await admin.rpc("recommend_people", {
      p_user_id: req.userId!,
      p_limit: 20,
    });
    if (error) throw error;
    res.json({ people: data ?? [] });
  }),
);

recommendations.get(
  "/ai-matches",
  wrap(async (req, res) => {
    // 1. Fetch current user profile & wanted skills
    const [myProfileRes, mySkillsRes] = await Promise.all([
      admin.from("profiles").select("id, university, department").eq("id", req.userId!).single(),
      admin.from("user_skills").select("skill_id, kind, skills(name)").eq("user_id", req.userId!),
    ]);

    const myWanted = (mySkillsRes.data ?? [])
      .filter((s: any) => s.kind === "wanted")
      .map((s: any) => s.skills?.name)
      .filter(Boolean);

    // 2. Fetch candidates with skills they can teach
    const { data: candidates, error } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, bio, university, department, reputation, user_skills(kind, skills(name))")
      .neq("id", req.userId!)
      .neq("profile_visibility", "private")
      .limit(30);

    if (error) throw error;

    const scoredMatches = (candidates ?? []).map((c: any) => {
      const teachSkills = (c.user_skills ?? [])
        .filter((s: any) => s.kind === "known")
        .map((s: any) => s.skills?.name)
        .filter(Boolean);

      const commonSkills = teachSkills.filter((s: string) => myWanted.includes(s));
      let matchScore = 75;

      if (commonSkills.length > 0) {
        matchScore += Math.min(20, commonSkills.length * 10);
      }
      if (myProfileRes.data?.university && c.university === myProfileRes.data.university) {
        matchScore += 4;
      }

      const matchPercentage = Math.min(99, Math.max(78, matchScore));
      const reason = commonSkills.length > 0
        ? `Can teach you ${commonSkills.join(", ")}`
        : c.department
        ? `Top peer in ${c.department}`
        : "Matched for peer study";

      return {
        profile: {
          id: c.id,
          full_name: c.full_name,
          username: c.username,
          avatar_url: c.avatar_url,
          bio: c.bio,
          university: c.university,
          department: c.department,
          reputation: c.reputation,
        },
        matchPercentage,
        sharedSkills: teachSkills.slice(0, 3),
        matchReason: reason,
      };
    });

    scoredMatches.sort((a, b) => b.matchPercentage - a.matchPercentage);
    res.json({ matches: scoredMatches.slice(0, 15) });
  }),
);
recommendations.get(
  "/research",
  wrap(async (req, res) => {
    const interest = z
      .string()
      .min(2)
      .max(100)
      .parse(req.query.interest ?? "research");
    const { data: skillRows } = await admin
      .from("skills")
      .select("id,name")
      .ilike("name", `%${interest}%`)
      .limit(10);
    const ids = (skillRows ?? []).map((x) => x.id);
    let people: any[] = [];
    if (ids.length) {
      const { data } = await admin
        .from("user_skills")
        .select("profiles!user_skills_user_id_fkey(*)")
        .in("skill_id", ids)
        .neq("user_id", req.userId!)
        .limit(40);
      people = Array.from(
        new Map(
          (data ?? []).map((x: any) => [x.profiles.id, x.profiles]),
        ).values(),
      );
    }
    res.json({ people, topics: (skillRows ?? []).map((x) => x.name) });
  }),
);
