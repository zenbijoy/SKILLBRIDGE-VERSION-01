import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { auth, requireRole } from "../middleware/auth.js";
import { env } from "../config/env.js";
import crypto from "node:crypto";

export const adminAccessRoutes = Router();

// Middleware to audit actions locally
async function auditLocal(req: any, action: string, targetType: string, targetId: string | null, metadata: any) {
  await admin.from("admin_audit_logs").insert({
    actor_id: req.userId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
    result: "success",
    ip_address: req.ip,
    user_agent: req.headers["user-agent"],
  });
}

// Ensure the actor has a certain AAL if MFA is required
function requireMfaIfEnabled(req: any, res: any, next: any) {
  if (req.mfaRequired && req.aal !== "aal2") {
    return res.status(403).json({ error: "MFA required for this action" });
  }
  next();
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

// 1. Bootstrap Status (Public but Rate-Limited usually)
adminAccessRoutes.get(
  "/bootstrap/status",
  wrap(async (req, res) => {
    if (!env.ADMIN_BOOTSTRAP_ENABLED) {
      return res.json({ status: "disabled" });
    }
    const { data: state, error } = await admin
      .from("admin_bootstrap_state")
      .select("status")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
      
    if (error) throw error;
    res.json({ status: state?.status || "disabled" });
  })
);

// 2. Admin ME
adminAccessRoutes.get(
  "/me",
  wrap(async (req, res) => {
    res.json({
      role: req.adminRole || null,
      status: req.adminStatus || null,
      mustChangeCredentials: req.mustChangeCredentials || false,
      mfaRequired: req.mfaRequired || false,
      aal: req.aal || "aal1"
    });
  })
);

// 3. Complete Bootstrap
adminAccessRoutes.post(
  "/bootstrap/complete",
  requireMfaIfEnabled,
  wrap(async (req, res) => {
    if (!req.mustChangeCredentials) {
      return res.status(400).json({ error: "Credentials already changed" });
    }

    const { data: state } = await admin
      .from("admin_bootstrap_state")
      .select("status")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (state?.status === "provisioned" && req.adminRole === "owner") {
      await admin.from("admin_bootstrap_state").update({
        status: "consumed",
        consumed_at: new Date().toISOString()
      }).eq("id", "00000000-0000-0000-0000-000000000001");
    }

    await admin.from("admin_accounts").update({
      must_change_credentials: false,
      activated_at: new Date().toISOString()
    }).eq("user_id", req.userId);

    await auditLocal(req, "admin.bootstrap.complete", "admin_account", req.userId ?? null, {});
    res.json({ success: true });
  })
);

// 4. Admin Members
adminAccessRoutes.get(
  "/members",
  requireRole("owner", "admin"),
  wrap(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    const [
      { data: accounts, count: accountCount, error: err1 },
      { data: invites, count: inviteCount, error: err2 }
    ] = await Promise.all([
      admin.from("admin_accounts").select(`
        user_id, role, status, must_change_credentials, mfa_required, last_login_at, created_at,
        profiles ( full_name, email )
      `, { count: "exact" }).range(from, to).order("created_at", { ascending: false }),
      admin.from("admin_invitations").select("*", { count: "exact" }).range(from, to).order("created_at", { ascending: false })
    ]);

    if (err1) throw err1;
    if (err2) throw err2;

    res.json({
      members: accounts,
      invitations: invites,
      totalMembers: accountCount,
      totalInvitations: inviteCount,
      page,
      limit
    });
  })
);

// 5. Invite Member
adminAccessRoutes.post(
  "/members/invite",
  requireRole("owner", "admin"),
  requireMfaIfEnabled,
  wrap(async (req, res) => {
    const { email, role } = z.object({
      email: z.string().email(),
      role: z.enum(["admin", "co_admin", "auditor"])
    }).parse(req.body);

    if (req.adminRole === "admin" && role === "admin") {
      return res.status(403).json({ error: "Cannot invite equal or higher role" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    
    // Check if account already exists
    const { data: existingUser } = await admin.auth.admin.listUsers();
    const isExisting = existingUser?.users?.find(u => u.email === email);
    
    if (isExisting) {
       // Check if they are already an admin
       const { data: existingAdmin } = await admin.from("admin_accounts").select("user_id").eq("user_id", isExisting.id).maybeSingle();
       if (existingAdmin) {
          return res.status(400).json({ error: "User is already an administrator" });
       }
    }

    const { data, error } = await admin.from("admin_invitations").insert({
      email,
      role,
      token_hash: tokenHash,
      invited_by: req.userId,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).select().single();

    if (error) throw error;

    // TODO: Send Email logic goes here

    await auditLocal(req, "admin.member.invite", "admin_invitation", data.id, { role });
    res.status(201).json({ success: true, id: data.id });
  })
);

// 6. Temporary Password Fallback
adminAccessRoutes.post(
  "/members/temporary",
  requireRole("owner"),
  requireMfaIfEnabled,
  wrap(async (req, res) => {
    const { email, role } = z.object({
      email: z.string().email(),
      role: z.enum(["admin", "co_admin"])
    }).parse(req.body);

    const tempPassword = crypto.randomBytes(12).toString("hex");

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    });

    if (createUserError || !createdUser.user) {
      return res.status(400).json({ error: "Could not create user" });
    }

    const { error: accountError } = await admin.from("admin_accounts").insert({
      user_id: createdUser.user.id,
      role,
      status: "active",
      must_change_credentials: true,
      invited_by: req.userId
    });

    if (accountError) {
      await admin.auth.admin.deleteUser(createdUser.user.id);
      throw accountError;
    }

    await auditLocal(req, "admin.member.temporary", "admin_account", createdUser.user.id, { role });
    res.status(201).json({ tempPassword, userId: createdUser.user.id });
  })
);

// 7. Resend Invite
adminAccessRoutes.post(
  "/invitations/:id/resend",
  requireRole("owner", "admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin.from("admin_invitations").select("*").eq("id", id).maybeSingle();
    
    if (error || !data) return res.status(404).json({ error: "Invitation not found" });
    if (data.status !== "pending") return res.status(400).json({ error: "Invitation is not pending" });
    
    // TODO: Resend Email
    
    await auditLocal(req, "admin.invitation.resend", "admin_invitation", id, {});
    res.json({ success: true });
  })
);

// 8. Revoke Invite
adminAccessRoutes.delete(
  "/invitations/:id",
  requireRole("owner", "admin"),
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { error } = await admin.from("admin_invitations").update({
      status: "revoked"
    }).eq("id", id);
    if (error) throw error;

    await auditLocal(req, "admin.invitation.revoke", "admin_invitation", id, {});
    res.json({ success: true });
  })
);

// 9. Change Role
adminAccessRoutes.patch(
  "/members/:id/role",
  requireRole("owner", "admin"),
  requireMfaIfEnabled,
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { role } = z.object({ role: z.enum(["admin", "co_admin"]) }).parse(req.body);
    
    if (req.userId === id) {
       return res.status(400).json({ error: "Cannot change your own role" });
    }

    if (req.adminRole === "admin" && role === "admin") {
      return res.status(403).json({ error: "Cannot assign role equal to your own" });
    }

    const { error } = await admin.from("admin_accounts").update({ role }).eq("user_id", id);
    if (error) throw error;
    
    await auditLocal(req, "admin.member.role", "admin_account", id, { role });
    res.json({ success: true });
  })
);

// 10. Change Status
adminAccessRoutes.patch(
  "/members/:id/status",
  requireRole("owner", "admin"),
  requireMfaIfEnabled,
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z.object({ status: z.enum(["active", "suspended", "revoked"]) }).parse(req.body);
    
    if (req.userId === id) {
       return res.status(400).json({ error: "Cannot change your own status" });
    }

    const { data: target } = await admin.from("admin_accounts").select("role").eq("user_id", id).maybeSingle();
    if (target?.role === "owner") {
       return res.status(403).json({ error: "Cannot suspend or revoke an owner" });
    }

    const { error } = await admin.from("admin_accounts").update({ status }).eq("user_id", id);
    if (error) throw error;
    
    await auditLocal(req, "admin.member.status", "admin_account", id, { status });
    res.json({ success: true });
  })
);
