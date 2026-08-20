import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { bidirectionalFilter, isBlocked } from "../lib/query-helpers.js";
import type { UserSkillWithSkill } from "../types/database.js";
export const profiles = Router();

// Check username availability with normalization
profiles.get(
  "/check-username",
  wrap(async (req, res) => {
    const raw = String(req.query.username || "").trim().toLowerCase();
    if (!raw || raw.length < 3 || raw.length > 30 || !/^[a-z0-9_.]+$/.test(raw)) {
      return res.json({ available: false, reason: "invalid_format" });
    }

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("username", raw)
      .maybeSingle();

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
    const { data: skills } = await admin
      .from("user_skills")
      .select("kind,proficiency,skills(name)")
      .eq("user_id", req.userId!);
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
        full_name: z.string().min(2).max(80).optional(),
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_.]+$/)
          .optional(),
        bio: z.string().max(500).optional(),
        university: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        batch: z.string().max(40).optional(),
        study_mode_preference: z.enum(["online", "offline", "hybrid"]).optional(),
        profile_visibility: z.enum(["public", "connections", "private"]).optional(),
        preferred_locale: z.enum(["en", "bn"]).optional(),
        onboarding_step: z.string().optional(),
        onboarding_status: z.enum(["not_started", "in_progress", "completed", "skipped"]).optional(),
        teachSkills: z.array(z.string().min(1).max(60)).optional(),
        learnSkills: z.array(z.string().min(1).max(60)).optional(),
      })
      .parse(req.body);

    const uid = req.userId!;

    // 1. Calculate profile completeness % and missing fields
    const missing: string[] = [];
    let completedPoints = 0;
    const totalPoints = 7;

    if (body.full_name?.trim()) completedPoints++; else missing.push("full_name");
    if (body.username?.trim()) completedPoints++; else missing.push("username");
    if (body.university?.trim()) completedPoints++; else missing.push("university");
    if (body.department?.trim()) completedPoints++; else missing.push("department");
    if (body.study_mode_preference) completedPoints++; else missing.push("study_mode_preference");
    if ((body.teachSkills?.length ?? 0) > 0) completedPoints++; else missing.push("teach_skills");
    if ((body.learnSkills?.length ?? 0) > 0) completedPoints++; else missing.push("learn_skills");

    const percent = Math.round((completedPoints / totalPoints) * 100);

    const updatePayload: any = {
      profile_completion_percent: percent,
      profile_missing_fields: missing,
      updated_at: new Date().toISOString(),
    };

    if (body.full_name) updatePayload.full_name = body.full_name.trim();
    if (body.username) updatePayload.username = body.username.trim().toLowerCase();
    if (body.bio !== undefined) updatePayload.bio = body.bio.trim();
    if (body.university !== undefined) updatePayload.university = body.university.trim();
    if (body.department !== undefined) updatePayload.department = body.department.trim();
    if (body.batch !== undefined) updatePayload.batch = body.batch.trim();
    if (body.study_mode_preference) updatePayload.study_mode_preference = body.study_mode_preference;
    if (body.profile_visibility) updatePayload.profile_visibility = body.profile_visibility;
    if (body.preferred_locale) updatePayload.preferred_locale = body.preferred_locale;
    if (body.onboarding_step) updatePayload.onboarding_step = body.onboarding_step;
    if (body.onboarding_status) updatePayload.onboarding_status = body.onboarding_status;
    if (body.onboarding_status === "completed") updatePayload.onboarding_completed = true;

    const { data: updatedProfile, error: profileErr } = await admin
      .from("profiles")
      .update(updatePayload)
      .eq("id", uid)
      .select()
      .single();

    if (profileErr) throw profileErr;

    // 2. Atomic Bulk Skill Ingestion
    if (body.teachSkills && body.teachSkills.length > 0) {
      for (const skillName of body.teachSkills) {
        const clean = skillName.trim();
        if (!clean) continue;
        let { data: skill } = await admin.from("skills").select("id").eq("name", clean).maybeSingle();
        if (!skill) {
          const { data: created } = await admin.from("skills").insert({ name: clean, category: "General" }).select("id").single();
          skill = created;
        }
        if (skill) {
          await admin.from("user_skills").upsert({
            user_id: uid,
            skill_id: skill.id,
            kind: "known",
            proficiency: 4,
          }, { onConflict: "user_id,skill_id,kind" });
        }
      }
    }

    if (body.learnSkills && body.learnSkills.length > 0) {
      for (const skillName of body.learnSkills) {
        const clean = skillName.trim();
        if (!clean) continue;
        let { data: skill } = await admin.from("skills").select("id").eq("name", clean).maybeSingle();
        if (!skill) {
          const { data: created } = await admin.from("skills").insert({ name: clean, category: "General" }).select("id").single();
          skill = created;
        }
        if (skill) {
          await admin.from("user_skills").upsert({
            user_id: uid,
            skill_id: skill.id,
            kind: "wanted",
            proficiency: 1,
          }, { onConflict: "user_id,skill_id,kind" });
        }
      }
    }

    res.json({
      success: true,
      profile: updatedProfile,
      completion_percent: percent,
      missing_fields: missing,
    });
  }),
);

// Guided Tour Step Progress & Idempotent Completion
profiles.post(
  "/me/tour/progress",
  wrap(async (req, res) => {
    const { step, isLast = false, skipped = false } = z
      .object({
        step: z.string().min(1),
        isLast: z.boolean().optional().default(false),
        skipped: z.boolean().optional().default(false),
      })
      .parse(req.body);

    const uid = req.userId!;

    if (skipped) {
      await admin
        .from("profiles")
        .update({ guided_tour_status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", uid);
      return res.json({ status: "skipped" });
    }

    const { data: rpcData, error } = await admin.rpc("complete_guided_tour_step_atomic", {
      p_user_id: uid,
      p_step: step,
      p_is_last: isLast,
    });

    if (error) throw error;
    res.json(rpcData);
  }),
);

profiles.patch(
  "/me",
  wrap(async (req, res) => {
    const body = z
      .object({
        full_name: z.string().min(2).max(80).optional(),
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_.]+$/)
          .optional(),
        bio: z.string().max(500).optional(),
        university: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        batch: z.string().max(40).optional(),
        study_mode_preference: z.enum(["online", "offline", "hybrid"]).optional(),
        profile_visibility: z.enum(["public", "connections", "private"]).optional(),
        preferred_locale: z.enum(["en", "bn"]).optional(),
        quiet_hours_start: z.string().optional(),
        quiet_hours_end: z.string().optional(),
        onboarding_completed: z.boolean().optional(),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("profiles")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    res.json({ profile: data });
  }),
);
profiles.post(
  "/me/avatar",
  wrap(async (req, res) => {
    const { imageBase64, contentType = "image/jpeg" } = z
      .object({
        imageBase64: z.string().min(10),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      })
      .parse(req.body);

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const path = `${req.userId}/avatar_${Date.now()}.${ext}`;

    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    const { data, error } = await admin
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", req.userId!)
      .select()
      .single();

    if (error) throw error;

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
    res.status(201).json(data);
  }),
);
profiles.delete(
  "/me/skills/:skillId/:kind",
  wrap(async (req, res) => {
    const skillId = z.string().uuid().parse(req.params.skillId);
    const kind = z.enum(["known", "wanted", "research"]).parse(req.params.kind);
    await admin
      .from("user_skills")
      .delete()
      .eq("user_id", req.userId!)
      .eq("skill_id", skillId)
      .eq("kind", kind);
    res.status(204).end();
  }),
);
