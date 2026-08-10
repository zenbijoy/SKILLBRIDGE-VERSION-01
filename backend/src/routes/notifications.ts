import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const notifications = Router();
notifications.get(
  "/",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ notifications: data ?? [] });
  }),
);
notifications.post(
  "/devices",
  wrap(async (req, res) => {
    const { token, platform } = z
      .object({ token: z.string().min(10), platform: z.string().max(30) })
      .parse(req.body);
    const fp = createHash("sha256").update(token).digest("hex");
    const { data, error } = await admin
      .from("device_tokens")
      .upsert(
        {
          user_id: req.userId!,
          token,
          token_fingerprint: fp,
          platform,
          enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token_fingerprint" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
notifications.patch(
  "/:id/read",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  }),
);
