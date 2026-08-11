import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
export const events = Router();
events.get(
  "/",
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from("events")
      .select("*")
      .in("status", ["published", "open"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at");
    if (error) throw error;
    res.json({ events: data ?? [] });
  }),
);
events.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        club_id: z.string().uuid(),
        title: z.string().min(4).max(140),
        description: z.string().max(3000),
        starts_at: z.string().datetime(),
        location: z.string().max(200).optional(),
        online_url: z.string().url().optional(),
        capacity: z.number().int().positive().max(5000).optional(),
        application_required: z.boolean().default(true),
      })
      .parse(req.body);
    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", b.club_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role))
      return res.status(403).json({ error: "Club admin role required" });
    const { data, error } = await admin
      .from("events")
      .insert({ ...b, created_by: req.userId!, status: "published" })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
events.post(
  "/:id/apply",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { answers } = z
      .object({ answers: z.record(z.string(), z.unknown()).default({}) })
      .parse(req.body);
    const { data: event } = await admin
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (!event) return res.status(404).json({ error: "Event not found" });
    const status = event.application_required ? "pending" : "approved";
    const { data, error } = await admin
      .from("event_applications")
      .upsert(
        { event_id: id, user_id: req.userId!, answers, status },
        { onConflict: "event_id,user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);
events.patch(
  "/:eventId/applications/:id",
  wrap(async (req, res) => {
    const eventId = z.string().uuid().parse(req.params.eventId);
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["approved", "rejected", "waitlisted"]) })
      .parse(req.body);
    const { data: e } = await admin
      .from("events")
      .select("club_id,title")
      .eq("id", eventId)
      .single();
    const { data: m } = e
      ? await admin
          .from("club_members")
          .select("role")
          .eq("club_id", e.club_id)
          .eq("user_id", req.userId!)
          .maybeSingle()
      : { data: null };
    if (!m || !["owner", "admin"].includes(m.role))
      return res.status(403).json({ error: "Club admin required" });
    const { error } = await admin.rpc("decide_event_application_atomic", {
      p_application_id: id,
      p_decision: status,
      p_reviewer_id: req.userId!
    });
    
    if (error) throw error;
    
    const { data } = await admin
      .from("event_applications")
      .select("*")
      .eq("id", id)
      .single();
    await notifyUser(
      data.user_id,
      `Event application ${status}`,
      `${e?.title ?? "Event"}: your application is ${status}.`,
      "event",
      { eventId },
    );
    res.json(data);
  }),
);
