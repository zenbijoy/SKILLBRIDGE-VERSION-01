import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { audit } from "../services/audit.js";

export const adminTrustCasesRoutes = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["all", "open", "investigating", "actioned", "dismissed", "closed"]).default("all"),
  severity: z.enum(["all", "low", "medium", "high", "critical"]).default("all"),
});

// 1. List Trust & Safety Cases (Escalations around reports)
adminTrustCasesRoutes.get(
  "/",
  wrap(async (req, res) => {
    const { page, limit, status } = paginationSchema.parse(req.query);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    let query = db
      .from("reports")
      .select(`
        id, target_type, target_id, target_user_id, reason, details, status, action,
        reviewed_by, reviewed_at, created_at,
        reporter:profiles!reports_reporter_id_fkey(id, full_name, username, avatar_url)
      `, { count: "exact" });

    if (status && status !== "all") {
      const dbStatus = status === "investigating" ? "reviewing" : status === "actioned" ? "resolved" : status;
      query = query.eq("status", dbStatus);
    }

    const { data: reports, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;

    // Fetch related audit notes for these cases
    const reportIds = (reports ?? []).map((r) => r.id);
    const { data: caseAudits } = await db
      .from("audit_logs")
      .select("target_id, action, metadata, created_at, actor_id")
      .in("target_id", reportIds)
      .order("created_at", { ascending: true });

    const notesMap = new Map<string, any[]>();
    const severityMap = new Map<string, string>();
    for (const a of caseAudits ?? []) {
      if (a.target_id) {
        const notes = notesMap.get(a.target_id) ?? [];
        notes.push({
          id: a.created_at,
          actorId: a.actor_id,
          action: a.action,
          note: (a.metadata as any)?.note || (a.metadata as any)?.action || a.action,
          timestamp: a.created_at,
        });
        notesMap.set(a.target_id, notes);
        if ((a.metadata as any)?.severity) {
          severityMap.set(a.target_id, (a.metadata as any).severity);
        }
      }
    }

    const cases = (reports ?? []).map((r: any) => {
      // Map report status to case status
      let caseStatus = "open";
      if (r.status === "reviewing") caseStatus = "investigating";
      else if (r.status === "resolved") caseStatus = "actioned";
      else if (r.status === "dismissed") caseStatus = "dismissed";

      // Default severity heuristics
      const inferredSeverity = r.reason.toLowerCase().includes("harass") || r.reason.toLowerCase().includes("abuse")
        ? "high"
        : r.reason.toLowerCase().includes("hate") || r.reason.toLowerCase().includes("threat")
        ? "critical"
        : "medium";

      return {
        id: r.id,
        reportId: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        targetUserId: r.target_user_id,
        reason: r.reason,
        details: r.details,
        status: caseStatus,
        severity: severityMap.get(r.id) ?? inferredSeverity,
        assignedModerator: r.reviewed_by,
        actionTaken: r.action,
        reporter: r.reporter,
        internalNotes: notesMap.get(r.id) ?? [],
        createdAt: r.created_at,
        resolvedAt: r.reviewed_at,
      };
    });

    res.json({ cases, total: count ?? 0, page, limit });
  }),
);

// 2. Mutate Trust Case (Add note, change severity, update status)
adminTrustCasesRoutes.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({
      status: z.enum(["open", "investigating", "actioned", "dismissed", "closed"]).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      assignedTo: z.string().uuid().nullable().optional(),
      note: z.string().trim().max(1000).optional(),
      actionTaken: z.string().trim().max(300).optional(),
    }).parse(req.body);

    const updatePayload: Record<string, any> = {};
    if (body.status) {
      const dbStatus = body.status === "investigating" ? "reviewing" : body.status === "actioned" || body.status === "closed" ? "resolved" : body.status;
      updatePayload.status = dbStatus;
      if (body.status === "actioned" || body.status === "closed") {
        updatePayload.reviewed_at = new Date().toISOString();
        updatePayload.reviewed_by = req.userId;
      }
    }
    if (body.actionTaken) {
      updatePayload.action = body.actionTaken;
    }
    if (body.assignedTo !== undefined) {
      updatePayload.reviewed_by = body.assignedTo;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await db.from("reports").update(updatePayload).eq("id", id);
      if (error) throw error;
    }

    // Always log audit trail
    await audit(req.userId!, "admin.trust_case.update", "report", id, {
      ...body,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, caseId: id, ...body });
  }),
);
