import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { audit } from "../services/audit.js";
export const adminRoutes = Router();
adminRoutes.get(
  "/reports",
  wrap(async (_req, res) => {
    const { data, error } = await db
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ reports: data ?? [] });
  }),
);
adminRoutes.patch(
  "/reports/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const b = z
      .object({
        status: z.enum(["reviewing", "resolved", "dismissed"]),
        action: z.string().max(200),
      })
      .parse(req.body);
    const { data, error } = await db
      .from("reports")
      .update({
        ...b,
        reviewed_by: req.userId!,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await audit(req.userId!, "moderation.report.update", "report", id, b);
    res.json(data);
  }),
);
adminRoutes.patch(
  "/users/:id/status",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["active", "suspended", "banned"]) })
      .parse(req.body);
    const { data, error } = await db
      .from("profiles")
      .update({ account_status: status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await audit(req.userId!, "moderation.user.status", "user", id, { status });
    res.json(data);
  }),
);
