import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { bidirectionalFilter, isBlocked } from "../lib/query-helpers.js";
import type { UserSkillWithSkill } from "../types/database.js";
export const profiles = Router();
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
