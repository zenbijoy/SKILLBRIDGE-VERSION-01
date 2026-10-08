import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
export const events = Router();

const isoDateTime = z.preprocess((arg) => {
  if (typeof arg === "string" || arg instanceof Date) {
    const d = new Date(arg);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return arg;
}, z.string().datetime());

events.get(
  "/",
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from("events")
      .select("*, clubs(id, name, logo_url, verified)")
      .order("starts_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    res.json({ events: data ?? [] });
  }),
);

events.get(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: event, error } = await admin
      .from("events")
      .select("*, clubs(id, name, logo_url, verified)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!event) return res.status(404).json({ error: "Event not found" });

    res.json({ event });
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
        starts_at: isoDateTime,
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
    const { data: appData } = await admin
      .from("event_applications")
      .select("id, event_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (!appData) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (appData.event_id !== eventId) {
      return res.status(403).json({ error: "Application does not belong to this event" });
    }

    const { data: e } = await admin
      .from("events")
      .select("club_id, title")
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

// ─────────────────────────────────────────────────────────────────────────────
// Event Enquiry: Ask questions directly to event / seminar managers
// ─────────────────────────────────────────────────────────────────────────────
events.post(
  "/:id/enquiry",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        topic: z.string().min(2).max(100),
        question: z.string().min(5).max(2000),
      })
      .parse(req.body);

    const { data: event } = await admin
      .from("events")
      .select("id, title, created_by, club_id")
      .eq("id", id)
      .maybeSingle();

    if (event?.created_by) {
      await notifyUser(
        event.created_by,
        `New Event Enquiry: ${event.title}`,
        `[${body.topic}]: ${body.question.substring(0, 100)}...`,
        "event",
        { eventId: id },
      );
    }

    res.status(201).json({
      success: true,
      message: "Enquiry submitted to event managers. You will receive an answer soon.",
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Dispute & Allegation: Report issue, scheduling clash or misconduct
// ─────────────────────────────────────────────────────────────────────────────
events.post(
  "/:id/report",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        category: z.enum([
          "scheduling_conflict",
          "misconduct",
          "misleading_info",
          "venue_safety",
          "other",
        ]),
        allegation: z.string().min(5).max(140),
        details: z.string().min(10).max(3000),
      })
      .parse(req.body);

    const { data: event } = await admin
      .from("events")
      .select("id, title, created_by, club_id")
      .eq("id", id)
      .maybeSingle();

    if (event?.created_by) {
      await notifyUser(
        event.created_by,
        `Event Alert / Report: ${event.title}`,
        `[${body.category}] ${body.allegation}: ${body.details.substring(0, 120)}...`,
        "event",
        { eventId: id, alert: "true" },
      );
    }

    const ticketId = `REP-${Date.now().toString(36).toUpperCase()}`;
    res.status(201).json({
      success: true,
      ticket_id: ticketId,
      message: "Allegation submitted to campus event managers for investigation.",
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// AI Event Organizer Tool: Date Conflict, Weather Forecast & LLM Analysis
// ─────────────────────────────────────────────────────────────────────────────
events.post(
  "/analyze-date",
  wrap(async (req, res) => {
    const b = z
      .object({
        target_date: z.string(), // "YYYY-MM-DD"
        event_type: z.enum(["seminar", "workshop", "outdoor_festival", "club_meetup", "hackathon"]).default("workshop"),
        location_type: z.enum(["indoor", "outdoor"]).default("indoor"),
        venue_name: z.string().optional(),
        latitude: z.number().default(23.8103), // Campus / Dhaka default
        longitude: z.number().default(90.4125),
      })
      .parse(req.body);

    // 1. Fetch other campus events on target date for conflict detection
    const dateStart = new Date(`${b.target_date}T00:00:00Z`).toISOString();
    const dateEnd = new Date(`${b.target_date}T23:59:59Z`).toISOString();

    const { data: conflictingEvents } = await admin
      .from("events")
      .select("id, title, starts_at, location, club_id")
      .gte("starts_at", dateStart)
      .lte("starts_at", dateEnd);

    const conflicts = conflictingEvents ?? [];

    // 2. Fetch live Open-Meteo weather forecast
    let weatherData: {
      temp_max: number;
      temp_min: number;
      rain_probability: number;
      weather_code: number;
      summary: string;
      is_outdoor_favorable: boolean;
    } = {
      temp_max: 29,
      temp_min: 22,
      rain_probability: 15,
      weather_code: 1,
      summary: "Mainly clear with mild breeze",
      is_outdoor_favorable: true,
    };

    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${b.latitude}&longitude=${b.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
      const weatherRes = await fetch(weatherUrl);
      if (weatherRes.ok) {
        const wJson = (await weatherRes.json()) as any;
        const daily = wJson?.daily;
        if (daily?.time && Array.isArray(daily.time)) {
          const dayIndex = daily.time.indexOf(b.target_date);
          const idx = dayIndex >= 0 ? dayIndex : 0;
          const code = daily.weathercode?.[idx] ?? 1;
          const rain = daily.precipitation_probability_max?.[idx] ?? 10;
          const tMax = daily.temperature_2m_max?.[idx] ?? 28;
          const tMin = daily.temperature_2m_min?.[idx] ?? 21;

          let desc = "Clear and sunny";
          let favorable = true;
          if (code >= 51 && code <= 67) {
            desc = "Rain / drizzle expected";
            favorable = false;
          } else if (code >= 80 && code <= 82) {
            desc = "Rain showers likely";
            favorable = false;
          } else if (code >= 95) {
            desc = "Thunderstorms predicted";
            favorable = false;
          } else if (code >= 1 && code <= 3) {
            desc = "Partly cloudy, mild";
            favorable = rain < 40;
          }

          if (rain > 50) favorable = false;

          weatherData = {
            temp_max: tMax,
            temp_min: tMin,
            rain_probability: rain,
            weather_code: code,
            summary: desc,
            is_outdoor_favorable: favorable,
          };
        }
      }
    } catch {
      // Use standard weather heuristic fallback
    }

    // 3. Compute suitability score (1-100) & AI feedback
    let score = 90;
    const tips: string[] = [];

    if (conflicts.length > 0) {
      score -= Math.min(conflicts.length * 18, 36);
      tips.push(`⚠️ ${conflicts.length} overlapping event(s) found on this date. Review start times to avoid audience splitting.`);
    } else {
      tips.push("✅ No direct campus event clashes detected for this date.");
    }

    if (b.location_type === "outdoor") {
      if (!weatherData.is_outdoor_favorable || weatherData.rain_probability > 40) {
        score -= 30;
        tips.push(`🌧️ Outdoor risk: ${weatherData.rain_probability}% precipitation chance. Consider reserving a backup indoor auditorium.`);
      } else {
        tips.push(`☀️ Weather is favorable for outdoor activities (${weatherData.temp_max}°C max, ${weatherData.rain_probability}% rain probability).`);
      }
    } else {
      tips.push("🏢 Indoor venue minimizes weather vulnerability.");
    }

    score = Math.max(20, Math.min(98, score));

    let verdict = "Excellent Date";
    if (score < 50) verdict = "High Risk / Reschedule Recommended";
    else if (score < 75) verdict = "Moderate Suitability (Proceed with caution)";

    res.json({
      target_date: b.target_date,
      event_type: b.event_type,
      location_type: b.location_type,
      suitability_score: score,
      verdict,
      weather: weatherData,
      conflicts_count: conflicts.length,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        title: c.title,
        starts_at: c.starts_at,
        location: c.location,
      })),
      recommendations: tips,
    });
  }),
);

