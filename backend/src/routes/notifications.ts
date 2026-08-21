import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const notifications = Router();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const preferenceSchema = z.object({
  messages: z.boolean().optional(),
  connections: z.boolean().optional(),
  rooms: z.boolean().optional(),
  sessions: z.boolean().optional(),
  teaching: z.boolean().optional(),
  system: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
  quiet_hours_start: timeSchema.optional(),
  quiet_hours_end: timeSchema.optional(),
}).strict();

notifications.get(
  "/",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ notifications: data ?? [] });
  }),
);

notifications.get(
  "/preferences",
  wrap(async (req, res) => {
    const [preferencesQ, profileQ] = await Promise.all([
      admin.from("notification_preferences").select("messages,connections,rooms,sessions,teaching,system").eq("user_id", req.userId!).maybeSingle(),
      admin.from("profiles").select("quiet_hours_start,quiet_hours_end,timezone,onboarding_push_opt_in").eq("id", req.userId!).single(),
    ]);
    if (preferencesQ.error) throw preferencesQ.error;
    if (profileQ.error) throw profileQ.error;
    res.json({
      preferences: {
        messages: preferencesQ.data?.messages ?? true,
        connections: preferencesQ.data?.connections ?? true,
        rooms: preferencesQ.data?.rooms ?? true,
        sessions: preferencesQ.data?.sessions ?? true,
        teaching: preferencesQ.data?.teaching ?? true,
        system: preferencesQ.data?.system ?? true,
      },
      quietHours: {
        start: profileQ.data?.quiet_hours_start ?? "22:00",
        end: profileQ.data?.quiet_hours_end ?? "07:00",
        timezone: profileQ.data?.timezone ?? "Asia/Dhaka",
      },
      onboardingPushOptIn: profileQ.data?.onboarding_push_opt_in ?? true,
    });
  }),
);

notifications.patch(
  "/preferences",
  wrap(async (req, res) => {
    const body = preferenceSchema.refine((value) => Object.keys(value).length > 0, "At least one preference is required").parse(req.body);
    const { data, error } = await admin.rpc("save_notification_preferences_atomic", {
      p_user_id: req.userId!,
      p_patch: body,
    });
    if (error) throw error;
    res.json(data);
  }),
);
notifications.post(
  "/devices",
  wrap(async (req, res) => {
    const { token, platform, provider = "expo", device_id, app_version } = z
      .object({ 
        token: z.string().trim().min(10).max(512),
        platform: z.string().trim().min(1).max(30).regex(/^[a-z0-9_-]+$/i).optional(),
        provider: z.string().trim().min(1).max(30).regex(/^[a-z0-9_-]+$/i).optional(),
        device_id: z.string().trim().min(1).max(200).optional(),
        app_version: z.string().trim().min(1).max(40).optional(),
      })
      .strict()
      .parse(req.body);
    const fp = createHash("sha256").update(token).digest("hex");
    const { data, error } = await admin
      .from("device_tokens")
      .upsert(
        {
          user_id: req.userId!,
          token,
          token_fingerprint: fp,
          platform,
          provider,
          device_id,
          app_version,
          enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token_fingerprint" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

notifications.delete(
  "/devices/:fingerprint",
  wrap(async (req, res) => {
    const fingerprint = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.fingerprint);
    const { error } = await admin
      .from("device_tokens")
      .delete()
      .eq("user_id", req.userId!)
      .eq("token_fingerprint", fingerprint);
    if (error) throw error;
    res.status(204).end();
  })
);
notifications.patch(
  "/read-all",
  wrap(async (req, res) => {
    const { error } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", req.userId!)
      .is("read_at", null);

    if (error) throw error;
    res.json({ success: true });
  }),
);

notifications.patch(
  "/:id/read",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.userId!)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  }),
);
