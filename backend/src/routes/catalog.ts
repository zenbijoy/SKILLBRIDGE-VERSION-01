import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const catalog = Router();
catalog.get(
  "/skills",
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    let b = admin.from("skills").select("*").order("name").limit(100);
    if (q.length >= 2) b = b.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
    const { data, error } = await b;
    if (error) throw error;
    res.json({ skills: data ?? [] });
  }),
);
catalog.post(
  "/skills",
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(2).max(80),
        category: z.string().min(2).max(80).default("Community"),
      })
      .parse(req.body);
    const { data, error } = await admin
      .from("skills")
      .upsert(b, { onConflict: "name" })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
