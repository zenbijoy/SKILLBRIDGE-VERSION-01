import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { sanitizeIlike } from "../lib/query-helpers.js";

export const adminSkillsRoutes = Router();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  sort: z.enum(["ratio_desc", "learners_desc", "teachers_desc", "name_asc"]).default("ratio_desc"),
});

adminSkillsRoutes.get(
  "/",
  wrap(async (req, res) => {
    const { page, limit, q, category, sort } = querySchema.parse(req.query);

    // Fetch skills
    let skillsQuery = db.from("skills").select("id, name, category, created_at");
    if (q) {
      const safe = sanitizeIlike(q);
      if (safe) skillsQuery = skillsQuery.ilike("name", `%${safe}%`);
    }
    if (category && category !== "all") {
      skillsQuery = skillsQuery.eq("category", category);
    }

    const { data: skills, error: skillsError } = await skillsQuery;
    if (skillsError) throw skillsError;

    // Fetch user_skills aggregations
    const { data: userSkills, error: usError } = await db
      .from("user_skills")
      .select("skill_id, kind, proficiency, verified");
    if (usError) throw usError;

    // Map skill counts
    const skillStats = new Map<string, { learners: number; teachers: number; researchers: number; verifiedTeachers: number }>();
    for (const us of userSkills ?? []) {
      const current = skillStats.get(us.skill_id) ?? { learners: 0, teachers: 0, researchers: 0, verifiedTeachers: 0 };
      if (us.kind === "wanted") {
        current.learners++;
      } else if (us.kind === "known") {
        current.teachers++;
        if (us.verified) current.verifiedTeachers++;
      } else if (us.kind === "research") {
        current.researchers++;
      }
      skillStats.set(us.skill_id, current);
    }

    // Build enriched items
    const enriched = (skills ?? []).map((skill) => {
      const stats = skillStats.get(skill.id) ?? { learners: 0, teachers: 0, researchers: 0, verifiedTeachers: 0 };
      const ratio = Number((stats.learners / Math.max(1, stats.teachers)).toFixed(1));
      const isShortage = stats.learners >= 2 && stats.teachers === 0;

      return {
        id: skill.id,
        name: skill.name,
        category: skill.category,
        learners: stats.learners,
        teachers: stats.teachers,
        researchers: stats.researchers,
        verifiedTeachers: stats.verifiedTeachers,
        demandSupplyRatio: ratio,
        isShortage,
      };
    });

    // Sort
    enriched.sort((a, b) => {
      if (sort === "ratio_desc") return b.demandSupplyRatio - a.demandSupplyRatio || b.learners - a.learners;
      if (sort === "learners_desc") return b.learners - a.learners;
      if (sort === "teachers_desc") return b.teachers - a.teachers;
      return a.name.localeCompare(b.name);
    });

    const total = enriched.length;
    const paginated = enriched.slice((page - 1) * limit, page * limit);

    // Summary insights
    const shortages = enriched.filter((s) => s.isShortage || s.demandSupplyRatio >= 4).slice(0, 5);
    const topResearch = [...enriched].sort((a, b) => b.researchers - a.researchers).slice(0, 5);

    res.json({
      skills: paginated,
      total,
      page,
      limit,
      insights: {
        criticalShortages: shortages,
        topResearchTopics: topResearch,
      },
    });
  }),
);
