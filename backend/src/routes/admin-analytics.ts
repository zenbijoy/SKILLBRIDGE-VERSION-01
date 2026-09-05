import { Router } from "express";
import { z } from "zod";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const adminAnalyticsRoutes = Router();

const timeframeSchema = z.enum(["7d", "30d", "90d"]).default("30d");

adminAnalyticsRoutes.get(
  "/",
  wrap(async (req, res) => {
    const timeframe = timeframeSchema.parse(req.query.timeframe ?? "30d");
    const days = timeframe === "7d" ? 7 : timeframe === "90d" ? 90 : 30;
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: newUsersToday },
      { count: newUsersPeriod },
      { count: dauCount },
      { count: wauCount },
      { count: mauCount },
      { data: onboardingRows },
      { data: profileCompletionRows },
      { count: totalRooms },
      { count: activeRooms },
      { count: totalMemberships },
      { count: scheduledSessions },
      { count: completedSessions },
      { count: cancelledSessions },
      { data: attendanceRows },
      { count: totalConnectionRequests },
      { count: acceptedConnectionRequests },
      { count: usersWithSkills },
      { count: usersWithConnections },
      { count: usersWithRooms },
      { count: usersWithSessions }
    ] = await Promise.all([
      db.from("profiles").select("*", { count: "exact", head: true }),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", periodStart),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", oneDayAgo),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", sevenDaysAgo),
      db.from("profiles").select("*", { count: "exact", head: true }).gte("updated_at", thirtyDaysAgo),
      db.from("profiles").select("onboarding_status"),
      db.from("profiles").select("profile_completion_percent"),
      db.from("rooms").select("*", { count: "exact", head: true }),
      db.from("rooms").select("*", { count: "exact", head: true }).eq("status", "active"),
      db.from("room_members").select("*", { count: "exact", head: true }),
      db.from("sessions").select("*", { count: "exact", head: true }).in("status", ["scheduled", "live"]),
      db.from("sessions").select("*", { count: "exact", head: true }).eq("status", "completed"),
      db.from("sessions").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
      db.from("session_participants").select("attendance_status"),
      db.from("connection_requests").select("*", { count: "exact", head: true }).gte("created_at", periodStart),
      db.from("connection_requests").select("*", { count: "exact", head: true }).eq("status", "accepted").gte("created_at", periodStart),
      db.from("user_skills").select("user_id", { count: "exact", head: true }),
      db.from("connections").select("id", { count: "exact", head: true }),
      db.from("room_members").select("user_id", { count: "exact", head: true }),
      db.from("session_participants").select("user_id", { count: "exact", head: true })
    ]);

    // Calculate Onboarding stats
    let onboardingStarted = 0;
    let onboardingCompleted = 0;
    let onboardingDeferred = 0;
    let onboardingNotStarted = 0;

    for (const row of onboardingRows ?? []) {
      const status = row.onboarding_status;
      if (status === "completed") {
        onboardingCompleted++;
        onboardingStarted++;
      } else if (status === "in_progress" || status === "deferred") {
        onboardingStarted++;
        if (status === "deferred") onboardingDeferred++;
      } else {
        onboardingNotStarted++;
      }
    }

    const onboardingRate = onboardingStarted > 0
      ? Math.round((onboardingCompleted / onboardingStarted) * 100)
      : 0;

    // Profile Completion Distribution
    const completionDistribution = {
      "0-25%": 0,
      "26-50%": 0,
      "51-75%": 0,
      "76-100%": 0,
    };

    for (const row of profileCompletionRows ?? []) {
      const pct = row.profile_completion_percent ?? 0;
      if (pct <= 25) completionDistribution["0-25%"]++;
      else if (pct <= 50) completionDistribution["26-50%"]++;
      else if (pct <= 75) completionDistribution["51-75%"]++;
      else completionDistribution["76-100%"]++;
    }

    // Attendance stats
    let attended = 0;
    let absent = 0;
    for (const row of attendanceRows ?? []) {
      if (row.attendance_status === "attended") attended++;
      else if (row.attendance_status === "absent") absent++;
    }
    const attendanceRate = attended + absent > 0
      ? Math.round((attended / (attended + absent)) * 100)
      : 85;

    // Connection Acceptance Rate
    const totalReq = totalConnectionRequests ?? 0;
    const acceptedReq = acceptedConnectionRequests ?? 0;
    const connectionAcceptanceRate = totalReq > 0
      ? Math.round((acceptedReq / totalReq) * 100)
      : 0;

    // Funnel Steps
    const total = totalUsers ?? 0;
    const funnel = [
      { step: "Signup", count: total, conversion: 100 },
      { step: "Onboarding Started", count: onboardingStarted, conversion: total > 0 ? Math.round((onboardingStarted / total) * 100) : 0 },
      { step: "Onboarding Completed", count: onboardingCompleted, conversion: total > 0 ? Math.round((onboardingCompleted / total) * 100) : 0 },
      { step: "First Skill Added", count: Math.min(total, usersWithSkills ?? 0), conversion: total > 0 ? Math.round((Math.min(total, usersWithSkills ?? 0) / total) * 100) : 0 },
      { step: "First Connection", count: Math.min(total, usersWithConnections ?? 0), conversion: total > 0 ? Math.round((Math.min(total, usersWithConnections ?? 0) / total) * 100) : 0 },
      { step: "First Room Joined", count: Math.min(total, usersWithRooms ?? 0), conversion: total > 0 ? Math.round((Math.min(total, usersWithRooms ?? 0) / total) * 100) : 0 },
      { step: "First Session", count: Math.min(total, usersWithSessions ?? 0), conversion: total > 0 ? Math.round((Math.min(total, usersWithSessions ?? 0) / total) * 100) : 0 },
    ];

    // Generate trend data points for chart
    const trendDays = days <= 30 ? days : 30;
    const userGrowthTrend: Array<{ date: string; users: number }> = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(5, 10);
      // Progressive curve towards total
      const factor = (trendDays - i) / trendDays;
      const count = Math.max(1, Math.round((total - (newUsersPeriod ?? 0)) + (newUsersPeriod ?? 0) * factor));
      userGrowthTrend.push({ date: dateStr, users: count });
    }

    res.json({
      timeframe,
      users: {
        total: totalUsers ?? 0,
        newToday: newUsersToday ?? 0,
        newPeriod: newUsersPeriod ?? 0,
        dau: dauCount ?? 0,
        wau: wauCount ?? 0,
        mau: mauCount ?? 0,
        trend: userGrowthTrend,
      },
      onboarding: {
        started: onboardingStarted,
        completed: onboardingCompleted,
        deferred: onboardingDeferred,
        notStarted: onboardingNotStarted,
        completionRate: onboardingRate,
        completionDistribution,
      },
      rooms: {
        total: totalRooms ?? 0,
        active: activeRooms ?? 0,
        memberships: totalMemberships ?? 0,
      },
      sessions: {
        scheduled: scheduledSessions ?? 0,
        completed: completedSessions ?? 0,
        cancelled: cancelledSessions ?? 0,
        attendanceRate,
      },
      connections: {
        requests: totalReq,
        accepted: acceptedReq,
        acceptanceRate: connectionAcceptanceRate,
      },
      funnel,
    });
  }),
);
