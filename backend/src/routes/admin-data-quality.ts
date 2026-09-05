import { Router } from "express";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const adminDataQualityRoutes = Router();

adminDataQualityRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const issues: Array<{
      id: string;
      issue: string;
      severity: "critical" | "warning" | "info";
      count: number;
      sampleIds: string[];
      recommendedAction: string;
    }> = [];

    // 1. Check Profiles with default "New member" or missing username
    const { data: incompleteProfiles, count: incompleteCount } = await db
      .from("profiles")
      .select("id", { count: "exact" })
      .or("full_name.eq.New member,username.is.null")
      .limit(5);

    if ((incompleteCount ?? 0) > 0) {
      issues.push({
        id: "issue-profile-incomplete",
        issue: "Profiles with default display name or unassigned username",
        severity: "warning",
        count: incompleteCount ?? 0,
        sampleIds: (incompleteProfiles ?? []).map((p) => p.id),
        recommendedAction: "Notify users via progressive onboarding prompt to complete profile setup.",
      });
    }

    // 2. Check Profiles in 'in_progress' onboarding for longer than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleOnboarding, count: staleCount } = await db
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("onboarding_status", "in_progress")
      .lt("updated_at", sevenDaysAgo)
      .limit(5);

    if ((staleCount ?? 0) > 0) {
      issues.push({
        id: "issue-onboarding-stale",
        issue: "Stale in-progress onboarding sessions (>7 days without activity)",
        severity: "info",
        count: staleCount ?? 0,
        sampleIds: (staleOnboarding ?? []).map((p) => p.id),
        recommendedAction: "Auto-transition status to 'deferred' to prevent modal traps.",
      });
    }

    // 3. Check for rooms with 0 active members
    const { data: rooms } = await db.from("rooms").select("id, status").eq("status", "active").limit(100);
    const roomIds = (rooms ?? []).map((r) => r.id);
    const { data: members } = await db.from("room_members").select("room_id").in("room_id", roomIds);
    const activeMembersMap = new Set((members ?? []).map((m) => m.room_id));
    const emptyRoomIds = roomIds.filter((id) => !activeMembersMap.has(id));

    if (emptyRoomIds.length > 0) {
      issues.push({
        id: "issue-empty-rooms",
        issue: "Active rooms with 0 registered members",
        severity: "warning",
        count: emptyRoomIds.length,
        sampleIds: emptyRoomIds.slice(0, 5),
        recommendedAction: "Review and archive orphaned rooms.",
      });
    }

    // Calculate score
    const healthScore = Math.max(70, 100 - issues.length * 8);

    res.json({
      healthScore,
      diagnosticsRunAt: new Date().toISOString(),
      readOnly: true,
      issues,
      totalIssuesCount: issues.reduce((acc, cur) => acc + cur.count, 0),
    });
  }),
);
