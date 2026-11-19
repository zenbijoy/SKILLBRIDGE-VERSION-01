import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { audit } from "../services/audit.js";
import { requireRole } from "../middleware/auth.js";
import { cacheDelPattern } from "../lib/redis.js";

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

adminDataQualityRoutes.post(
  "/repair",
  requireRole("admin"),
  wrap(async (req, res) => {
    const { action } = z
      .object({
        action: z.enum(["empty_rooms", "stale_onboarding", "incomplete_profiles", "repair_all"]),
      })
      .parse(req.body);

    const results: Record<string, { fixed: number; details: string }> = {};

    // 1. Repair empty rooms: archive active rooms with 0 members
    if (action === "empty_rooms" || action === "repair_all") {
      const { data: rooms } = await db.from("rooms").select("id").eq("status", "active").limit(200);
      const roomIds = (rooms ?? []).map((r) => r.id);
      if (roomIds.length > 0) {
        const { data: members } = await db.from("room_members").select("room_id").in("room_id", roomIds);
        const activeMembersMap = new Set((members ?? []).map((m) => m.room_id));
        const emptyRoomIds = roomIds.filter((id) => !activeMembersMap.has(id));

        if (emptyRoomIds.length > 0) {
          const { error: updateErr } = await db
            .from("rooms")
            .update({ status: "archived" })
            .in("id", emptyRoomIds);
          if (updateErr) throw updateErr;

          results.empty_rooms = {
            fixed: emptyRoomIds.length,
            details: `Archived ${emptyRoomIds.length} empty orphaned rooms.`,
          };
          await audit(req.userId!, "admin.data_quality.archive_empty_rooms", "room", undefined, {
            count: emptyRoomIds.length,
            emptyRoomIds,
          });
        } else {
          results.empty_rooms = { fixed: 0, details: "No empty active rooms found." };
        }
      } else {
        results.empty_rooms = { fixed: 0, details: "No active rooms to check." };
      }
    }

    // 2. Repair stale onboarding: transition stale in-progress onboarding (>7 days) to 'deferred'
    if (action === "stale_onboarding" || action === "repair_all") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleProfiles } = await db
        .from("profiles")
        .select("id")
        .eq("onboarding_status", "in_progress")
        .lt("updated_at", sevenDaysAgo)
        .limit(100);

      const staleIds = (staleProfiles ?? []).map((p) => p.id);
      if (staleIds.length > 0) {
        const { error: staleErr } = await db
          .from("profiles")
          .update({ onboarding_status: "deferred" })
          .in("id", staleIds);
        if (staleErr) throw staleErr;

        results.stale_onboarding = {
          fixed: staleIds.length,
          details: `Transitioned ${staleIds.length} stale onboarding accounts to deferred.`,
        };
        await audit(req.userId!, "admin.data_quality.repair_stale_onboarding", "profile", undefined, {
          count: staleIds.length,
          staleIds,
        });
      } else {
        results.stale_onboarding = { fixed: 0, details: "No stale onboarding sessions found." };
      }
    }

    // 3. Repair incomplete profiles: assign fallback username for accounts with null username
    if (action === "incomplete_profiles" || action === "repair_all") {
      const { data: incomplete } = await db
        .from("profiles")
        .select("id, full_name, username")
        .or("username.is.null,full_name.eq.New member")
        .limit(50);

      let repairedCount = 0;
      for (const p of incomplete ?? []) {
        const patch: Record<string, string> = {};
        if (!p.username) {
          patch.username = `user_${p.id.slice(0, 8)}`;
        }
        if (p.full_name === "New member") {
          patch.full_name = "Community Member";
        }
        if (Object.keys(patch).length > 0) {
          await db.from("profiles").update(patch).eq("id", p.id);
          repairedCount++;
        }
      }

      results.incomplete_profiles = {
        fixed: repairedCount,
        details: `Updated ${repairedCount} incomplete profiles with valid username/name fallbacks.`,
      };
      if (repairedCount > 0) {
        await audit(req.userId!, "admin.data_quality.repair_incomplete_profiles", "profile", undefined, {
          count: repairedCount,
        });
      }
    }

    await cacheDelPattern("dashboard:*");
    await cacheDelPattern("catalog:*");

    res.json({
      success: true,
      action,
      repairedAt: new Date().toISOString(),
      results,
    });
  }),
);
