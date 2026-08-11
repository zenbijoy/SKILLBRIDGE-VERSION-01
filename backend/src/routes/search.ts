import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { RedisService } from "../services/RedisService.js";

export const search = Router();

search.get(
  "/",
  wrap(async (req, res) => {
    const q = z.string().min(2).max(80).parse(req.query.q);
    const kind = String(req.query.kind ?? "all");
    const cursor = parseInt(String(req.query.cursor ?? "0"), 10) || 0;
    const limit = 20;

    const uid = req.userId!;
    
    // Fetch blocks for user
    const { data: blocks } = await admin
      .from("blocks")
      .select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);

    const blocked = new Set(
      (blocks ?? []).map((x) =>
        x.blocker_id === uid ? x.blocked_id : x.blocker_id,
      ),
    );

    const cacheKey = `search:${q}:${kind}:${cursor}`;

    const results = await RedisService.singleFlight(
      cacheKey,
      async () => {
        const [people, rooms, events, skills, clubs, research, resources] = await Promise.all([
          ["all", "people"].includes(kind)
            ? admin
                .from("profiles")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .neq("profile_visibility", "private")
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "rooms"].includes(kind)
            ? admin
                .from("rooms")
                .select("*")
                .eq("visibility", "public")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "events"].includes(kind)
            ? admin
                .from("events")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "skills"].includes(kind)
            ? admin
                .from("skills")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "clubs"].includes(kind)
            ? admin
                .from("clubs")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "research"].includes(kind)
            ? admin
                .from("research_projects")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
          ["all", "resources"].includes(kind)
            ? admin
                .from("resources")
                .select("*")
                .textSearch("fts", q, { type: "websearch" })
                .range(cursor, cursor + limit - 1)
            : Promise.resolve({ data: [] }),
        ]);

        return {
          people: people.data ?? [],
          rooms: rooms.data ?? [],
          events: events.data ?? [],
          skills: skills.data ?? [],
          clubs: clubs.data ?? [],
          research: research.data ?? [],
          resources: resources.data ?? [],
        };
      },
      30 // TTL 30 seconds
    );

    const filteredPeople = (results.people || []).filter((p: any) => !blocked.has(p.id));

    res.json({
      people: filteredPeople,
      rooms: results.rooms || [],
      events: results.events || [],
      skills: results.skills || [],
      clubs: results.clubs || [],
      research: results.research || [],
      resources: results.resources || [],
      nextCursor: [
        filteredPeople.length,
        (results.rooms || []).length,
        (results.events || []).length,
        (results.skills || []).length,
        (results.clubs || []).length,
        (results.research || []).length,
        (results.resources || []).length
      ].some(l => l === limit) ? cursor + limit : null
    });
  }),
);
