import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { bidirectionalFilter, isBlocked } from "../lib/query-helpers.js";
import type { UserSkillWithSkill } from "../types/database.js";
import { cacheDelPattern } from "../lib/redis.js";
export const profiles = Router();

const onboardingSteps = [
  "language",
  "identity",
  "academic",
  "mission",
  "skills",
  "preferences",
  "privacy",
  "notifications",
  "review",
  "completed",
] as const;

const skillListSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((items) => [...new Map(items.map((item) => [item.toLocaleLowerCase(), item])).values()]);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_+./:-]+$/)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone");

// Check username availability with normalization
profiles.get(
  "/check-username",
  wrap(async (req, res) => {
    const raw = String(req.query.username || "").trim().toLowerCase();
    if (!raw || raw.length < 3 || raw.length > 30 || !/^[a-z0-9_.]+$/.test(raw)) {
      return res.json({ available: false, reason: "invalid_format" });
    }

    const { data: existing, error } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", raw)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (existing && existing.id !== req.userId) {
      return res.json({ available: false, reason: "taken" });
    }

    res.json({ available: true, username: raw });
  }),
);

profiles.get(
  "/me",
  wrap(async (req, res) => {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", req.userId!)
      .single();
    if (error) throw error;
    const { data: skills, error: skillsError } = await admin
      .from("user_skills")
      .select("kind,proficiency,skills(name)")
      .eq("user_id", req.userId!);
    if (skillsError) throw skillsError;
    const typedSkills = (skills ?? []) as unknown as UserSkillWithSkill[];
    res.json({
      profile,
      skillsKnown: typedSkills
        .filter((x) => x.kind === "known")
        .map((x) => ({ name: x.skills?.name ?? "", proficiency: x.proficiency })),
      skillsWanted: typedSkills
        .filter((x) => x.kind === "wanted")
        .map((x) => ({ name: x.skills?.name ?? "", proficiency: x.proficiency })),
    });
  }),
);

// Transactional Bulk Onboarding Step / Full Save
profiles.post(
  "/me/onboarding/bulk",
  wrap(async (req, res) => {
    const body = z
      .object({
        full_name: z.string().trim().min(2).max(80).optional(),
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_.]+$/)
          .transform((value) => value.toLocaleLowerCase())
          .optional(),
        bio: z.string().max(500).optional(),
        university: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        batch: z.string().max(40).optional(),
        study_mode_preference: z.enum(["online", "offline", "hybrid"]).optional(),
        profile_visibility: z.enum(["public", "connections", "private"]).optional(),
        preferred_locale: z.enum(["en", "bn"]).optional(),
        onboarding_step: z.enum(onboardingSteps).optional(),
        onboarding_status: z.enum(["not_started", "in_progress", "completed", "skipped"]).optional(),
        onboarding_version: z.number().int().min(1).max(1000).optional(),
        onboarding_mission: z.enum(["learn", "teach", "both", "research"]).optional(),
        onboarding_push_opt_in: z.boolean().optional(),
        timezone: timezoneSchema.optional(),
        teachSkills: skillListSchema.optional(),
        learnSkills: skillListSchema.optional(),
      })
      .parse(req.body);

    const uid = req.userId!;
    const { teachSkills, learnSkills, ...profilePayload } = body;
    const { data, error } = await admin.rpc("save_onboarding_progress_atomic", {
      p_user_id: uid,
      p_profile: profilePayload,
      p_teach_skills: teachSkills ?? null,
      p_learn_skills: learnSkills ?? null,
    });

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Username is already taken" });
      }
      throw error;
    }

    await cacheDelPattern(`dashboard:${uid}:*`);
    res.json({ success: true, ...(data as Record<string, unknown>) });
  }),
);

// Guided Tour Step Progress & Idempotent Completion
profiles.post(
  "/me/tour/progress",
  wrap(async (req, res) => {
    const { step, isLast = false, skipped = false, version = 1 } = z
      .object({
        step: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/),
        isLast: z.boolean().optional().default(false),
        skipped: z.boolean().optional().default(false),
        version: z.number().int().min(1).max(1000).optional().default(1),
      })
      .parse(req.body);

    const uid = req.userId!;

    if (skipped) {
      const { data, error } = await admin
        .from("profiles")
        .update({
          guided_tour_version: version,
          guided_tour_last_step: step,
          guided_tour_status: "skipped",
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid)
        .select("guided_tour_status,guided_tour_version,guided_tour_last_step")
        .single();
      if (error) throw error;
      await cacheDelPattern(`dashboard:${uid}:*`);
      return res.json(data);
    }

    const { data: rpcData, error } = await admin.rpc("complete_guided_tour_step_atomic", {
      p_user_id: uid,
      p_step: step,
      p_is_last: isLast,
      p_version: version,
    });

    if (error) throw error;
    await cacheDelPattern(`dashboard:${uid}:*`);
    res.json(rpcData);
  }),
);

profiles.patch(
  "/me",
  wrap(async (req, res) => {
    const body = z
      .object({
        full_name: z.string().trim().min(2).max(80).optional(),
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_.]+$/)
          .transform((value) => value.toLocaleLowerCase())
          .optional(),
        bio: z.string().max(500).optional(),
        university: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        batch: z.string().max(40).optional(),
        study_mode_preference: z.enum(["online", "offline", "hybrid"]).optional(),
        profile_visibility: z.enum(["public", "connections", "private"]).optional(),
        preferred_locale: z.enum(["en", "bn"]).optional(),
        quiet_hours_start: timeSchema.optional(),
        quiet_hours_end: timeSchema.optional(),
        timezone: timezoneSchema.optional(),
      })
      .strict()
      .parse(req.body);
    const { data, error } = await admin
      .from("profiles")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", req.userId!)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Username is already taken" });
      throw error;
    }
    await cacheDelPattern(`dashboard:${req.userId!}:*`);
    res.json({ profile: data });
  }),
);
profiles.post(
  "/me/avatar",
  wrap(async (req, res) => {
    const { imageBase64, contentType = "image/jpeg" } = z
      .object({
        imageBase64: z.string().min(16).max(1_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      })
      .parse(req.body);

    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length > 700_000) {
      return res.status(413).json({ error: "Avatar image must be 700 KB or smaller" });
    }

    const detectedType = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? "image/jpeg"
      : buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ? "image/png"
        : buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
          ? "image/webp"
          : null;
    if (!detectedType || detectedType !== contentType) {
      return res.status(400).json({ error: "Avatar content does not match its declared image type" });
    }

    const path = `${req.userId}/avatar`;

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { data, error } = await admin
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", req.userId!)
      .select()
      .single();

    if (error) throw error;

    await cacheDelPattern(`dashboard:${req.userId!}:*`);

    res.json({ avatar_url: avatarUrl, profile: data });
  }),
);
profiles.get(
  "/me/privacy",
  wrap(async (req, res) => {
    const { data: p } = await admin
      .from("profiles")
      .select("profile_visibility")
      .eq("id", req.userId!)
      .single();
    const { data: b } = await admin
      .from("blocks")
      .select("blocked_id,profiles!blocks_blocked_id_fkey(id,full_name)")
      .eq("blocker_id", req.userId!);
    res.json({
      visibility: p?.profile_visibility ?? "public",
      blocked: (b ?? []).map((x: any) => x.profiles),
    });
  }),
);
profiles.patch(
  "/me/privacy",
  wrap(async (req, res) => {
    const body = z
      .object({
        profile_visibility: z.enum(["public", "connections", "private"]),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("profiles")
      .update(body)
      .eq("id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    res.json({ profile: data });
  }),
);
profiles.get(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const blocked = await isBlocked(req.userId!, id);
    if (blocked)
      return res.status(404).json({ error: "Profile unavailable" });
    const { data: profile, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (profile.profile_visibility === "private" && id !== req.userId)
      return res.status(403).json({ error: "Private profile" });
    const { data: skills } = await admin
      .from("user_skills")
      .select("kind,proficiency,skills(name)")
      .eq("user_id", id);
    const { data: connection } = await admin
      .from("connection_requests")
      .select("status")
      .or(
        bidirectionalFilter("requester_id", "recipient_id", req.userId!, id),
      )
      .maybeSingle();
    const [a, b] = [req.userId!, id].sort();
    const { data: edge } = await admin
      .from("connections")
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (
      profile.profile_visibility === "connections" &&
      !edge &&
      id !== req.userId
    )
      return res.status(403).json({ error: "Connections-only profile" });
    const { data: mutualCount } = await admin.rpc("mutual_connection_count", {
      p_user_a: req.userId!,
      p_user_b: id,
    });
    const userSkills = (skills ?? []) as unknown as UserSkillWithSkill[];
    res.json({
      profile,
      skills: userSkills.map((x) => ({
        name: x.skills?.name ?? "",
        kind: x.kind,
        proficiency: x.proficiency,
      })),
      mutualCount: mutualCount ?? 0,
      connectionStatus: edge ? "accepted" : (connection?.status ?? "none"),
    });
  }),
);
profiles.post(
  "/me/skills",
  wrap(async (req, res) => {
    const b = z
      .object({
        skill_id: z.string().uuid(),
        kind: z.enum(["known", "wanted", "research"]),
        proficiency: z.number().int().min(1).max(5),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("user_skills")
      .upsert(
        { user_id: req.userId!, ...b },
        { onConflict: "user_id,skill_id,kind" },
      )
      .select("*,skills(name,category)")
      .single();
    if (error) throw error;
    await cacheDelPattern(`dashboard:${req.userId!}:*`);
    res.status(201).json(data);
  }),
);
profiles.delete(
  "/me/skills/:skillId/:kind",
  wrap(async (req, res) => {
    const skillId = z.string().uuid().parse(req.params.skillId);
    const kind = z.enum(["known", "wanted", "research"]).parse(req.params.kind);
    const { error } = await admin
      .from("user_skills")
      .delete()
      .eq("user_id", req.userId!)
      .eq("skill_id", skillId)
      .eq("kind", kind);
    if (error) throw error;
    await cacheDelPattern(`dashboard:${req.userId!}:*`);
    res.status(204).end();
  }),
);
