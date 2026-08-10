import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const moderation = Router();
moderation.post(
  "/block/:id",
  wrap(async (req, res) => {
    const blocked = z.string().uuid().parse(req.params.id);
    if (blocked === req.userId)
      return res.status(400).json({ error: "Cannot block yourself" });
    await admin
      .from("blocks")
      .upsert(
        { blocker_id: req.userId!, blocked_id: blocked },
        { onConflict: "blocker_id,blocked_id" },
      );
    const [a, b] = [req.userId!, blocked].sort();
    await admin.from("connections").delete().eq("user_a", a).eq("user_b", b);
    res.status(201).json({ blocked: true });
  }),
);
moderation.delete(
  "/block/:id",
  wrap(async (req, res) => {
    await admin
      .from("blocks")
      .delete()
      .eq("blocker_id", req.userId!)
      .eq("blocked_id", z.string().uuid().parse(req.params.id));
    res.status(204).end();
  }),
);
moderation.post(
  "/report",
  wrap(async (req, res) => {
    const b = z
      .object({
        target_type: z.enum(["user", "message", "room", "event", "resource"]),
        target_id: z.string().uuid(),
        reason: z.string().min(5).max(500),
        details: z.string().max(2000).optional(),
      })
      .parse(req.body);
    const payload: any = {
      reporter_id: req.userId!,
      target_type: b.target_type,
      target_id: b.target_id,
      reason: b.reason,
      details: b.details,
      status: "open",
    };
    if (b.target_type === "user") payload.target_user_id = b.target_id;
    const { data, error } = await admin
      .from("reports")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
