import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const clubs = Router();
clubs.get(
  "/",
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from("clubs")
      .select("*")
      .order("verified", { ascending: false })
      .order("name");
    if (error) throw error;
    res.json({ clubs: data ?? [] });
  }),
);
clubs.get(
  "/mine",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("club_members")
      .select("role,clubs(*)")
      .eq("user_id", req.userId!);
    if (error) throw error;
    res.json({ memberships: data ?? [] });
  }),
);
clubs.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(3).max(120),
        description: z.string().max(2000).optional(),
        university: z.string().max(150).optional(),
      })
      .parse(req.body);
    const { data: clubId, error } = await admin.rpc("create_club_atomic", {
      p_name: b.name,
      p_description: b.description ?? "",
      p_university: b.university ?? "",
      p_owner_id: req.userId!
    });
    if (error) throw error;
    
    const { data } = await admin
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();
      
    res.status(201).json(data);
  }),
);
clubs.post(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const userId = z.string().uuid().parse(req.params.userId);
    const { role } = z
      .object({ role: z.enum(["admin", "member"]) })
      .parse(req.body);
    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!me || !["owner", "admin"].includes(me.role))
      return res.status(403).json({ error: "Club admin required" });
    const { data, error } = await admin
      .from("club_members")
      .upsert(
        { club_id: clubId, user_id: userId, role },
        { onConflict: "club_id,user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
