import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";

export const achievements = Router();
export const achievementsPublic = Router();

const achievementDefSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(5).max(500),
  category: z.enum([
    "skill",
    "goal",
    "tutoring",
    "learning",
    "research",
    "challenge",
    "community",
  ]).default("skill"),
  icon: z.string().max(50).default("trophy"),
  criteria_description: z.string().min(5).max(500),
  points_reward: z.number().int().min(0).max(2000).default(50),
  is_active: z.boolean().default(true),
});

const issueAchievementSchema = z.object({
  user_id: z.string().uuid(),
  achievement_id: z.string().uuid(),
  is_public: z.boolean().default(true),
});

async function verifyAchievementHandler(req: any, res: any) {
  const rawCode = req.params.code;
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";

  if (!code) {
    return res.status(400).json({ error: "Verification code is required" });
  }

  const { data: record, error } = await admin
    .from("user_achievements")
    .select("id, verification_code, is_public, is_revoked, revocation_reason, issued_at, user:profiles(id, full_name, username, avatar_url, campus), achievement:achievement_definitions(id, title, description, category, icon, criteria_description, points_reward)")
    .eq("verification_code", code)
    .maybeSingle();

  if (error) throw error;
  if (!record) {
    return res.status(404).json({ error: "No achievement certificate found with this verification code" });
  }

  if (record.is_revoked) {
    return res.status(410).json({
      verified: false,
      status: "revoked",
      revocation_reason: record.revocation_reason,
      achievement: record.achievement,
    });
  }

  res.json({
    verified: true,
    status: "valid",
    certificate: {
      verification_code: record.verification_code,
      issued_at: record.issued_at,
      is_public: record.is_public,
      recipient: {
        id: (record.user as any)?.id,
        full_name: (record.user as any)?.full_name,
        username: (record.user as any)?.username,
        avatar_url: (record.user as any)?.avatar_url,
        campus: (record.user as any)?.campus,
      },
      achievement: record.achievement,
    },
  });
}

// Mount handler on both public router and authenticated router
achievementsPublic.get("/:code", wrap(verifyAchievementHandler));
achievements.get("/verify/:code", wrap(verifyAchievementHandler));

// GET /api/v1/achievements - List achievements catalog and user's earned badges
achievements.get(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;

    // 1. Fetch active definitions
    const { data: defs, error: defErr } = await admin
      .from("achievement_definitions")
      .select("*")
      .eq("is_active", true)
      .order("points_reward", { ascending: true });

    if (defErr) throw defErr;

    // 2. Fetch user's earned achievements
    const { data: userEarned, error: earnedErr } = await admin
      .from("user_achievements")
      .select("*, achievement:achievement_definitions(*)")
      .eq("user_id", userId);

    if (earnedErr) throw earnedErr;

    const earnedMap = new Map((userEarned || []).map((e) => [e.achievement_id, e]));

    const catalog = (defs || []).map((def) => {
      const earned = earnedMap.get(def.id);
      return {
        ...def,
        is_earned: !!earned,
        earned_details: earned || null,
      };
    });

    res.json({
      achievements: catalog,
      earned_count: (userEarned || []).length,
      total_points_earned: (userEarned || []).reduce((acc, curr) => acc + (curr.achievement?.points_reward || 0), 0),
    });
  }),
);

// GET /api/v1/achievements/:id - Specific achievement definition
achievements.get(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: def, error } = await admin
      .from("achievement_definitions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    const { data: earned } = await admin
      .from("user_achievements")
      .select("*")
      .eq("achievement_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    res.json({
      achievement: {
        ...def,
        is_earned: !!earned,
        earned_details: earned || null,
      },
    });
  }),
);

// PUT /api/v1/achievements/user/:id/visibility - Toggle public/private visibility
achievements.put(
  "/user/:id/visibility",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params; // user_achievement id or achievement_id
    const { is_public } = z.object({ is_public: z.boolean() }).parse(req.body);

    const { data, error } = await admin
      .from("user_achievements")
      .update({ is_public })
      .or(`id.eq.${id},and(user_id.eq.${userId},achievement_id.eq.${id})`)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ achievement: data });
  }),
);

// ADMIN: Create definition
achievements.post(
  "/admin/create",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = achievementDefSchema.parse(req.body);

    const { data, error } = await admin
      .from("achievement_definitions")
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ achievement: data });
  }),
);

// ADMIN: Update definition
achievements.put(
  "/admin/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { id } = req.params;
    const body = achievementDefSchema.partial().parse(req.body);

    const { data, error } = await admin
      .from("achievement_definitions")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ achievement: data });
  }),
);

// ADMIN: Issue achievement to user (Atomic RPC)
achievements.post(
  "/admin/issue",
  requireRole("admin"),
  wrap(async (req, res) => {
    const adminId = req.userId!;
    const body = issueAchievementSchema.parse(req.body);

    const { data, error } = await admin.rpc("issue_achievement_atomic", {
      p_user_id: body.user_id,
      p_achievement_id: body.achievement_id,
      p_issued_by: adminId,
      p_is_public: body.is_public,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data);
  }),
);
