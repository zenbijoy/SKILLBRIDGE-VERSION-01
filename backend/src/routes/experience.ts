import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const experience = Router();

experience.get(
  "/content",
  wrap(async (req, res) => {
    const locale = z.enum(["en", "bn"]).default("en").parse(req.query.locale);
    const type = z.enum(["welcome", "onboarding", "tour"]).optional().parse(req.query.type);
    let query = admin
      .from("experience_content_sets")
      .select("content_type,locale,version,content,updated_at")
      .eq("is_active", true)
      .eq("locale", locale);
    if (type) query = query.eq("content_type", type);
    const { data, error } = await query.order("content_type");
    if (error) throw error;
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ contentSets: data ?? [] });
  }),
);
