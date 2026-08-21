import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { cacheDelPattern, cacheGet, cacheSet } from "../lib/redis.js";
import { eitherColumnFilter } from "../lib/query-helpers.js";

export const dashboard = Router();

type DashboardConfigRow = {
  widget_key: string;
  title_en: string;
  title_bn: string;
  default_order: number;
  is_required: boolean;
  is_enabled: boolean;
  target_roles: string[] | null;
  target_campus: string | null;
  min_app_version: string | null;
};

export type DashboardWidget = {
  widget_key: string;
  visible: boolean;
  order: number;
  is_required: boolean;
  title_en: string;
  title_bn: string;
};

type SavedWidget = Pick<DashboardWidget, "widget_key" | "visible" | "order">;

type FeatureFlagRow = {
  key: string;
  is_enabled: boolean;
  rollout_percentage: number;
  target_roles: string[] | null;
};

const DEFAULT_WIDGET_CONFIGS: DashboardConfigRow[] = [
  { widget_key: "announcements", title_en: "Announcements", title_bn: "ঘোষণা", default_order: 1, is_required: true, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "greeting_hero", title_en: "Greeting & Hero", title_bn: "শুভেচ্ছা ও হিরো", default_order: 2, is_required: true, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "profile_quest", title_en: "Profile Completion Quest", title_bn: "প্রোফাইল সম্পূর্ণ করার মিশন", default_order: 3, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "momentum_stats", title_en: "Learning Momentum", title_bn: "শেখার অগ্রগতি", default_order: 4, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "quick_actions", title_en: "Quick Actions", title_bn: "দ্রুত অ্যাকশন", default_order: 5, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "live_and_upcoming", title_en: "Live & Upcoming Sessions", title_bn: "লাইভ ও আসন্ন সেশন", default_order: 6, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "urgent_rooms", title_en: "Urgent Study Rooms", title_bn: "জরুরি স্টাডি রুম", default_order: 7, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "recommended_peers", title_en: "Recommended Peers", title_bn: "প্রস্তাবিত সহপাঠী", default_order: 8, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "campus_events", title_en: "Campus Events", title_bn: "ক্যাম্পাস ইভেন্ট", default_order: 9, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "research_opportunities", title_en: "Research Projects", title_bn: "গবেষণা প্রকল্প", default_order: 10, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
  { widget_key: "leaderboard_preview", title_en: "Leaderboard Podium", title_bn: "লিডারবোর্ড", default_order: 11, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "2.0.0" },
];

function versionParts(version: string) {
  return version
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part.replace(/\D.*$/, ""), 10) || 0);
}

export function compareVersions(left: string, right: string) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function roleMatches(targetRoles: string[] | null, userRoles: string[]) {
  if (!targetRoles?.length) return true;
  const expandedUserRoles = new Set(userRoles);
  if (expandedUserRoles.has("peer_tutor")) expandedUserRoles.add("tutor");
  if (expandedUserRoles.has("tutor")) expandedUserRoles.add("peer_tutor");
  return targetRoles.some((role) => expandedUserRoles.has(role));
}

export function resolveDashboardWidgets(
  configs: DashboardConfigRow[],
  savedWidgets: SavedWidget[] | null | undefined,
  userRoles: string[],
  campus: string | null,
  appVersion: string,
): DashboardWidget[] {
  const eligible = configs
    .filter((config) => config.is_enabled)
    .filter((config) => roleMatches(config.target_roles, userRoles))
    .filter((config) => !config.target_campus || config.target_campus.toLocaleLowerCase() === campus?.toLocaleLowerCase())
    .filter((config) => !config.min_app_version || compareVersions(appVersion, config.min_app_version) >= 0);

  const savedByKey = new Map<string, SavedWidget>();
  for (const item of savedWidgets ?? []) {
    if (!savedByKey.has(item.widget_key)) savedByKey.set(item.widget_key, item);
  }

  return eligible
    .map((config) => {
      const saved = savedByKey.get(config.widget_key);
      return {
        widget_key: config.widget_key,
        visible: config.is_required ? true : (saved?.visible ?? true),
        order: saved?.order ?? config.default_order,
        is_required: config.is_required,
        title_en: config.title_en,
        title_bn: config.title_bn,
      };
    })
    .sort((a, b) => a.order - b.order || a.widget_key.localeCompare(b.widget_key))
    .map((widget, index) => ({ ...widget, order: index + 1 }));
}

export function evaluateFeatureFlag(flag: FeatureFlagRow, userId: string, userRoles: string[]) {
  if (!flag.is_enabled || !roleMatches(flag.target_roles, userRoles)) return false;
  if (flag.rollout_percentage >= 100) return true;
  if (flag.rollout_percentage <= 0) return false;
  const digest = createHash("sha256").update(`${flag.key}:${userId}`).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100 < flag.rollout_percentage;
}

function baseWidgets(widgets: DashboardWidget[]): SavedWidget[] {
  return widgets.map(({ widget_key, visible, order }) => ({ widget_key, visible, order }));
}

dashboard.get(
  "/",
  wrap(async (req, res) => {
    const uid = req.userId!;
    const mode = req.query.mode === "teach" ? "teach" : "learn";
    const appVersion = req.header("x-app-version")?.trim() || "2.0.0";
    const key = `dashboard:${uid}:${mode}:${appVersion}`;

    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) return res.json(cached);

    const now = new Date().toISOString();
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
      dismissalsQ,
      layoutQ,
      configsQ,
      flagsQ,
    ] = await Promise.all([
      admin.from("rooms").select("*").eq("visibility", "public").in("status", ["open", "scheduled", "live"]).order("created_at", { ascending: false }).limit(8),
      admin.rpc("recommend_people", { p_user_id: uid, p_limit: 6 }),
      admin.from("session_participants").select("sessions(*)").eq("user_id", uid).limit(8),
      admin.from("events").select("*").in("status", ["published", "open"]).gte("starts_at", now).order("starts_at").limit(6),
      admin.from("research_projects").select("id,title,description,research_areas,looking_for_collaborators,owner_id").eq("status", "active").eq("visibility", "public").order("created_at", { ascending: false }).limit(4),
      admin.from("connections").select("*", { count: "exact", head: true }).or(eitherColumnFilter("user_a", "user_b", uid)),
      admin.from("sessions").select("*", { count: "exact", head: true }).eq("teacher_id", uid).eq("status", "completed"),
      admin.from("session_participants").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("attendance_status", "attended"),
      admin.from("profiles").select("reputation, profile_completion_percent, profile_missing_fields, guided_tour_status, guided_tour_version, guided_tour_last_step, full_name, username, avatar_url, roles, university").eq("id", uid).single(),
      admin.from("announcements").select("*").eq("is_active", true).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("created_at", { ascending: false }).limit(10),
      admin.from("announcement_dismissals").select("announcement_id").eq("user_id", uid),
      admin.from("user_dashboard_layouts").select("preset, density, widgets").eq("user_id", uid).maybeSingle(),
      admin.from("dashboard_configs").select("widget_key,title_en,title_bn,default_order,is_required,is_enabled,target_roles,target_campus,min_app_version").order("default_order"),
      admin.from("feature_flags").select("key,is_enabled,rollout_percentage,target_roles").order("key"),
    ]);

    const firstError = [roomsQ, peopleQ, sessionsQ, eventsQ, researchQ, connectionsQ, taughtQ, attendedQ, profileQ, announcementsQ, dismissalsQ, layoutQ, configsQ, flagsQ]
      .map((query) => query.error)
      .find(Boolean);
    if (firstError) throw firstError;

    const configs = ((configsQ.data?.length ? configsQ.data : DEFAULT_WIDGET_CONFIGS) ?? []) as DashboardConfigRow[];
    const widgets = resolveDashboardWidgets(
      configs,
      layoutQ.data?.widgets as SavedWidget[] | null | undefined,
      req.userRoles ?? ["student"],
      profileQ.data?.university ?? null,
      appVersion,
    );
    const dismissedIds = new Set((dismissalsQ.data ?? []).map((row: { announcement_id: string }) => row.announcement_id));
    const evaluatedFlags = Object.fromEntries(
      ((flagsQ.data ?? []) as FeatureFlagRow[]).map((flag) => [flag.key, evaluateFeatureFlag(flag, uid, req.userRoles ?? ["student"])]),
    );

    const result = {
      layout: {
        preset: layoutQ.data?.preset || "balanced",
        density: layoutQ.data?.density || "comfortable",
        widgets,
      },
      featureFlags: evaluatedFlags,
      announcements: (announcementsQ.data ?? []).filter((announcement: {
        id: string;
        is_dismissible?: boolean;
        target_roles?: string[] | null;
        target_campus?: string | null;
      }) => (
        roleMatches(announcement.target_roles ?? null, req.userRoles ?? ["student"])
        && (!announcement.target_campus || announcement.target_campus.toLocaleLowerCase() === profileQ.data?.university?.toLocaleLowerCase())
        && (!announcement.is_dismissible || !dismissedIds.has(announcement.id))
      )),
      profileQuest: {
        completionPercent: profileQ.data?.profile_completion_percent ?? 0,
        missingFields: profileQ.data?.profile_missing_fields ?? [],
        guidedTourStatus: profileQ.data?.guided_tour_status ?? "pending",
        guidedTourVersion: profileQ.data?.guided_tour_version ?? 1,
        guidedTourLastStep: profileQ.data?.guided_tour_last_step ?? "start",
      },
      urgentRooms: roomsQ.data ?? [],
      recommendedPeople: peopleQ.data ?? [],
      upcomingSessions: (sessionsQ.data ?? []).map((row: { sessions?: unknown }) => row.sessions).filter(Boolean),
      events: eventsQ.data ?? [],
      researchProjects: researchQ.data ?? [],
      stats: {
        reputation: profileQ.data?.reputation ?? 0,
        connections: connectionsQ.count ?? 0,
        sessionsTaught: taughtQ.count ?? 0,
        sessionsAttended: attendedQ.count ?? 0,
      },
    };

    await cacheSet(key, result, 30);
    res.json(result);
  }),
);

const layoutSchema = z.object({
  preset: z.enum(["learner", "tutor", "researcher", "community", "balanced", "custom"]).default("custom"),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  widgets: z.array(z.object({
    widget_key: z.string().regex(/^[a-z0-9_]{1,60}$/),
    visible: z.boolean(),
    order: z.number().int().min(0).max(1000),
  })).min(1).max(50),
});

async function configurableLayout(req: Parameters<typeof resolveDashboardWidgets>[2], uid: string, appVersion: string, widgets: SavedWidget[]) {
  const [profileQ, configsQ, flagQ] = await Promise.all([
    admin.from("profiles").select("university").eq("id", uid).single(),
    admin.from("dashboard_configs").select("widget_key,title_en,title_bn,default_order,is_required,is_enabled,target_roles,target_campus,min_app_version").order("default_order"),
    admin.from("feature_flags").select("key,is_enabled,rollout_percentage,target_roles").eq("key", "dashboard_customization").maybeSingle(),
  ]);
  if (profileQ.error) throw profileQ.error;
  if (configsQ.error) throw configsQ.error;
  if (flagQ.error) throw flagQ.error;
  if (flagQ.data && !evaluateFeatureFlag(flagQ.data as FeatureFlagRow, uid, req)) return null;
  const configs = ((configsQ.data?.length ? configsQ.data : DEFAULT_WIDGET_CONFIGS) ?? []) as DashboardConfigRow[];
  return resolveDashboardWidgets(configs, widgets, req, profileQ.data?.university ?? null, appVersion);
}

dashboard.post(
  "/layout",
  wrap(async (req, res) => {
    const body = layoutSchema.parse(req.body);
    if (new Set(body.widgets.map((widget) => widget.widget_key)).size !== body.widgets.length) {
      return res.status(400).json({ error: "Dashboard widgets must be unique" });
    }

    const uid = req.userId!;
    const appVersion = req.header("x-app-version")?.trim() || "2.0.0";
    const normalized = await configurableLayout(req.userRoles ?? ["student"], uid, appVersion, body.widgets);
    if (!normalized) return res.status(403).json({ error: "Dashboard customization is not enabled for this account" });

    const { data, error } = await admin.rpc("save_user_dashboard_layout_atomic", {
      p_user_id: uid,
      p_preset: body.preset,
      p_density: body.density,
      p_widgets: baseWidgets(normalized),
    });
    if (error) throw error;

    await cacheDelPattern(`dashboard:${uid}:*`);
    res.json({ success: true, layout: data });
  }),
);

dashboard.post(
  "/layout/reset",
  wrap(async (req, res) => {
    const { preset = "balanced" } = z.object({
      preset: z.enum(["learner", "tutor", "researcher", "community", "balanced"]).default("balanced"),
    }).parse(req.body || {});
    const uid = req.userId!;
    const appVersion = req.header("x-app-version")?.trim() || "2.0.0";
    const normalized = await configurableLayout(req.userRoles ?? ["student"], uid, appVersion, []);
    if (!normalized) return res.status(403).json({ error: "Dashboard customization is not enabled for this account" });

    const { data, error } = await admin.rpc("save_user_dashboard_layout_atomic", {
      p_user_id: uid,
      p_preset: preset,
      p_density: "comfortable",
      p_widgets: baseWidgets(normalized),
    });
    if (error) throw error;

    await cacheDelPattern(`dashboard:${uid}:*`);
    res.json({ success: true, layout: data });
  }),
);

dashboard.post(
  "/announcements/:id/dismiss",
  wrap(async (req, res) => {
    const announcementId = z.string().uuid().parse(req.params.id);
    const { data: announcement, error: announcementError } = await admin
      .from("announcements")
      .select("id,is_active,is_dismissible")
      .eq("id", announcementId)
      .maybeSingle();
    if (announcementError) throw announcementError;
    if (!announcement?.is_active) return res.status(404).json({ error: "Announcement not found" });
    if (!announcement.is_dismissible) return res.status(409).json({ error: "This announcement cannot be dismissed" });

    const { error } = await admin.from("announcement_dismissals").upsert({
      user_id: req.userId!,
      announcement_id: announcementId,
      dismissed_at: new Date().toISOString(),
    }, { onConflict: "user_id,announcement_id" });
    if (error) throw error;
    await cacheDelPattern(`dashboard:${req.userId!}:*`);
    res.json({ dismissed: true });
  }),
);
