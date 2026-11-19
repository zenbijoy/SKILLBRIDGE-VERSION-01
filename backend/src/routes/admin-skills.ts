import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { sanitizeIlike } from "../lib/query-helpers.js";
import { audit } from "../services/audit.js";
import { cacheDelPattern } from "../lib/redis.js";
import { requireRole } from "../middleware/auth.js";

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

// Admin create new catalog skill
adminSkillsRoutes.post(
  "/",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(100),
        category: z.string().trim().min(2).max(50).default("general"),
      })
      .parse(req.body);

    const { data, error } = await db
      .from("skills")
      .insert({
        name: body.name,
        category: body.category.toLowerCase(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505" || error.message.includes("unique")) {
        return res.status(409).json({ error: `A skill named "${body.name}" already exists.` });
      }
      throw error;
    }

    await audit(req.userId!, "admin.skill.create", "skill", data.id, {
      name: data.name,
      category: data.category,
    });
    await cacheDelPattern("catalog:*");

    res.status(201).json({ success: true, skill: data });
  }),
);

// Admin update catalog skill
adminSkillsRoutes.patch(
  "/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        category: z.string().trim().min(2).max(50).optional(),
      })
      .refine((data) => data.name !== undefined || data.category !== undefined, {
        message: "At least one field (name or category) is required",
      })
      .parse(req.body);

    const updatePayload: Record<string, string> = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.category !== undefined) updatePayload.category = body.category.toLowerCase();

    const { data, error } = await db
      .from("skills")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505" || error.message.includes("unique")) {
        return res.status(409).json({ error: `A skill with that name already exists.` });
      }
      throw error;
    }

    await audit(req.userId!, "admin.skill.update", "skill", id, updatePayload);
    await cacheDelPattern("catalog:*");

    res.json({ success: true, skill: data });
  }),
);

// Admin delete catalog skill
adminSkillsRoutes.delete(
  "/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const { data: existing, error: readError } = await db
      .from("skills")
      .select("id, name, category")
      .eq("id", id)
      .single();

    if (readError || !existing) {
      return res.status(404).json({ error: "Skill not found" });
    }

    const { error: deleteError } = await db.from("skills").delete().eq("id", id);
    if (deleteError) throw deleteError;

    await audit(req.userId!, "admin.skill.delete", "skill", id, {
      name: existing.name,
      category: existing.category,
    });
    await cacheDelPattern("catalog:*");

    res.json({ success: true, deletedSkillId: id });
  }),
);
