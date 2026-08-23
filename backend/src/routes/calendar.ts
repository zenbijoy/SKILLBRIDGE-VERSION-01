import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const calendar = Router();

const reminderSchema = z.object({
  entity_type: z.enum([
    "room_session",
    "booking",
    "event",
    "club_event",
    "research_deadline",
    "goal_milestone",
    "study_block",
  ]),
  entity_id: z.string().uuid(),
  reminder_time: z.string().datetime(),
});

// GET /api/v1/calendar/agenda - Unified multi-entity timeline
calendar.get(
  "/agenda",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { start_date, end_date } = req.query;

    const startIso = (typeof start_date === "string" ? new Date(start_date) : new Date()).toISOString();
    const endIso = (typeof end_date === "string" ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).toISOString();

    // 1. Session Bookings
    const { data: bookings } = await admin
      .from("session_bookings")
      .select("id, start_time, end_time, mode, status, learner_note, tutor_note, skill:skills(id, name), tutor:profiles!session_bookings_tutor_id_fkey(id, full_name, avatar_url), learner:profiles!session_bookings_learner_id_fkey(id, full_name, avatar_url)")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .gte("start_time", startIso)
      .lte("start_time", endIso)
      .in("status", ["requested", "accepted", "confirmed", "completed"]);

    // 2. Study Plan Blocks
    const { data: studyBlocks } = await admin
      .from("study_plan_blocks")
      .select("id, title, description, start_time, end_time, duration_minutes, study_mode, is_completed, is_skipped, is_custom, goal:learning_goals(id, title)")
      .eq("user_id", userId)
      .gte("start_time", startIso)
      .lte("start_time", endIso);

    // 3. Events / Club Events attended
    const { data: eventApps } = await admin
      .from("event_applications")
      .select("event:events(id, title, description, starts_at, ends_at, location, mode, status)")
      .eq("user_id", userId)
      .eq("status", "accepted");

    // 4. Room Sessions
    const { data: roomMemberships } = await admin
      .from("room_members")
      .select("room:rooms(id, title, topic, sessions:sessions(id, starts_at, ends_at, mode, status, topic))")
      .eq("user_id", userId);

    const agendaItems: any[] = [];

    // Map bookings
    (bookings || []).forEach((b: any) => {
      const skillName = Array.isArray(b.skill) ? b.skill[0]?.name : b.skill?.name;
      const tutorObj = Array.isArray(b.tutor) ? b.tutor[0] : b.tutor;
      const learnerObj = Array.isArray(b.learner) ? b.learner[0] : b.learner;

      agendaItems.push({
        id: `booking-${b.id}`,
        entity_id: b.id,
        entity_type: "booking",
        title: `Tutoring: ${skillName || "Session"}`,
        description: b.learner_note || b.tutor_note || "",
        start_time: b.start_time,
        end_time: b.end_time,
        mode: b.mode,
        status: b.status,
        meta: {
          tutor: tutorObj,
          learner: learnerObj,
          is_tutor: tutorObj?.id === userId,
        },
      });
    });

    // Map study blocks
    (studyBlocks || []).forEach((sb) => {
      agendaItems.push({
        id: `study-${sb.id}`,
        entity_id: sb.id,
        entity_type: "study_block",
        title: sb.title,
        description: sb.description || "",
        start_time: sb.start_time,
        end_time: sb.end_time,
        mode: sb.study_mode,
        status: sb.is_completed ? "completed" : sb.is_skipped ? "skipped" : "scheduled",
        meta: {
          goal: sb.goal,
          is_custom: sb.is_custom,
        },
      });
    });

    // Map events
    (eventApps || []).forEach((app: any) => {
      const e = app.event;
      if (e && e.starts_at >= startIso && e.starts_at <= endIso) {
        agendaItems.push({
          id: `event-${e.id}`,
          entity_id: e.id,
          entity_type: "event",
          title: e.title,
          description: e.description || "",
          start_time: e.starts_at,
          end_time: e.ends_at || e.starts_at,
          mode: e.mode || "offline",
          status: e.status || "scheduled",
          meta: { location: e.location },
        });
      }
    });

    // Map room sessions
    (roomMemberships || []).forEach((rm: any) => {
      const r = rm.room;
      if (r && r.sessions) {
        r.sessions.forEach((s: any) => {
          if (s.starts_at >= startIso && s.starts_at <= endIso) {
            agendaItems.push({
              id: `session-${s.id}`,
              entity_id: s.id,
              entity_type: "room_session",
              title: `${r.title}: ${s.topic || "Room Session"}`,
              description: r.topic || "",
              start_time: s.starts_at,
              end_time: s.ends_at || s.starts_at,
              mode: s.mode || "online",
              status: s.status,
              meta: { room_id: r.id },
            });
          }
        });
      }
    });

    // Sort chronologically
    agendaItems.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    res.json({ agenda: agendaItems });
  }),
);

// GET /api/v1/calendar/day/:date - Day breakdown with conflict detection
calendar.get(
  "/day/:date",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { date } = req.params; // YYYY-MM-DD

    const dayStart = new Date(`${date}T00:00:00.000Z`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59.999Z`).toISOString();

    const { data: bookings } = await admin
      .from("session_bookings")
      .select("id, start_time, end_time, mode, status, skill:skills(id, name), tutor:profiles!session_bookings_tutor_id_fkey(id, full_name), learner:profiles!session_bookings_learner_id_fkey(id, full_name)")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd);

    const { data: studyBlocks } = await admin
      .from("study_plan_blocks")
      .select("id, title, description, start_time, end_time, study_mode, is_completed, is_skipped")
      .eq("user_id", userId)
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd);

    const items: any[] = [];
    (bookings || []).forEach((b: any) => {
      const skillName = Array.isArray(b.skill) ? b.skill[0]?.name : b.skill?.name;
      items.push({
        id: b.id,
        type: "booking",
        title: `Tutoring: ${skillName || "Session"}`,
        start_time: b.start_time,
        end_time: b.end_time,
        mode: b.mode,
        status: b.status,
      });
    });

    (studyBlocks || []).forEach((sb) => {
      items.push({
        id: sb.id,
        type: "study_block",
        title: sb.title,
        start_time: sb.start_time,
        end_time: sb.end_time,
        mode: sb.study_mode,
        status: sb.is_completed ? "completed" : sb.is_skipped ? "skipped" : "scheduled",
      });
    });

    items.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Conflict detection
    const conflicts: any[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (new Date(a.end_time).getTime() > new Date(b.start_time).getTime()) {
          conflicts.push({ item_a: a.id, item_b: b.id, title_a: a.title, title_b: b.title });
        }
      }
    }

    res.json({
      date,
      items,
      conflicts,
      has_conflicts: conflicts.length > 0,
    });
  }),
);

// GET /api/v1/calendar/export/ics - Standard .ics file download
calendar.get(
  "/export/ics",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const now = new Date();
    const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const { data: bookings } = await admin
      .from("session_bookings")
      .select("id, start_time, end_time, mode, status, learner_note, tutor_note, skill:skills(name)")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .gte("start_time", now.toISOString())
      .lte("start_time", future.toISOString())
      .in("status", ["accepted", "confirmed"]);

    const { data: studyBlocks } = await admin
      .from("study_plan_blocks")
      .select("id, title, description, start_time, end_time, study_mode")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .eq("is_skipped", false)
      .gte("start_time", now.toISOString())
      .lte("start_time", future.toISOString());

    function formatIcsDate(isoString: string) {
      return new Date(isoString).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }

    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SkillBridge//Learning Hub Calendar 1.0//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";

    (bookings || []).forEach((b: any) => {
      const skillName = Array.isArray(b.skill) ? b.skill[0]?.name : b.skill?.name;
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:booking-${b.id}@skillbridge.app\r\n`;
      icsContent += `DTSTAMP:${formatIcsDate(new Date().toISOString())}\r\n`;
      icsContent += `DTSTART:${formatIcsDate(b.start_time)}\r\n`;
      icsContent += `DTEND:${formatIcsDate(b.end_time)}\r\n`;
      icsContent += `SUMMARY:SkillBridge: ${skillName || "Session"}\r\n`;
      icsContent += `DESCRIPTION:${(b.learner_note || b.tutor_note || "Tutoring Session").replace(/\n/g, "\\n")}\r\n`;
      icsContent += `STATUS:CONFIRMED\r\n`;
      icsContent += "END:VEVENT\r\n";
    });

    (studyBlocks || []).forEach((sb) => {
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:study-${sb.id}@skillbridge.app\r\n`;
      icsContent += `DTSTAMP:${formatIcsDate(new Date().toISOString())}\r\n`;
      icsContent += `DTSTART:${formatIcsDate(sb.start_time)}\r\n`;
      icsContent += `DTEND:${formatIcsDate(sb.end_time)}\r\n`;
      icsContent += `SUMMARY:${sb.title}\r\n`;
      icsContent += `DESCRIPTION:${(sb.description || "Self-study block").replace(/\n/g, "\\n")}\r\n`;
      icsContent += `STATUS:CONFIRMED\r\n`;
      icsContent += "END:VEVENT\r\n";
    });

    icsContent += "END:VCALENDAR\r\n";

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="skillbridge-schedule.ics"');
    res.send(icsContent);
  }),
);

// GET /api/v1/calendar/reminders - Active reminders
calendar.get(
  "/reminders",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data, error } = await admin
      .from("calendar_reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("is_dismissed", false)
      .order("reminder_time", { ascending: true });

    if (error) throw error;

    res.json({ reminders: data ?? [] });
  }),
);

// POST /api/v1/calendar/reminders - Create reminder
calendar.post(
  "/reminders",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = reminderSchema.parse(req.body);

    const { data, error } = await admin
      .from("calendar_reminders")
      .insert({
        user_id: userId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ reminder: data });
  }),
);

// POST /api/v1/calendar/reminders/:id/dismiss
calendar.post(
  "/reminders/:id/dismiss",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data, error } = await admin
      .from("calendar_reminders")
      .update({ is_dismissed: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ reminder: data });
  }),
);

// POST /api/v1/calendar/reminders/:id/snooze
calendar.post(
  "/reminders/:id/snooze",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { minutes } = req.body || { minutes: 15 };

    const snoozeUntil = new Date(Date.now() + (minutes || 15) * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("calendar_reminders")
      .update({
        is_snoozed: true,
        snooze_until: snoozeUntil,
        reminder_time: snoozeUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ reminder: data });
  }),
);
