import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const activity = Router();

// GET /api/v1/activity - Paginated activity timeline
activity.get(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { limit = "30", offset = "0", event_type } = req.query;

    const pageLimit = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
    const pageOffset = Math.max(0, parseInt(offset as string, 10) || 0);

    let query = admin
      .from("user_activity_events")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1);

    if (event_type && typeof event_type === "string") {
      query = query.eq("event_type", event_type);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      events: data ?? [],
      total_count: count ?? 0,
      limit: pageLimit,
      offset: pageOffset,
    });
  }),
);

// POST /api/v1/activity - Record activity event
activity.post(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        event_type: z.enum([
          "goal_milestone",
          "study_session",
          "room_join",
          "session_taught",
          "session_attended",
          "quiz_completed",
          "skill_verified",
          "research_update",
          "booking_completed",
          "achievement_earned",
          "challenge_claimed",
        ]),
        event_title: z.string().min(2).max(200),
        metadata: z.record(z.string(), z.any()).default({}),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("user_activity_events")
      .insert({
        user_id: userId,
        event_type: body.event_type,
        event_title: body.event_title,
        metadata: body.metadata,
        is_verified: true,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ event: data });
  }),
);
