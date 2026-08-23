import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const goals = Router();

const milestoneSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  weight: z.number().int().min(1).max(100),
  order_index: z.number().int().min(0).default(0),
});

const createGoalSchema = z.object({
  skill_id: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  goal_type: z.enum(["learn", "teach", "verify", "research", "project"]).default("learn"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekly_target_minutes: z.number().int().min(15).max(2400).default(120),
  preferred_study_modes: z.array(z.string()).default(["online", "offline", "hybrid"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  visibility: z.enum(["private", "connections", "public"]).default("private"),
  milestones: z.array(milestoneSchema).min(1),
});

const updateGoalSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  goal_type: z.enum(["learn", "teach", "verify", "research", "project"]).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weekly_target_minutes: z.number().int().min(15).max(2400).optional(),
  preferred_study_modes: z.array(z.string()).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  visibility: z.enum(["private", "connections", "public"]).optional(),
  status: z.enum(["draft", "active", "paused", "completed", "abandoned"]).optional(),
  reflection: z.string().max(3000).optional().nullable(),
});

// GET /api/v1/goals - List user goals with milestones
goals.get(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { status, skill_id } = req.query;

    let query = admin
      .from("learning_goals")
      .select("*, milestones:goal_milestones(*), skill:skills(id, name, category)")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status && typeof status === "string") {
      query = query.eq("status", status);
    }
    if (skill_id && typeof skill_id === "string") {
      query = query.eq("skill_id", skill_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ goals: data ?? [] });
  }),
);

// POST /api/v1/goals - Create new goal with milestones
goals.post(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = createGoalSchema.parse(req.body);

    if (body.target_date < body.start_date) {
      return res.status(400).json({ error: "Target date cannot precede start date" });
    }

    const totalWeight = body.milestones.reduce((acc, m) => acc + m.weight, 0);
    if (totalWeight !== 100) {
      return res.status(400).json({
        error: `Milestone weights must sum to exactly 100% (currently ${totalWeight}%)`,
      });
    }

    const { data: goal, error: goalError } = await admin
      .from("learning_goals")
      .insert({
        user_id: userId,
        skill_id: body.skill_id ?? null,
        title: body.title,
        description: body.description ?? null,
        goal_type: body.goal_type,
        start_date: body.start_date,
        target_date: body.target_date,
        weekly_target_minutes: body.weekly_target_minutes,
        preferred_study_modes: body.preferred_study_modes,
        priority: body.priority,
        visibility: body.visibility,
        status: "draft",
        progress_percent: 0,
      })
      .select()
      .single();

    if (goalError) throw goalError;

    const milestoneRows = body.milestones.map((m, index) => ({
      goal_id: goal.id,
      user_id: userId,
      title: m.title,
      description: m.description ?? null,
      weight: m.weight,
      order_index: m.order_index ?? index,
      is_completed: false,
    }));

    const { data: insertedMilestones, error: msError } = await admin
      .from("goal_milestones")
      .insert(milestoneRows)
      .select();

    if (msError) throw msError;

    res.status(201).json({ goal: { ...goal, milestones: insertedMilestones } });
  }),
);

// GET /api/v1/goals/public/:userId - Public/connection visible goals
goals.get(
  "/public/:userId",
  wrap(async (req, res) => {
    const targetUserId = req.params.userId;
    const requesterId = req.userId!;

    // Check if connected
    let isConnected = false;
    if (requesterId !== targetUserId) {
      const { data: conn } = await admin
        .from("connections")
        .select("id")
        .or(`and(user_a.eq.${requesterId},user_b.eq.${targetUserId}),and(user_a.eq.${targetUserId},user_b.eq.${requesterId})`)
        .maybeSingle();
      isConnected = !!conn;
    } else {
      isConnected = true;
    }

    let query = admin
      .from("learning_goals")
      .select("id, title, description, goal_type, start_date, target_date, progress_percent, status, visibility, created_at, skill:skills(id, name), milestones:goal_milestones(id, title, weight, is_completed, order_index)")
      .eq("user_id", targetUserId)
      .is("deleted_at", null);

    if (requesterId === targetUserId) {
      // all
    } else if (isConnected) {
      query = query.in("visibility", ["public", "connections"]);
    } else {
      query = query.eq("visibility", "public");
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ goals: data ?? [] });
  }),
);

// GET /api/v1/goals/:id - Get specific goal
goals.get(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: goal, error } = await admin
      .from("learning_goals")
      .select("*, milestones:goal_milestones(*), skill:skills(id, name, category)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    // Authorization check
    if (goal.user_id !== userId && goal.visibility === "private") {
      return res.status(403).json({ error: "Unauthorized access to private goal" });
    }

    res.json({ goal });
  }),
);

// PUT /api/v1/goals/:id - Update goal details
goals.put(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const body = updateGoalSchema.parse(req.body);

    const { data: existing } = await admin
      .from("learning_goals")
      .select("user_id, status")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: "Goal not found or unauthorized" });
    }

    const { data: updated, error } = await admin
      .from("learning_goals")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, milestones:goal_milestones(*)")
      .single();

    if (error) throw error;

    res.json({ goal: updated });
  }),
);

// DELETE /api/v1/goals/:id - Soft delete goal
goals.delete(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("learning_goals")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true, message: "Goal deleted" });
  }),
);

// POST /api/v1/goals/:id/activate - Atomic activation
goals.post(
  "/:id/activate",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data, error } = await admin.rpc("activate_learning_goal_atomic", {
      p_goal_id: id,
      p_user_id: userId,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  }),
);

// POST /api/v1/goals/:id/milestones - Add milestone
goals.post(
  "/:id/milestones",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const body = milestoneSchema.parse(req.body);

    const { data: goal } = await admin
      .from("learning_goals")
      .select("user_id, status")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!goal || goal.user_id !== userId) {
      return res.status(404).json({ error: "Goal not found or unauthorized" });
    }

    const { data: milestone, error } = await admin
      .from("goal_milestones")
      .insert({
        goal_id: id,
        user_id: userId,
        title: body.title,
        description: body.description ?? null,
        weight: body.weight,
        order_index: body.order_index,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ milestone });
  }),
);

// PUT /api/v1/goals/:id/milestones/:milestoneId - Update milestone
goals.put(
  "/:id/milestones/:milestoneId",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id, milestoneId } = req.params;
    const body = milestoneSchema.partial().parse(req.body);

    const { data: milestone, error } = await admin
      .from("goal_milestones")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", milestoneId)
      .eq("goal_id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ milestone });
  }),
);

// DELETE /api/v1/goals/:id/milestones/:milestoneId - Delete milestone
goals.delete(
  "/:id/milestones/:milestoneId",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id, milestoneId } = req.params;

    const { error } = await admin
      .from("goal_milestones")
      .delete()
      .eq("id", milestoneId)
      .eq("goal_id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true });
  }),
);

// POST /api/v1/goals/:id/milestones/:milestoneId/complete - Complete milestone atomic
goals.post(
  "/:id/milestones/:milestoneId/complete",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { milestoneId } = req.params;
    const { verified_type, verified_id } = req.body || {};

    const { data, error } = await admin.rpc("complete_goal_milestone_atomic", {
      p_milestone_id: milestoneId,
      p_user_id: userId,
      p_verified_type: verified_type ?? null,
      p_verified_id: verified_id ?? null,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  }),
);
