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
adminRoutes.get(
  "/stats",
  wrap(async (_req, res) => {
    const [
      { count: users },
      { count: rooms },
      { count: sessions },
      { count: reports },
    ] = await Promise.all([
      db.from("profiles").select("*", { count: "exact", head: true }),
      db.from("rooms").select("*", { count: "exact", head: true }),
      db.from("sessions").select("*", { count: "exact", head: true }),
      db.from("reports").select("*", { count: "exact", head: true }),
    ]);
    res.json({ users, rooms, sessions, reports });
  })
);

adminRoutes.get(
  "/users",
  wrap(async (req, res) => {
    const q = req.query.q as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    let query = db.from("profiles").select("*", { count: "exact" });
    if (q) query = query.ilike("full_name", `%${q}%`);

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;
    res.json({ users: data, total: count, page, limit });
  })
);

adminRoutes.get(
  "/rooms",
  wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    const { data, count, error } = await db
      .from("rooms")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;
    res.json({ rooms: data, total: count, page, limit });
  })
);

adminRoutes.get(
  "/audit-logs",
  wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    const { data, count, error } = await db
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;
    res.json({ logs: data, total: count, page, limit });
  })
);

adminRoutes.post(
  "/users/:id/role",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { role } = z.object({ role: z.string().min(1) }).parse(req.body);

    const { data: user } = await db.from("profiles").select("roles").eq("id", id).single();
    const currentRoles = user?.roles || [];
    if (!currentRoles.includes(role)) {
      currentRoles.push(role);
      await db.from("profiles").update({ roles: currentRoles }).eq("id", id);
      await audit(req.userId!, "admin.user.role.assign", "user", id, { role });
    }

    res.json({ success: true, roles: currentRoles });
  })
);

adminRoutes.post(
  "/users/:id/verify",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    await db.from("profiles").update({ is_verified: true }).eq("id", id);
    await audit(req.userId!, "admin.user.verify", "user", id, { verified: true });

    res.json({ success: true });
  })
);

adminRoutes.get(
  "/rbac/roles",
  wrap(async (_req, res) => {
    const { data, error } = await db.from("admin_roles").select("*").order("id");
    if (error) throw error;
    res.json({ roles: data });
  })
);

adminRoutes.post(
  "/rbac/assignments",
  wrap(async (req, res) => {
    const { user_id, role_id } = z.object({
      user_id: z.string().uuid(),
      role_id: z.string().min(1),
    }).parse(req.body);

    const { data, error } = await db
      .from("admin_assignments")
      .insert({ user_id, role_id, assigned_by: req.userId! })
      .select()
      .single();

    if (error) throw error;
    await audit(req.userId!, "admin.rbac.assign", "user", user_id, { role_id });

    res.status(201).json(data);
  })
);
