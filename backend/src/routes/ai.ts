import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { wrap } from "../middleware/error.js";
export const ai = Router();
ai.post(
  "/assistant",
  wrap(async (req, res) => {
    if (!env.AI_PROVIDER_URL || !env.AI_PROVIDER_API_KEY)
      return res.status(503).json({ error: "AI provider is disabled" });
    const { prompt, context } = z
      .object({
        prompt: z.string().min(2).max(4000),
        context: z.string().max(6000).optional(),
      })
      .parse(req.body);
    const upstream = await fetch(env.AI_PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_PROVIDER_API_KEY}`,
      },
      body: JSON.stringify({ prompt, context }),
    });
    if (!upstream.ok)
      return res.status(502).json({ error: "AI provider failed" });
    res.json(await upstream.json());
  }),
);
