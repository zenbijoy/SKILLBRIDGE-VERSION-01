import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
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
    res.json({
      profile,
      skillsKnown: (skills ?? [])
        .filter((x) => x.kind === "known")
        .map((x: any) => ({ name: x.skills.name, proficiency: x.proficiency })),
      skillsWanted: (skills ?? [])
        .filter((x) => x.kind === "wanted")
        .map((x: any) => ({ name: x.skills.name, proficiency: x.proficiency })),
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
    const { data: blocked } = await admin
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${req.userId},blocked_id.eq.${id}),and(blocker_id.eq.${id},blocked_id.eq.${req.userId})`,
      )
      .limit(1);
    if (blocked?.length)
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
        `and(requester_id.eq.${req.userId},recipient_id.eq.${id}),and(requester_id.eq.${id},recipient_id.eq.${req.userId})`,
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
    res.json({
      profile,
      skills: (skills ?? []).map((x: any) => ({
        name: x.skills.name,
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
