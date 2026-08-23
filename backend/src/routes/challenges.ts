import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";

export const challenges = Router();

const challengeSchema = z.object({
  title: z.string().min(2).max(150),
  description: z.string().min(5).max(1000),
  challenge_type: z.enum([
    "daily",
    "weekly",
    "campus",
    "skill",
    "room",
    "event",
    "research",
    "tutor",
    "learner",
    "onboarding",
  ]).default("weekly"),
  target_activity_type: z.string().min(2).max(100),
  target_count: z.number().int().min(1).max(1000).default(1),
  points_reward: z.number().int().min(0).max(1000).default(25),
  badge_reward: z.string().max(100).optional().nullable(),
  start_at: z.string().datetime().default(() => new Date().toISOString()),
  end_at: z.string().datetime(),
  is_active: z.boolean().default(true),
  target_roles: z.array(z.string()).default(["student", "tutor", "peer_tutor", "club_admin", "researcher"]),
  target_campuses: z.array(z.string()).optional().nullable(),
});

// GET /api/v1/challenges - Active challenges with user progress derived server-side
challenges.get(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const now = new Date().toISOString();

    // 1. Fetch active challenges
    const { data: defs, error: defErr } = await admin
      .from("challenge_definitions")
      .select("*")
      .eq("is_active", true)
      .lte("start_at", now)
      .gt("end_at", now)
      .order("end_at", { ascending: true });

    if (defErr) throw defErr;

    // 2. Fetch existing user progress
    const { data: userProgress, error: progErr } = await admin
      .from("challenge_progress")
      .select("*")
      .eq("user_id", userId);

    if (progErr) throw progErr;

    const progressMap = new Map((userProgress || []).map((p) => [p.challenge_id, p]));

    // 3. For each challenge, evaluate server-side activity count if not already claimed
    const enriched = await Promise.all(
      (defs || []).map(async (ch) => {
        let currentProg = progressMap.get(ch.id);

        if (!currentProg || (currentProg.status !== "claimed" && currentProg.status !== "completed_unclaimed")) {
          // Count verified activity events within challenge time window
          let query = admin
            .from("user_activity_events")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", ch.start_at)
            .lte("created_at", ch.end_at);

          if (ch.target_activity_type !== "any") {
            query = query.eq("event_type", ch.target_activity_type);
          }

          const { count, error } = await query;
          const actualCount = count || 0;

          let newStatus = "active";
          if (actualCount >= ch.target_count) {
            newStatus = "completed_unclaimed";
          }

          // Upsert progress
          const { data: savedProg } = await admin
            .from("challenge_progress")
            .upsert(
              {
                user_id: userId,
                challenge_id: ch.id,
                current_count: actualCount,
                status: currentProg?.status === "claimed" ? "claimed" : newStatus,
                completed_at: actualCount >= ch.target_count ? (currentProg?.completed_at || new Date().toISOString()) : null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,challenge_id" },
            )
            .select()
            .single();

          currentProg = savedProg || currentProg;
        }

        return {
          ...ch,
          progress: currentProg || {
            user_id: userId,
            challenge_id: ch.id,
            current_count: 0,
            status: "active",
            completed_at: null,
            claimed_at: null,
          },
        };
      }),
    );

    res.json({ challenges: enriched });
  }),
);

// GET /api/v1/challenges/:id - Single challenge
challenges.get(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: ch, error } = await admin
      .from("challenge_definitions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    const { data: prog } = await admin
      .from("challenge_progress")
      .select("*")
      .eq("challenge_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    res.json({ challenge: { ...ch, progress: prog } });
  }),
);

// POST /api/v1/challenges/:id/claim - Claim challenge reward (Atomic RPC)
challenges.post(
  "/:id/claim",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data, error } = await admin.rpc("claim_challenge_reward_atomic", {
      p_challenge_id: id,
      p_user_id: userId,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  }),
);

// ADMIN ROUTES
challenges.post(
  "/admin/create",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = challengeSchema.parse(req.body);

    const { data, error } = await admin
      .from("challenge_definitions")
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ challenge: data });
  }),
);

challenges.put(
  "/admin/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { id } = req.params;
    const body = challengeSchema.partial().parse(req.body);

    const { data, error } = await admin
      .from("challenge_definitions")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ challenge: data });
  }),
);

challenges.delete(
  "/admin/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { id } = req.params;

    const { error } = await admin
      .from("challenge_definitions")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ success: true });
  }),
);
