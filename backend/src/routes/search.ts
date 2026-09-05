import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { eitherColumnFilter } from "../lib/query-helpers.js";

export const search = Router();

export type SearchResult = {
  kind: "person" | "room" | "event" | "skill" | "club" | "research" | "resource";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  score: number;
  metadata: Record<string, string | number | boolean | null>;
};

const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  kind: z.enum(["all", "person", "room", "event", "skill", "club", "research", "resource"]).default("all"),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  campus: z.string().optional(),
  department: z.string().optional(),
});

function calculateScore(text: string, query: string, baseWeight: number): number {
  const normText = text.toLowerCase();
  const normQuery = query.toLowerCase();
  if (normText === normQuery) return baseWeight * 1.5;
  if (normText.startsWith(normQuery)) return baseWeight * 1.3;
  if (normText.includes(normQuery)) return baseWeight * 1.0;
  return baseWeight * 0.7;
}

search.get(
  "/",
  wrap(async (req, res) => {
    const { q, kind, cursor, limit, campus, department } = searchQuerySchema.parse(req.query);
    const uid = req.userId!;

    // 1. Fetch blocks & user room memberships
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

    const allResults: SearchResult[] = [];

    // Helper queries
    const tasks: Promise<void>[] = [];

    // PEOPLE
    if (kind === "all" || kind === "person") {
      tasks.push(
        (async () => {
          let query = admin
            .from("profiles")
            .select("id, full_name, username, avatar_url, bio, university, department, reputation")
            .eq("profile_visibility", "public")
            .eq("account_status", "active")
            .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,bio.ilike.%${q}%`)
            .limit(30);

          if (campus) query = query.ilike("university", `%${campus}%`);
          if (department) query = query.ilike("department", `%${department}%`);

          const { data } = await query;
          (data ?? []).forEach((p: any) => {
            if (blocked.has(p.id) || p.id === uid) return;
            allResults.push({
              kind: "person",
              id: p.id,
              title: p.full_name || p.username,
              subtitle: `${p.university || "Student"} • ${p.department || "Peer"} • Rep: ${p.reputation || 0}`,
              imageUrl: p.avatar_url || undefined,
              score: calculateScore(p.full_name || p.username, q, 30),
              metadata: {
                username: p.username,
                university: p.university ?? null,
                department: p.department ?? null,
                reputation: p.reputation ?? 0,
              },
            });
          });
        })(),
      );
    }

    // ROOMS
    if (kind === "all" || kind === "room") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("rooms")
            .select("id, title, topic, description, mode, member_count, capacity, status, campus_location")
            .eq("visibility", "public")
            .in("status", ["open", "scheduled", "live"])
            .or(`title.ilike.%${q}%,topic.ilike.%${q}%,description.ilike.%${q}%`)
            .limit(30);

          (data ?? []).forEach((r: any) => {
            allResults.push({
              kind: "room",
              id: r.id,
              title: r.title,
              subtitle: `${r.topic} • ${r.mode.toUpperCase()} • ${r.member_count}/${r.capacity} members`,
              score: calculateScore(r.title, q, 25),
              metadata: {
                topic: r.topic,
                mode: r.mode,
                status: r.status,
                member_count: r.member_count,
                capacity: r.capacity,
                campus_location: r.campus_location ?? null,
              },
            });
          });
        })(),
      );
    }

    // EVENTS
    if (kind === "all" || kind === "event") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("events")
            .select("id, title, description, starts_at, location, capacity, club_id, status")
            .eq("status", "published")
            .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
            .limit(30);

          (data ?? []).forEach((e: any) => {
            allResults.push({
              kind: "event",
              id: e.id,
              title: e.title,
              subtitle: `${new Date(e.starts_at).toLocaleDateString()} • ${e.location || "Campus"}`,
              score: calculateScore(e.title, q, 20),
              metadata: {
                starts_at: e.starts_at,
                location: e.location ?? null,
                capacity: e.capacity ?? null,
                club_id: e.club_id ?? null,
              },
            });
          });
        })(),
      );
    }

    // SKILLS
    if (kind === "all" || kind === "skill") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("skills")
            .select("id, name, category, description")
            .or(`name.ilike.%${q}%,category.ilike.%${q}%`)
            .limit(20);

          (data ?? []).forEach((s: any) => {
            allResults.push({
              kind: "skill",
              id: s.id,
              title: s.name,
              subtitle: `Category: ${s.category}`,
              score: calculateScore(s.name, q, 20),
              metadata: {
                category: s.category,
                description: s.description ?? null,
              },
            });
          });
        })(),
      );
    }

    // CLUBS
    if (kind === "all" || kind === "club") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("clubs")
            .select("id, name, description, category, university, member_count")
            .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
            .limit(20);

          (data ?? []).forEach((c: any) => {
            allResults.push({
              kind: "club",
              id: c.id,
              title: c.name,
              subtitle: `${c.category || "Club"} • ${c.university || "Campus"} • ${c.member_count || 0} members`,
              score: calculateScore(c.name, q, 20),
              metadata: {
                category: c.category ?? null,
                university: c.university ?? null,
                member_count: c.member_count ?? 0,
              },
            });
          });
        })(),
      );
    }

    // RESEARCH PROJECTS
    if (kind === "all" || kind === "research") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("research_projects")
            .select("id, title, description, field, status, owner_id, looking_for_collaborators")
            .eq("visibility", "public")
            .in("status", ["active", "completed"])
            .or(`title.ilike.%${q}%,field.ilike.%${q}%,description.ilike.%${q}%`)
            .limit(20);

          (data ?? []).forEach((r: any) => {
            if (blocked.has(r.owner_id)) return;
            allResults.push({
              kind: "research",
              id: r.id,
              title: r.title,
              subtitle: `${r.field || "Research"} • ${r.status.toUpperCase()} ${r.looking_for_collaborators ? "• 🤝 Recruiting" : ""}`,
              score: calculateScore(r.title, q, 20),
              metadata: {
                field: r.field ?? null,
                status: r.status,
                looking_for_collaborators: r.looking_for_collaborators ?? false,
              },
            });
          });
        })(),
      );
    }

    // RESOURCES
    if (kind === "all" || kind === "resource") {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("resources")
            .select("id, title, room_id, kind, created_at")
            .or(`title.ilike.%${q}%`)
            .limit(30);

          (data ?? []).forEach((resItem: any) => {
            if (resItem.room_id && !myRoomIds.has(resItem.room_id)) return;
            allResults.push({
              kind: "resource",
              id: resItem.id,
              title: resItem.title,
              subtitle: `Resource • ${resItem.kind || "file"}`,
              score: calculateScore(resItem.title, q, 15),
              metadata: {
                kind: resItem.kind ?? "file",
                room_id: resItem.room_id ?? null,
              },
            });
          });
        })(),
      );
    }

    await Promise.all(tasks);

    // Deterministic sorting by score descending, then title ascending, then ID
    allResults.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

    const paginated = allResults.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < allResults.length ? cursor + limit : null;

    // Privacy-preserving Search Analytics ingestion (asynchronous fire-and-forget)
    void Promise.resolve(
      admin.from("search_analytics_events").insert({
        search_query_normalized: q.toLowerCase().trim().slice(0, 100),
        result_count: allResults.length,
        category: kind !== "all" ? kind : null,
      }),
    ).catch(() => {});

    res.json({
      results: paginated,
      total: allResults.length,
      nextCursor,
      query: q,
      kind,
    });
  }),
);
