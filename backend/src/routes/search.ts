import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { eitherColumnFilter } from "../lib/query-helpers.js";

export const search = Router();

search.get(
  "/",
  wrap(async (req, res) => {
    const q = z.string().min(2).max(80).parse(req.query.q);
    const kind = String(req.query.kind ?? "all");
    const cursor = parseInt(String(req.query.cursor ?? "0"), 10) || 0;
    const limit = 20;

    const uid = req.userId!;
    
    // Fetch blocks & user room memberships
    const [blocksRes, userRoomsRes] = await Promise.all([
      admin
        .from("blocks")
        .select("blocker_id,blocked_id")
        .or(eitherColumnFilter("blocker_id", "blocked_id", uid)),
      admin
        .from("room_members")
        .select("room_id")
        .eq("user_id", uid),
    ]);

    const blocked = new Set(
      (blocksRes.data ?? []).map((x) =>
        x.blocker_id === uid ? x.blocked_id : x.blocker_id,
      ),
    );
    const myRoomIds = new Set((userRoomsRes.data ?? []).map((r) => r.room_id));

    const [people, rooms, events, skills, clubs, research, resources] = await Promise.all([
      ["all", "people"].includes(kind)
        ? admin
            .from("profiles")
            .select("id, full_name, username, avatar_url, bio, university, department, reputation, profile_visibility")
            .textSearch("fts", q, { type: "websearch" })
            .eq("profile_visibility", "public")
            .eq("account_status", "active")
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "rooms"].includes(kind)
        ? admin
            .from("rooms")
            .select("id, title, topic, description, mode, member_count, capacity, status, visibility, scheduled_at")
            .eq("visibility", "public")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "events"].includes(kind)
        ? admin
            .from("events")
            .select("id, title, description, starts_at, ends_at, location, capacity, club_id, status")
            .eq("status", "published")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "skills"].includes(kind)
        ? admin
            .from("skills")
            .select("id, name, category, description")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "clubs"].includes(kind)
        ? admin
            .from("clubs")
            .select("id, name, description, category, university, member_count")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "research"].includes(kind)
        ? admin
            .from("research_projects")
            .select("id, title, description, field, status, owner_id, looking_for_collaborators, visibility")
            .eq("visibility", "public")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
      ["all", "resources"].includes(kind)
        ? admin
            .from("resources")
            .select("id, title, description, room_id, mime_type, file_size, created_at")
            .textSearch("fts", q, { type: "websearch" })
            .range(cursor, cursor + limit - 1)
        : Promise.resolve({ data: [] }),
    ]);

    const filteredPeople = (people.data ?? []).filter((p: any) => !blocked.has(p.id));
    const filteredResources = (resources.data ?? []).filter((r: any) => !r.room_id || myRoomIds.has(r.room_id));

    res.json({
      people: filteredPeople,
      rooms: rooms.data ?? [],
      events: events.data ?? [],
      skills: skills.data ?? [],
      clubs: clubs.data ?? [],
      research: research.data ?? [],
      resources: filteredResources,
      nextCursor: [
        filteredPeople.length,
        (rooms.data ?? []).length,
        (events.data ?? []).length,
        (skills.data ?? []).length,
        (clubs.data ?? []).length,
        (research.data ?? []).length,
        filteredResources.length
      ].some(l => l === limit) ? cursor + limit : null
    });
  }),
);
