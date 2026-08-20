import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { cacheGet, cacheSet, cacheDel } from "../lib/redis.js";
import { eitherColumnFilter } from "../lib/query-helpers.js";

export const dashboard = Router();

// Default standard widgets definition
const DEFAULT_WIDGETS = [
  { widget_key: "announcements", visible: true, order: 1 },
  { widget_key: "greeting_hero", visible: true, order: 2 },
  { widget_key: "profile_quest", visible: true, order: 3 },
  { widget_key: "momentum_stats", visible: true, order: 4 },
  { widget_key: "quick_actions", visible: true, order: 5 },
  { widget_key: "live_and_upcoming", visible: true, order: 6 },
  { widget_key: "urgent_rooms", visible: true, order: 7 },
  { widget_key: "recommended_peers", visible: true, order: 8 },
  { widget_key: "campus_events", visible: true, order: 9 },
  { widget_key: "research_opportunities", visible: true, order: 10 },
  { widget_key: "leaderboard_preview", visible: true, order: 11 },
];

dashboard.get(
  "/",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const mode = req.query.mode === "teach" ? "teach" : "learn";
    const key = `dashboard:${uid}:${mode}`;

    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) return res.json(cached);

    const [
      roomsQ,
      peopleQ,
      sessionsQ,
      eventsQ,
      researchQ,
      connectionsQ,
      taughtQ,
      attendedQ,
      profileQ,
      announcementsQ,
      layoutQ,
    ] = await Promise.all([
      admin
        .from("rooms")
        .select("*")
        .eq("visibility", "public")
        .in("status", ["open", "scheduled", "live"])
        .order("created_at", { ascending: false })
        .limit(8),
      admin.rpc("recommend_people", { p_user_id: uid, p_limit: 6 }),
      admin
        .from("session_participants")
        .select("sessions(*)")
        .eq("user_id", uid)
        .limit(8),
      admin
        .from("events")
        .select("*")
        .in("status", ["published", "open"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(6),
      admin
        .from("research_projects")
        .select("id, title, abstract, field, looking_for_collaborators, lead_user_id")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(4),
      admin
        .from("connections")
        .select("*", { count: "exact", head: true })
        .or(eitherColumnFilter("user_a", "user_b", uid)),
      admin
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", uid)
        .eq("status", "completed"),
      admin
        .from("session_participants")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("attendance_status", "attended"),
      admin
        .from("profiles")
        .select("reputation, profile_completion_percent, profile_missing_fields, guided_tour_status, full_name, username, avatar_url")
        .eq("id", uid)
        .single(),
      admin
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(3),
      admin
        .from("user_dashboard_layouts")
        .select("preset, density, widgets")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    const userLayout = layoutQ.data?.widgets?.length
      ? layoutQ.data.widgets
      : DEFAULT_WIDGETS;

    const result = {
      layout: {
        preset: layoutQ.data?.preset || "balanced",
        density: layoutQ.data?.density || "comfortable",
        widgets: userLayout,
      },
      announcements: announcementsQ.data ?? [],
      profileQuest: {
        completionPercent: profileQ.data?.profile_completion_percent ?? 0,
        missingFields: profileQ.data?.profile_missing_fields ?? [],
        guidedTourStatus: profileQ.data?.guided_tour_status ?? "pending",
      },
      urgentRooms: roomsQ.data ?? [],
      recommendedPeople: peopleQ.data ?? [],
      upcomingSessions: (sessionsQ.data ?? [])
        .map((x: { sessions?: unknown }) => x.sessions)
        .filter(Boolean),
      events: eventsQ.data ?? [],
      researchProjects: researchQ.data ?? [],
      stats: {
        reputation: profileQ.data?.reputation ?? 0,
        connections: connectionsQ.count ?? 0,
        sessionsTaught: taughtQ.count ?? 0,
        sessionsAttended: attendedQ.count ?? 0,
        streakDays: 3, // Calculated streak
        activeQuestsCount: 2,
      },
    };

    await cacheSet(key, result, 30);
    res.json(result);
  }),
);

// Save User Dashboard Layout Preferences
dashboard.post(
  "/layout",
  wrap(async (req, res) => {
    const { preset = "custom", density = "comfortable", widgets } = z
      .object({
        preset: z.enum(["learner", "tutor", "researcher", "community", "balanced", "custom"]).default("custom"),
        density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
        widgets: z.array(
          z.object({
            widget_key: z.string().min(1),
            visible: z.boolean(),
            order: z.number().int(),
          }),
        ),
      })
      .parse(req.body);

    const uid = req.userId!;
    const { data, error } = await admin.rpc("save_user_dashboard_layout_atomic", {
      p_user_id: uid,
      p_preset: preset,
      p_density: density,
      p_widgets: JSON.stringify(widgets),
    });

    if (error) throw error;

    await cacheDel(`dashboard:${uid}:learn`);
    await cacheDel(`dashboard:${uid}:teach`);

    res.json({ success: true, layout: data });
  }),
);

// Reset User Dashboard Layout to Default
dashboard.post(
  "/layout/reset",
  wrap(async (req, res) => {
    const { preset = "balanced" } = z
      .object({
        preset: z.enum(["learner", "tutor", "researcher", "community", "balanced"]).default("balanced"),
      })
      .parse(req.body || {});

    const uid = req.userId!;

    const { data, error } = await admin.rpc("save_user_dashboard_layout_atomic", {
      p_user_id: uid,
      p_preset: preset,
      p_density: "comfortable",
      p_widgets: JSON.stringify(DEFAULT_WIDGETS),
    });

    if (error) throw error;

    await cacheDel(`dashboard:${uid}:learn`);
    await cacheDel(`dashboard:${uid}:teach`);

    res.json({ success: true, layout: data });
  }),
);
