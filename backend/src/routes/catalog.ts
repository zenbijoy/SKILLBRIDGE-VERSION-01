import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
export const catalog = Router();
catalog.get(
  "/skills",
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const cacheKey = `catalog:skills:${q.toLowerCase()}`;
    const cached = await cacheGet<{ skills: unknown[] }>(cacheKey);
    if (cached) return res.json(cached);

    let b = admin.from("skills").select("*").order("name").limit(100);
    if (q.length >= 2) b = b.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
    const { data, error } = await b;
    if (error) throw error;
    const result = { skills: data ?? [] };
    await cacheSet(cacheKey, result, 300);
    res.json(result);
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
