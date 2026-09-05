import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { audit } from "../services/audit.js";
import { sanitizeIlike } from "../lib/query-helpers.js";

export const adminCommunityRoutes = Router();

const paginationSchema = z.object({
  tab: z.enum(["clubs", "events", "resources", "quizzes"]).default("clubs"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

adminCommunityRoutes.get(
  "/",
  wrap(async (req, res) => {
    const { tab, page, limit, q } = paginationSchema.parse(req.query);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    if (tab === "clubs") {
      let query = db
        .from("clubs")
        .select(`
          id, name, description, category, created_at,
          lead:profiles!clubs_lead_id_fkey(id, full_name, username, avatar_url)
        `, { count: "exact" });

      if (q) {
        const safe = sanitizeIlike(q);
        if (safe) query = query.ilike("name", `%${safe}%`);
      }

      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;

      // Add member counts
      const clubIds = (data ?? []).map((c) => c.id);
      const { data: members } = await db.from("club_members").select("club_id").in("club_id", clubIds);
      const memberCounts = new Map<string, number>();
      for (const m of members ?? []) {
        memberCounts.set(m.club_id, (memberCounts.get(m.club_id) ?? 0) + 1);
      }

      const items = (data ?? []).map((c: any) => ({
        ...c,
        membersCount: memberCounts.get(c.id) ?? 0,
      }));

      return res.json({ tab, items, total: count ?? 0, page, limit });
    }

    if (tab === "events") {
      let query = db
        .from("events")
        .select(`
          id, title, description, event_type, starts_at, ends_at, created_at,
          host:profiles!events_host_id_fkey(id, full_name, username, avatar_url)
        `, { count: "exact" });

      if (q) {
        const safe = sanitizeIlike(q);
        if (safe) query = query.ilike("title", `%${safe}%`);
      }

      const { data, count, error } = await query.order("starts_at", { ascending: false }).range(from, to);
      if (error) throw error;

      const eventIds = (data ?? []).map((e) => e.id);
      const { data: apps } = await db.from("event_applications").select("event_id").in("event_id", eventIds);
      const appCounts = new Map<string, number>();
      for (const a of apps ?? []) {
        appCounts.set(a.event_id, (appCounts.get(a.event_id) ?? 0) + 1);
      }

      const items = (data ?? []).map((e: any) => ({
        ...e,
        applicationsCount: appCounts.get(e.id) ?? 0,
      }));

      return res.json({ tab, items, total: count ?? 0, page, limit });
    }

    if (tab === "resources") {
      let query = db
        .from("resources")
        .select(`
          id, title, description, file_url, created_at,
          uploader:profiles!resources_uploader_id_fkey(id, full_name, username, avatar_url)
        `, { count: "exact" });

      if (q) {
        const safe = sanitizeIlike(q);
        if (safe) query = query.ilike("title", `%${safe}%`);
      }

      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;

      return res.json({ tab, items: data ?? [], total: count ?? 0, page, limit });
    }

    if (tab === "quizzes") {
      let query = db
        .from("quizzes")
        .select(`
          id, title, skill_id, created_at,
          skill:skills(id, name, category)
        `, { count: "exact" });

      if (q) {
        const safe = sanitizeIlike(q);
        if (safe) query = query.ilike("title", `%${safe}%`);
      }

      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;

      const quizIds = (data ?? []).map((qItem) => qItem.id);
      const [questionsRes, attemptsRes] = await Promise.all([
        db.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds),
        db.from("quiz_attempts").select("quiz_id").in("quiz_id", quizIds),
      ]);

      const questionCounts = new Map<string, number>();
      for (const qRow of questionsRes.data ?? []) {
        questionCounts.set(qRow.quiz_id, (questionCounts.get(qRow.quiz_id) ?? 0) + 1);
      }

      const attemptCounts = new Map<string, number>();
      for (const aRow of attemptsRes.data ?? []) {
        attemptCounts.set(aRow.quiz_id, (attemptCounts.get(aRow.quiz_id) ?? 0) + 1);
      }

      const items = (data ?? []).map((qItem: any) => ({
        ...qItem,
        questionCount: questionCounts.get(qItem.id) ?? 0,
        attemptCount: attemptCounts.get(qItem.id) ?? 0,
      }));

      return res.json({ tab, items, total: count ?? 0, page, limit });
    }

    res.status(400).json({ error: "Invalid tab" });
  }),
);

// Mutate Community Items
adminCommunityRoutes.patch(
  "/:entityType/:id",
  wrap(async (req, res) => {
    const entityType = z.enum(["clubs", "events", "resources", "quizzes"]).parse(req.params.entityType);
    const id = z.string().uuid().parse(req.params.id);
    const { action, reason } = z.object({
      action: z.enum(["approve", "hide", "feature", "archive", "remove"]),
      reason: z.string().trim().min(3).max(300),
    }).parse(req.body);

    await audit(req.userId!, `admin.community.${entityType}.${action}`, entityType, id, {
      action,
      reason,
    });

    res.json({ success: true, entityType, id, action });
  }),
);
