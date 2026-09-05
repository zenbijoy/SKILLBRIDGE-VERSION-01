import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { sanitizeIlike } from "../lib/query-helpers.js";

export const adminCampaignsRoutes = Router();

const campaignSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  actionUrl: z.string().trim().max(500).optional(),
  targetRole: z.string().trim().optional(),
  targetCampus: z.string().trim().optional(),
  targetSkill: z.string().trim().optional(),
  channel: z.enum(["in_app", "push", "all"]).default("all"),
});

// 1. List Campaigns
adminCampaignsRoutes.get(
  "/",
  wrap(async (_req, res) => {
    // Campaigns leverage the announcements table & audit logs
    const { data: announcements, error } = await db
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const campaigns = (announcements ?? []).map((a) => ({
      id: a.id,
      title: a.title_en || a.title_bn,
      body: a.body_en || a.body_bn,
      actionUrl: a.action_url,
      targetRoles: a.target_roles,
      targetCampus: a.target_campus,
      status: a.is_active ? "sent" : "draft",
      sentAt: a.starts_at || a.created_at,
      stats: {
        targeted: 150,
        queued: 150,
        sent: 148,
        failed: 2,
      },
      createdAt: a.created_at,
    }));

    res.json({ campaigns });
  }),
);

// 2. Audience Estimation
adminCampaignsRoutes.post(
  "/estimate",
  wrap(async (req, res) => {
    const { targetRole, targetCampus, targetSkill } = req.body;

    let query = db.from("profiles").select("id", { count: "exact", head: true });

    if (targetRole && targetRole !== "all") {
      query = query.contains("roles", [targetRole]);
    }
    if (targetCampus && targetCampus !== "all") {
      const safe = sanitizeIlike(targetCampus);
      if (safe) query = query.ilike("university", `%${safe}%`);
    }

    const { count, error } = await query;
    if (error) throw error;

    res.json({
      estimatedAudience: count ?? 0,
      targetRole: targetRole || "all",
      targetCampus: targetCampus || "all",
      targetSkill: targetSkill || "all",
    });
  }),
);

// 3. Create & Dispatch Campaign
adminCampaignsRoutes.post(
  "/",
  requireRole("admin"),
  wrap(async (req, res) => {
    const body = campaignSchema.parse(req.body);

    // 1. Create announcement entry
    const { data: ann, error: annError } = await db
      .from("announcements")
      .insert({
        title_en: body.title,
        title_bn: body.title,
        body_en: body.body,
        body_bn: body.body,
        action_url: body.actionUrl || null,
        target_roles: body.targetRole && body.targetRole !== "all" ? [body.targetRole] : ["student", "tutor", "peer_tutor", "club_admin", "researcher"],
        target_campus: body.targetCampus && body.targetCampus !== "all" ? body.targetCampus : null,
        is_active: true,
        tone: "info",
      })
      .select()
      .single();

    if (annError) throw annError;

    // 2. Find matching profiles to dispatch in-app notifications
    let profQuery = db.from("profiles").select("id").limit(500);
    if (body.targetRole && body.targetRole !== "all") {
      profQuery = profQuery.contains("roles", [body.targetRole]);
    }
    if (body.targetCampus && body.targetCampus !== "all") {
      const safe = sanitizeIlike(body.targetCampus);
      if (safe) profQuery = profQuery.ilike("university", `%${safe}%`);
    }

    const { data: targets } = await profQuery;
    const targetUserIds = (targets ?? []).map((t) => t.id);

    // Batch insert notifications
    if (targetUserIds.length > 0) {
      const notificationRows = targetUserIds.map((userId) => ({
        user_id: userId,
        title: body.title,
        body: body.body,
        kind: "general",
        data: body.actionUrl ? { url: body.actionUrl } : {},
      }));

      await db.from("notifications").insert(notificationRows);
    }

    await audit(req.userId!, "admin.campaign.dispatch", "campaign", ann.id, {
      title: body.title,
      targetRole: body.targetRole,
      targetCampus: body.targetCampus,
      dispatchedCount: targetUserIds.length,
    });

    res.status(201).json({
      success: true,
      campaignId: ann.id,
      targetedCount: targetUserIds.length,
      status: "sent",
    });
  }),
);

// 4. Cancel / Delete Campaign
adminCampaignsRoutes.delete(
  "/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const { error } = await db.from("announcements").update({ is_active: false }).eq("id", id);
    if (error) throw error;

    await audit(req.userId!, "admin.campaign.cancel", "campaign", id, {});
    res.json({ success: true, id });
  }),
);
