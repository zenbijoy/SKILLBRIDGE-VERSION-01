import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const planner = Router();

const preferencesSchema = z.object({
  preferred_days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  preferred_daily_minutes: z.number().int().min(15).max(720).default(60),
  preferred_modes: z.array(z.string()).default(["online", "hybrid"]),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
  auto_reschedule: z.boolean().default(true),
  timezone: z.string().default("Asia/Dhaka"),
});

const studyBlockSchema = z.object({
  goal_id: z.string().uuid().optional().nullable(),
  skill_id: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480),
  study_mode: z.enum(["online", "offline", "hybrid"]).default("online"),
  reason: z.string().optional(),
  is_custom: z.boolean().default(true),
});

// GET /api/v1/planner/preferences
planner.get(
  "/preferences",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { data: pref, error } = await admin
      .from("study_planner_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!pref) {
      // Return default preferences
      return res.json({
        preferences: {
          user_id: userId,
          preferred_days: [1, 2, 3, 4, 5],
          preferred_daily_minutes: 60,
          preferred_modes: ["online", "hybrid"],
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
          auto_reschedule: true,
          timezone: "Asia/Dhaka",
        },
      });
    }

    res.json({ preferences: pref });
  }),
);

// PUT /api/v1/planner/preferences
planner.put(
  "/preferences",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = preferencesSchema.parse(req.body);

    const { data, error } = await admin
      .from("study_planner_preferences")
      .upsert({
        user_id: userId,
        ...body,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ preferences: data });
  }),
);

// GET /api/v1/planner/week - Get week plan
planner.get(
  "/week",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { start_date } = req.query;

    let startDate: Date;
    if (start_date && typeof start_date === "string") {
      startDate = new Date(start_date);
    } else {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    // Fetch study plan blocks
    const { data: blocks, error: blocksErr } = await admin
      .from("study_plan_blocks")
      .select("*, goal:learning_goals(id, title), skill:skills(id, name)")
      .eq("user_id", userId)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString())
      .order("start_time", { ascending: true });

    if (blocksErr) throw blocksErr;

    // Fetch confirmed bookings in this window
    const { data: bookings, error: bookErr } = await admin
      .from("session_bookings")
      .select("id, start_time, end_time, mode, status, skill:skills(id, name), tutor:profiles!session_bookings_tutor_id_fkey(id, full_name, username)")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .in("status", ["accepted", "confirmed"])
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString());

    if (bookErr) throw bookErr;

    // Fetch active goals
    const { data: activeGoals, error: goalErr } = await admin
      .from("learning_goals")
      .select("id, title, weekly_target_minutes, progress_percent, target_date, skill:skills(id, name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (goalErr) throw goalErr;

    res.json({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      blocks: blocks ?? [],
      bookings: bookings ?? [],
      active_goals: activeGoals ?? [],
    });
  }),
);

// POST /api/v1/planner/generate - Deterministic study plan generation
planner.post(
  "/generate",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { start_date } = req.body || {};

    let startDate: Date;
    if (start_date) {
      startDate = new Date(start_date);
    } else {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    }

    // 1. Fetch user preferences
    const { data: pref } = await admin
      .from("study_planner_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const preferredDays = pref?.preferred_days || [1, 2, 3, 4, 5];
    const dailyMinutes = pref?.preferred_daily_minutes || 60;
    const defaultMode = pref?.preferred_modes?.[0] || "online";

    // 2. Fetch active goals
    const { data: activeGoals } = await admin
      .from("learning_goals")
      .select("id, title, skill_id, weekly_target_minutes, preferred_study_modes, priority, goal_milestones(id, title, is_completed)")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (!activeGoals || activeGoals.length === 0) {
      return res.status(400).json({ error: "No active goals found to generate a study plan for" });
    }

    // 3. Clear non-completed, non-custom blocks for the target week
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    await admin
      .from("study_plan_blocks")
      .delete()
      .eq("user_id", userId)
      .eq("is_custom", false)
      .eq("is_completed", false)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString());

    // 4. Generate deterministic daily blocks
    const newBlocks = [];
    let goalIndex = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 1 is Monday...

      if (preferredDays.includes(dayOfWeek)) {
        const goal = activeGoals[goalIndex % activeGoals.length]!;
        const nextMilestone = (goal.goal_milestones || []).find((m: any) => !m.is_completed);

        const blockStart = new Date(currentDate);
        blockStart.setHours(19, 0, 0, 0); // 7:00 PM default evening study block
        const blockEnd = new Date(blockStart);
        blockEnd.setMinutes(blockEnd.getMinutes() + dailyMinutes);

        newBlocks.push({
          user_id: userId,
          goal_id: goal.id,
          skill_id: goal.skill_id ?? null,
          title: `Study Session: ${goal.title}`,
          description: nextMilestone ? `Focus on milestone: ${nextMilestone.title}` : `Work toward completing ${goal.title}`,
          start_time: blockStart.toISOString(),
          end_time: blockEnd.toISOString(),
          duration_minutes: dailyMinutes,
          study_mode: goal.preferred_study_modes?.[0] || defaultMode,
          reason: `Generated from active goal with target of ${goal.weekly_target_minutes} min/wk`,
          is_completed: false,
          is_custom: false,
        });

        goalIndex++;
      }
    }

    let inserted = [];
    if (newBlocks.length > 0) {
      const { data, error } = await admin
        .from("study_plan_blocks")
        .insert(newBlocks)
        .select();

      if (error) throw error;
      inserted = data ?? [];
    }

    res.json({
      success: true,
      generated_count: inserted.length,
      blocks: inserted,
    });
  }),
);

// POST /api/v1/planner/blocks - Create custom block
planner.post(
  "/blocks",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = studyBlockSchema.parse(req.body);

    const { data, error } = await admin
      .from("study_plan_blocks")
      .insert({
        user_id: userId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ block: data });
  }),
);

// PUT /api/v1/planner/blocks/:id - Update block
planner.put(
  "/blocks/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const body = studyBlockSchema.partial().parse(req.body);

    const { data, error } = await admin
      .from("study_plan_blocks")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ block: data });
  }),
);

// DELETE /api/v1/planner/blocks/:id - Delete block
planner.delete(
  "/blocks/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("study_plan_blocks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true });
  }),
);

// POST /api/v1/planner/blocks/:id/complete - Mark block completed
planner.post(
  "/blocks/:id/complete",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: block, error } = await admin
      .from("study_plan_blocks")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    // Record activity event
    await admin.from("user_activity_events").insert({
      user_id: userId,
      event_type: "study_session",
      event_title: `Completed Study Block: ${block.title}`,
      metadata: { block_id: id, duration_minutes: block.duration_minutes },
      is_verified: true,
    });

    res.json({ block });
  }),
);

// POST /api/v1/planner/blocks/:id/skip - Skip block
planner.post(
  "/blocks/:id/skip",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: block, error } = await admin
      .from("study_plan_blocks")
      .update({
        is_skipped: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ block });
  }),
);
