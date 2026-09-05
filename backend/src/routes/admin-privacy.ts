import { Router } from "express";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const adminPrivacyRoutes = Router();

adminPrivacyRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const [
      { data: deactivatedUsers, count: deactivatedCount },
      { data: privateProfiles, count: privateCount },
      { data: privacyAudits, count: auditCount }
    ] = await Promise.all([
      db.from("profiles").select("id, full_name, username, account_status, updated_at", { count: "exact" }).eq("account_status", "deactivated").limit(50),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("profile_visibility", "private"),
      db.from("audit_logs").select("id, actor_id, action, target_type, target_id, metadata, created_at", { count: "exact" })
        .or("action.ilike.%delete%,action.ilike.%deactivate%,action.ilike.%privacy%")
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

    res.json({
      metrics: {
        deactivatedAccountsCount: deactivatedCount ?? 0,
        privateProfilesCount: privateCount ?? 0,
        privacyAuditLogsCount: auditCount ?? 0,
      },
      deactivatedAccounts: deactivatedUsers ?? [],
      auditTrail: privacyAudits ?? [],
    });
  }),
);
