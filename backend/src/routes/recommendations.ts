import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const recommendations = Router();
recommendations.get(
  "/people",
  wrap(async (req, res) => {
    const { data, error } = await admin.rpc("recommend_people", {
      p_user_id: req.userId!,
      p_limit: 20,
    });
    if (error) throw error;
    res.json({ people: data ?? [] });
  }),
);
recommendations.get(
  "/research",
  wrap(async (req, res) => {
    const interest = z
      .string()
      .min(2)
      .max(100)
      .parse(req.query.interest ?? "research");
    const { data: skillRows } = await admin
      .from("skills")
      .select("id,name")
      .ilike("name", `%${interest}%`)
      .limit(10);
    const ids = (skillRows ?? []).map((x) => x.id);
    let people: any[] = [];
    if (ids.length) {
      const { data } = await admin
        .from("user_skills")
        .select("profiles!user_skills_user_id_fkey(*)")
        .in("skill_id", ids)
        .neq("user_id", req.userId!)
        .limit(40);
      people = Array.from(
        new Map(
          (data ?? []).map((x: any) => [x.profiles.id, x.profiles]),
        ).values(),
      );
    }
    res.json({ people, topics: (skillRows ?? []).map((x) => x.name) });
  }),
);
