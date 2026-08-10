import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const search = Router();
search.get(
  "/",
  wrap(async (req, res) => {
    const q = z.string().min(2).max(80).parse(req.query.q);
    const kind = String(req.query.kind ?? "all");
    const uid = req.userId!;
    const safe = q
      .replace(/[,%_()"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const pattern = `%${safe}%`;
    const { data: blocks } = await admin
      .from("blocks")
      .select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
    const blocked = new Set(
      (blocks ?? []).map((x) =>
        x.blocker_id === uid ? x.blocked_id : x.blocker_id,
      ),
    );
    const [people, rooms, events, skills] = await Promise.all([
      ["all", "people"].includes(kind)
        ? admin
            .from("profiles")
            .select("*")
            .or(
              `full_name.ilike.${pattern},username.ilike.${pattern},bio.ilike.${pattern}`,
            )
            .neq("profile_visibility", "private")
            .limit(20)
        : Promise.resolve({ data: [] }),
      ["all", "rooms"].includes(kind)
        ? admin
            .from("rooms")
            .select("*")
            .eq("visibility", "public")
            .or(
              `title.ilike.${pattern},topic.ilike.${pattern},description.ilike.${pattern}`,
            )
            .limit(20)
        : Promise.resolve({ data: [] }),
      ["all", "events"].includes(kind)
        ? admin
            .from("events")
            .select("*")
            .or(`title.ilike.${pattern},description.ilike.${pattern}`)
            .limit(20)
        : Promise.resolve({ data: [] }),
      ["all", "skills"].includes(kind)
        ? admin.from("skills").select("*").ilike("name", pattern).limit(20)
        : Promise.resolve({ data: [] }),
    ]);
    res.json({
      people: (people.data ?? []).filter((p: any) => !blocked.has(p.id)),
      rooms: rooms.data ?? [],
      events: events.data ?? [],
      skills: skills.data ?? [],
    });
  }),
);
