import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const saved = Router();

const collectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#2563EB"),
  icon: z.string().max(50).default("bookmark"),
});

const saveItemSchema = z.object({
  entity_type: z.enum([
    "person",
    "room",
    "event",
    "skill",
    "club",
    "research",
    "resource",
    "session",
    "goal",
    "profile",
  ]),
  entity_id: z.string().uuid(),
  collection_id: z.string().uuid().optional().nullable(),
  note: z.string().max(1000).optional(),
  tags: z.array(z.string()).default([]),
});

// GET /api/v1/saved/collections - List user collections with counts
saved.get(
  "/collections",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data: collections, error } = await admin
      .from("saved_collections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Get item counts per collection
    const { data: items } = await admin
      .from("saved_items")
      .select("collection_id")
      .eq("user_id", userId);

    const counts: Record<string, number> = {};
    let unorganizedCount = 0;
    (items || []).forEach((it) => {
      if (it.collection_id) {
        counts[it.collection_id] = (counts[it.collection_id] || 0) + 1;
      } else {
        unorganizedCount++;
      }
    });

    const enriched = (collections || []).map((c) => ({
      ...c,
      item_count: counts[c.id] || 0,
    }));

    res.json({
      collections: enriched,
      unorganized_count: unorganizedCount,
      total_count: (items || []).length,
    });
  }),
);

// POST /api/v1/saved/collections - Create collection
saved.post(
  "/collections",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = collectionSchema.parse(req.body);

    const { data, error } = await admin
      .from("saved_collections")
      .insert({
        user_id: userId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ collection: data });
  }),
);

// PUT /api/v1/saved/collections/:id - Update collection
saved.put(
  "/collections/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const body = collectionSchema.partial().parse(req.body);

    const { data, error } = await admin
      .from("saved_collections")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ collection: data });
  }),
);

// DELETE /api/v1/saved/collections/:id - Delete collection
saved.delete(
  "/collections/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("saved_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true });
  }),
);

// GET /api/v1/saved - List saved items with rich hydrated details & tombstones
saved.get(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { collection_id, entity_type } = req.query;

    let query = admin
      .from("saved_items")
      .select("*, collection:saved_collections(id, name, color, icon)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (collection_id && typeof collection_id === "string") {
      if (collection_id === "none") {
        query = query.is("collection_id", null);
      } else {
        query = query.eq("collection_id", collection_id);
      }
    }

    if (entity_type && typeof entity_type === "string") {
      query = query.eq("entity_type", entity_type);
    }

    const { data, error } = await query;
    if (error) throw error;

    const items = await Promise.all(
      (data ?? []).map(async (x) => {
        let title = x.entity_type;
        let subtitle = "";
        let isTombstone = false;
        let details: any = null;

        try {
          if (x.entity_type === "room") {
            const { data: r } = await admin
              .from("rooms")
              .select("id, title, topic, visibility, mode")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (r) {
              title = r.title;
              subtitle = r.topic || "Room";
              details = r;
            } else {
              isTombstone = true;
              title = "Archived Room";
            }
          } else if (x.entity_type === "event") {
            const { data: e } = await admin
              .from("events")
              .select("id, title, location, starts_at, status")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (e) {
              title = e.title;
              subtitle = e.location || "Event";
              details = e;
            } else {
              isTombstone = true;
              title = "Archived Event";
            }
          } else if (x.entity_type === "resource") {
            const { data: r } = await admin
              .from("resources")
              .select("id, title, type, url")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (r) {
              title = r.title;
              subtitle = r.type;
              details = r;
            } else {
              isTombstone = true;
              title = "Archived Resource";
            }
          } else if (x.entity_type === "profile" || x.entity_type === "person") {
            const { data: p } = await admin
              .from("profiles")
              .select("id, full_name, username, headline, avatar_url, roles")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (p) {
              title = p.full_name || p.username || "User";
              subtitle = p.headline || (p.roles || []).join(", ");
              details = p;
            } else {
              isTombstone = true;
              title = "Archived Profile";
            }
          } else if (x.entity_type === "skill") {
            const { data: s } = await admin
              .from("skills")
              .select("id, name, category, description")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (s) {
              title = s.name;
              subtitle = s.category;
              details = s;
            } else {
              isTombstone = true;
              title = "Archived Skill";
            }
          } else if (x.entity_type === "club") {
            const { data: c } = await admin
              .from("clubs")
              .select("id, name, description, category")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (c) {
              title = c.name;
              subtitle = c.category || "Club";
              details = c;
            } else {
              isTombstone = true;
              title = "Archived Club";
            }
          } else if (x.entity_type === "research") {
            const { data: rp } = await admin
              .from("research_projects")
              .select("id, title, field_of_study, status")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (rp) {
              title = rp.title;
              subtitle = rp.field_of_study || "Research Project";
              details = rp;
            } else {
              isTombstone = true;
              title = "Archived Project";
            }
          } else if (x.entity_type === "goal") {
            const { data: g } = await admin
              .from("learning_goals")
              .select("id, title, progress_percent, status")
              .eq("id", x.entity_id)
              .maybeSingle();
            if (g) {
              title = g.title;
              subtitle = `Progress: ${g.progress_percent}% (${g.status})`;
              details = g;
            } else {
              isTombstone = true;
              title = "Archived Goal";
            }
          }
        } catch {
          isTombstone = true;
        }

        return {
          ...x,
          title,
          subtitle,
          is_tombstone: isTombstone,
          details,
        };
      }),
    );

    res.json({ items });
  }),
);

// POST /api/v1/saved - Save an item
saved.post(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = saveItemSchema.parse(req.body);

    const { data, error } = await admin
      .from("saved_items")
      .upsert(
        {
          user_id: userId,
          entity_type: body.entity_type,
          entity_id: body.entity_id,
          collection_id: body.collection_id ?? null,
          note: body.note ?? null,
          tags: body.tags ?? [],
        },
        { onConflict: "user_id,entity_type,entity_id" },
      )
      .select("*, collection:saved_collections(*)")
      .single();

    if (error) throw error;

    res.status(201).json({ item: data });
  }),
);

// PUT /api/v1/saved/:id/collection - Move item to collection
saved.put(
  "/:id/collection",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { collection_id, note, tags } = req.body || {};

    const { data, error } = await admin
      .from("saved_items")
      .update({
        collection_id: collection_id ?? null,
        note: note !== undefined ? note : undefined,
        tags: tags !== undefined ? tags : undefined,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*, collection:saved_collections(*)")
      .single();

    if (error) throw error;

    res.json({ item: data });
  }),
);

// DELETE /api/v1/saved/:id - Remove saved item
saved.delete(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("saved_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.json({ success: true });
  }),
);
