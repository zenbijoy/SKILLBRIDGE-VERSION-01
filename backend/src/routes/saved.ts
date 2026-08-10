import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const saved = Router();
saved.get(
  "/",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("saved_items")
      .select("*")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const items = await Promise.all(
      (data ?? []).map(async (x) => {
        let title = x.entity_type;
        let subtitle = "";
        if (x.entity_type === "room") {
          const { data: r } = await admin
            .from("rooms")
            .select("title,topic")
            .eq("id", x.entity_id)
            .maybeSingle();
          title = r?.title ?? "Room";
          subtitle = r?.topic ?? "";
        }
        if (x.entity_type === "event") {
          const { data: e } = await admin
            .from("events")
            .select("title")
            .eq("id", x.entity_id)
            .maybeSingle();
          title = e?.title ?? "Event";
        }
        return { ...x, title, subtitle };
      }),
    );
    res.json({ items });
  }),
);
saved.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        entity_type: z.enum(["room", "event", "resource", "profile"]),
        entity_id: z.string().uuid(),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("saved_items")
      .upsert(
        { user_id: req.userId!, ...b },
        { onConflict: "user_id,entity_type,entity_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
saved.delete(
  "/:id",
  wrap(async (req, res) => {
    await admin
      .from("saved_items")
      .delete()
      .eq("id", z.string().uuid().parse(req.params.id))
      .eq("user_id", req.userId!);
    res.status(204).end();
  }),
);
