import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { eitherColumnFilter } from "../lib/query-helpers.js";

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
    const uid = req.userId!;

    // 1. Fetch current user profile, skills, and blocked users
    const [myProfileRes, mySkillsRes, blocksRes] = await Promise.all([
      admin.from("profiles").select("id, university, department, study_mode_preference").eq("id", uid).single(),
      admin.from("user_skills").select("skill_id, kind, skills(name)").eq("user_id", uid),
      admin.from("blocks").select("blocker_id,blocked_id").or(eitherColumnFilter("blocker_id", "blocked_id", uid)),
    ]);

    const blocked = new Set(
      (blocksRes.data ?? []).map((x) =>
        x.blocker_id === uid ? x.blocked_id : x.blocker_id,
      ),
    );

    const myKnown = new Set(
      (mySkillsRes.data ?? [])
        .filter((s: any) => s.kind === "known")
        .map((s: any) => s.skills?.name)
        .filter(Boolean),
    );

    const myWanted = new Set(
      (mySkillsRes.data ?? [])
        .filter((s: any) => s.kind === "wanted")
        .map((s: any) => s.skills?.name)
        .filter(Boolean),
    );

    // 2. Fetch candidates with skills
    const { data: candidates, error } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, bio, university, department, study_mode_preference, reputation, user_skills(kind, proficiency, verified, skills(name))")
      .neq("id", uid)
      .eq("account_status", "active")
      .eq("profile_visibility", "public")
      .limit(50);

    if (error) throw error;

    const scoredMatches: any[] = [];

    for (const c of candidates ?? []) {
      if (blocked.has(c.id)) continue;

      const cKnown = new Set<string>();
      const cWanted = new Set<string>();
      let verifiedQualityBonus = 0;

      (c.user_skills ?? []).forEach((us: any) => {
        const name = us.skills?.name;
        if (!name) return;
        if (us.kind === "known") {
          cKnown.add(name);
          if (us.verified) verifiedQualityBonus += 2;
        } else if (us.kind === "wanted") {
          cWanted.add(name);
        }
      });

      // 1. Skill overlap (0-40)
      const sharedKnown = Array.from(cKnown).filter((s) => myKnown.has(s));
      const skillOverlapScore = Math.min(40, sharedKnown.length * 15);

      // 2. Teach/Want complement (0-25)
      const canTeachMe = Array.from(cKnown).filter((s) => myWanted.has(s));
      const canLearnFromMe = Array.from(cWanted).filter((s) => myKnown.has(s));
      const complementScore = Math.min(25, (canTeachMe.length + canLearnFromMe.length) * 12);

      // 3. Same university/department (0-10)
      let campusScore = 0;
      if (myProfileRes.data?.university && c.university === myProfileRes.data.university) {
        campusScore += 6;
      }
      if (myProfileRes.data?.department && c.department === myProfileRes.data.department) {
        campusScore += 4;
      }

      // 4. Compatible study mode (0-10)
      let studyModeScore = 0;
      if (
        myProfileRes.data?.study_mode_preference === c.study_mode_preference ||
        c.study_mode_preference === "hybrid" ||
        myProfileRes.data?.study_mode_preference === "hybrid"
      ) {
        studyModeScore = 10;
      }

      // 5. Verified contribution quality (0-5)
      const qualityScore = Math.min(5, verifiedQualityBonus);

      const totalRawScore = skillOverlapScore + complementScore + campusScore + studyModeScore + qualityScore;
      const matchPercentage = Math.min(99, Math.max(65, Math.round(55 + (totalRawScore / 90) * 44)));

      const reasons: string[] = [];
      if (canTeachMe.length > 0) {
        reasons.push(`Can teach you ${canTeachMe.slice(0, 2).join(", ")}`);
      } else if (sharedKnown.length > 0) {
        reasons.push(`Shares knowledge in ${sharedKnown.slice(0, 2).join(", ")}`);
      } else if (campusScore > 0) {
        reasons.push(`Peer at ${c.university || c.department}`);
      } else {
        reasons.push("Compatible peer learning match");
      }

      scoredMatches.push({
        profile: {
          id: c.id,
          full_name: c.full_name,
          username: c.username,
          avatar_url: c.avatar_url,
          bio: c.bio,
          university: c.university,
          department: c.department,
          study_mode_preference: c.study_mode_preference,
          reputation: c.reputation,
        },
        matchPercentage,
        sharedSkills: Array.from(new Set([...canTeachMe, ...sharedKnown])).slice(0, 3),
        matchReason: reasons[0],
      });
    }

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
