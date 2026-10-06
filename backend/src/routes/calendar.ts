import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { logger } from "../lib/logger.js";

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

// =============================================================================
// ── Academic Routine & Calendar Engine ────────────────────────────────────────
// =============================================================================

import {
  DAYS_OF_WEEK,
  extractRoutine,
  analyzeConflicts,
  type DayOfWeek,
  type ExtractedRoutineEntry,
} from "../services/routineAiExtractor.js";

// Helper: Normalize academic group
function buildAcademicGroup(uni: string, dept: string, sem: string, sec: string): string {
  return `${(uni || "RUET").trim().toUpperCase()} / ${(dept || "CSE").trim().toUpperCase()} / ${(sem || "1-1").trim().toUpperCase()} / ${(sec || "A").trim().toUpperCase()}`;
}

// ── 1. Academic Profile ───────────────────────────────────────────────────────

// GET /api/v1/calendar/academic-profile
calendar.get(
  "/academic-profile",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data: academicProfile } = await admin
      .from("academic_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (academicProfile) {
      return res.json({ profile: academicProfile });
    }

    // Fall back to main user profile
    const { data: userProfile } = await admin
      .from("profiles")
      .select("university, department, batch")
      .eq("id", userId)
      .maybeSingle();

    const fallback = {
      user_id: userId,
      university: userProfile?.university || "RUET",
      department: userProfile?.department || "CSE",
      semester: "2-1",
      section: "A",
      batch: userProfile?.batch || "2024",
      academic_group: buildAcademicGroup(
        userProfile?.university || "RUET",
        userProfile?.department || "CSE",
        "2-1",
        "A",
      ),
    };

    res.json({ profile: fallback });
  }),
);

// PUT /api/v1/calendar/academic-profile
calendar.put(
  "/academic-profile",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        university: z.string().min(1).max(100),
        department: z.string().min(1).max(100),
        semester: z.string().min(1).max(50),
        section: z.string().min(1).max(20),
        batch: z.string().max(50).optional(),
      })
      .parse(req.body);

    const academic_group = buildAcademicGroup(
      body.university,
      body.department,
      body.semester,
      body.section,
    );

    const { data, error } = await admin
      .from("academic_profiles")
      .upsert({
        user_id: userId,
        ...body,
        academic_group,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ profile: data });
  }),
);

// ── 2. AI Routine Extraction ──────────────────────────────────────────────────

// POST /api/v1/calendar/routine/extract
calendar.post(
  "/routine/extract",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        fileBase64: z.string().optional(),
        fileMimeType: z.string().optional(),
        mimeType: z.string().optional(),
        fileName: z.string().optional(),
        rawText: z.string().optional(),
        university: z.string().optional(),
        department: z.string().optional(),
        semester: z.string().optional(),
        section: z.string().optional(),
        batch: z.string().optional(),
        additionalContext: z.string().optional(),
        userNotes: z.string().optional(),
        context: z
          .object({
            university: z.string().optional(),
            department: z.string().optional(),
            semester: z.string().optional(),
            section: z.string().optional(),
            batch: z.string().optional(),
            userNotes: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const uni = (body.university || body.context?.university || "RUET").trim();
    const dept = (body.department || body.context?.department || "CSE").trim();
    const sem = (body.semester || body.context?.semester || "2-1").trim();
    const sec = (body.section || body.context?.section || "A").trim();
    const batch = (body.batch || body.context?.batch || "2024").trim();
    const notes = (body.additionalContext || body.userNotes || body.context?.userNotes || "").trim();
    const mime = body.fileMimeType || body.mimeType || "application/pdf";

    const extractionContext = {
      university: uni,
      department: dept,
      semester: sem,
      section: sec,
      batch,
      userNotes: notes,
    };

    // Call Gemini / Multi-page AI pipeline
    const extraction = await extractRoutine({
      fileBase64: body.fileBase64,
      fileMimeType: mime,
      fileName: body.fileName,
      rawText: body.rawText,
      context: extractionContext,
    });

    const group = buildAcademicGroup(uni, dept, sem, sec);
    let routineRecord: any = null;
    let entryRows: any[] = [];

    // Attempt to persist in Supabase (with graceful fallback if DB schema is offline)
    try {
      const { data: routine, error: routineError } = await admin
        .from("academic_routines")
        .insert({
          user_id: userId,
          title: `${dept} ${sem} Sec ${sec} Routine (AI Draft)`,
          university: uni,
          department: dept,
          semester: sem,
          section: sec,
          batch: batch || null,
          academic_group: group,
          version: 1,
          is_active: false,
          is_public: false,
          source_type: "pdf_import",
          verification_status: extraction.hasAmbiguity ? "needs_review" : "ai_draft",
          raw_metadata: {
            conflicts: extraction.conflicts,
            hasAmbiguity: extraction.hasAmbiguity,
            overallConfidence: extraction.overallConfidence,
            source: extraction.source,
            totalDetected: extraction.totalDetected,
          },
        })
        .select()
        .single();

      if (!routineError && routine) {
        routineRecord = routine;

        if (extraction.classes.length > 0) {
          entryRows = extraction.classes.map((c) => ({
            routine_id: routine.id,
            course_code: c.courseCode,
            course_title: c.courseTitle,
            day_of_week: c.day,
            start_time: c.startTime,
            end_time: c.endTime,
            room: c.room,
            instructor: c.instructor,
            type: c.type,
            group_name: c.groupName,
            confidence: c.confidence,
            warnings: c.warnings,
            is_confirmed: false,
          }));

          await admin.from("routine_entries").insert(entryRows);
        }

        // Audit log
        await admin.from("academic_audit_logs").insert({
          user_id: userId,
          routine_id: routine.id,
          action: "upload_ai_draft",
          details: {
            totalDetected: extraction.totalDetected,
            confidence: extraction.overallConfidence,
            hasAmbiguity: extraction.hasAmbiguity,
          },
        });
      }
    } catch (dbErr) {
      logger.warn({ err: (dbErr as Error).message }, "Supabase routine insert warning (fallback to in-memory draft)");
    }

    // In-memory fallback draft if Supabase table is unreachable
    if (!routineRecord) {
      const routineId = crypto.randomUUID();
      entryRows = extraction.classes.map((c) => ({
        id: crypto.randomUUID(),
        routine_id: routineId,
        course_code: c.courseCode,
        course_title: c.courseTitle,
        day_of_week: c.day,
        start_time: c.startTime,
        end_time: c.endTime,
        room: c.room,
        instructor: c.instructor,
        type: c.type,
        group_name: c.groupName,
        confidence: c.confidence,
        warnings: c.warnings,
        is_confirmed: false,
      }));

      routineRecord = {
        id: routineId,
        user_id: userId,
        title: `${dept} ${sem} Sec ${sec} Routine (AI Draft)`,
        university: uni,
        department: dept,
        semester: sem,
        section: sec,
        batch: batch || null,
        academic_group: group,
        version: 1,
        is_active: false,
        is_public: false,
        source_type: "pdf_import",
        verification_status: extraction.hasAmbiguity ? "needs_review" : "ai_draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        raw_metadata: {
          conflicts: extraction.conflicts,
          hasAmbiguity: extraction.hasAmbiguity,
          overallConfidence: extraction.overallConfidence,
          source: extraction.source,
          totalDetected: extraction.totalDetected,
        },
      };
    }

    res.json({
      routine: {
        ...routineRecord,
        entries: entryRows,
      },
      extraction,
    });
  }),
);

// ── 3. Routines CRUD ──────────────────────────────────────────────────────────

// GET /api/v1/calendar/routines
calendar.get(
  "/routines",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data, error } = await admin
      .from("academic_routines")
      .select("*, entries:routine_entries(count)")
      .eq("user_id", userId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ routines: data ?? [] });
  }),
);

// GET /api/v1/calendar/routines/:id
calendar.get(
  "/routines/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: routine, error } = await admin
      .from("academic_routines")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !routine) return res.status(404).json({ error: "Routine not found" });

    // Ensure access (owner or public)
    if (routine.user_id !== userId && !routine.is_public) {
      return res.status(403).json({ error: "Unauthorized access to routine" });
    }

    // Fetch entries
    const { data: entries } = await admin
      .from("routine_entries")
      .select("*")
      .eq("routine_id", id)
      .order("day_of_week")
      .order("start_time");

    // Fetch user's overrides
    const { data: overrides } = await admin
      .from("user_routine_overrides")
      .select("*")
      .eq("routine_id", id)
      .eq("user_id", userId);

    // Fetch validations count
    const { data: validations } = await admin
      .from("routine_validations")
      .select("status, issue_category")
      .eq("routine_id", id);

    const confirmedCount = (validations || []).filter((v) => v.status === "confirmed").length;
    const reportedIssues = (validations || []).filter((v) => v.status === "reported");

    res.json({
      routine,
      entries: entries ?? [],
      overrides: overrides ?? [],
      stats: {
        confirmedCount,
        reportedCount: reportedIssues.length,
        reportedIssues,
      },
    });
  }),
);

// POST /api/v1/calendar/routines (Manual creation)
calendar.post(
  "/routines",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        title: z.string().min(1).max(100),
        university: z.string().min(1).max(100),
        department: z.string().min(1).max(100),
        semester: z.string().min(1).max(50),
        section: z.string().min(1).max(20),
        batch: z.string().max(50).optional(),
        entries: z
          .array(
            z.object({
              courseCode: z.string().min(1),
              courseTitle: z.string().min(1),
              day: z.enum(DAYS_OF_WEEK),
              startTime: z.string(),
              endTime: z.string(),
              room: z.string().optional().nullable(),
              instructor: z.string().optional().nullable(),
              type: z.enum(["CLASS", "LAB", "OTHER"]).default("CLASS"),
              groupName: z.string().optional().nullable(),
            }),
          )
          .default([]),
      })
      .parse(req.body);

    const group = buildAcademicGroup(
      body.university,
      body.department,
      body.semester,
      body.section,
    );

    const { data: routine, error } = await admin
      .from("academic_routines")
      .insert({
        user_id: userId,
        title: body.title,
        university: body.university,
        department: body.department,
        semester: body.semester,
        section: body.section,
        batch: body.batch || null,
        academic_group: group,
        version: 1,
        is_active: false,
        is_public: false,
        source_type: "manual",
        verification_status: "user_verified",
      })
      .select()
      .single();

    if (error) throw error;

    if (body.entries.length > 0) {
      const entryRows = body.entries.map((e) => ({
        routine_id: routine.id,
        course_code: e.courseCode,
        course_title: e.courseTitle,
        day_of_week: e.day,
        start_time: e.startTime,
        end_time: e.endTime,
        room: e.room || null,
        instructor: e.instructor || null,
        type: e.type,
        group_name: e.groupName || null,
        confidence: "high",
        warnings: [],
        is_confirmed: true,
      }));

      await admin.from("routine_entries").insert(entryRows);
    }

    res.status(201).json({ routine });
  }),
);

// PUT /api/v1/calendar/routines/:id (Update routine entries & metadata)
calendar.put(
  "/routines/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const body = z
      .object({
        title: z.string().optional(),
        entries: z
          .array(
            z.object({
              id: z.string().optional(),
              courseCode: z.string().min(1),
              courseTitle: z.string().min(1),
              day: z.enum(DAYS_OF_WEEK),
              startTime: z.string(),
              endTime: z.string(),
              room: z.string().optional().nullable(),
              instructor: z.string().optional().nullable(),
              type: z.enum(["CLASS", "LAB", "OTHER"]).default("CLASS"),
              groupName: z.string().optional().nullable(),
              confidence: z.enum(["high", "medium", "low", "ambiguous"]).optional(),
              warnings: z.array(z.string()).optional(),
            }),
          )
          .optional(),
      })
      .parse(req.body);

    const { data: routine } = await admin
      .from("academic_routines")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!routine) return res.status(404).json({ error: "Routine not found or unauthorized" });

    if (body.title) {
      await admin
        .from("academic_routines")
        .update({ title: body.title, updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    if (body.entries) {
      // Re-evaluate conflicts
      const enrichedEntries: ExtractedRoutineEntry[] = body.entries.map((e) => ({
        courseCode: e.courseCode,
        courseTitle: e.courseTitle,
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        room: e.room || null,
        instructor: e.instructor || null,
        type: e.type,
        groupName: e.groupName || null,
        confidence: e.confidence || "high",
        warnings: e.warnings || [],
      }));

      const { conflicts, enrichedClasses, hasAmbiguity } = analyzeConflicts(enrichedEntries);

      // Delete existing entries and replace
      await admin.from("routine_entries").delete().eq("routine_id", id);

      const rows = enrichedClasses.map((c) => ({
        routine_id: id,
        course_code: c.courseCode,
        course_title: c.courseTitle,
        day_of_week: c.day,
        start_time: c.startTime,
        end_time: c.endTime,
        room: c.room,
        instructor: c.instructor,
        type: c.type,
        group_name: c.groupName,
        confidence: c.confidence,
        warnings: c.warnings,
        is_confirmed: true,
      }));

      await admin.from("routine_entries").insert(rows);

      await admin
        .from("academic_routines")
        .update({
          raw_metadata: {
            conflicts,
            hasAmbiguity,
            overallConfidence: hasAmbiguity ? "medium" : "high",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    // Audit log
    await admin.from("academic_audit_logs").insert({
      user_id: userId,
      routine_id: id,
      action: "edit_routine",
      details: { entriesCount: body.entries?.length },
    });

    res.json({ success: true, message: "Routine updated successfully" });
  }),
);

// POST /api/v1/calendar/routines/:id/activate (Confirm & Activate)
calendar.post(
  "/routines/:id/activate",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: routine } = await admin
      .from("academic_routines")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!routine) return res.status(404).json({ error: "Routine not found" });

    // Archive previous active routine for this user
    await admin
      .from("academic_routines")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    // Set this one as active and user_verified
    const { data: updated, error } = await admin
      .from("academic_routines")
      .update({
        is_active: true,
        verification_status: "user_verified",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await admin.from("academic_audit_logs").insert({
      user_id: userId,
      routine_id: id,
      action: "activate_routine",
      details: { title: routine.title, academic_group: routine.academic_group },
    });

    res.json({
      success: true,
      message: "Routine verified and activated! Your calendar and class reminders are ready.",
      routine: updated,
    });
  }),
);

// POST /api/v1/calendar/routines/:id/share (Toggle public class sharing)
calendar.post(
  "/routines/:id/share",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { is_public } = z.object({ is_public: z.boolean() }).parse(req.body);

    const { data: routine } = await admin
      .from("academic_routines")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!routine) return res.status(404).json({ error: "Routine not found" });

    const newStatus = is_public ? "class_shared" : "user_verified";

    const { data: updated, error } = await admin
      .from("academic_routines")
      .update({
        is_public,
        verification_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await admin.from("academic_audit_logs").insert({
      user_id: userId,
      routine_id: id,
      action: is_public ? "share_routine" : "unshare_routine",
      details: { academic_group: routine.academic_group },
    });

    res.json({
      success: true,
      is_public,
      routine: updated,
      message: is_public
        ? `Routine is now shared with classmates in ${routine.academic_group}.`
        : "Routine sharing turned off.",
    });
  }),
);

// ── 4. Public Class Routine Discovery ─────────────────────────────────────────

// GET /api/v1/calendar/routines/discover
calendar.get(
  "/routines/discover",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { academic_group, department, semester, section } = req.query;

    let query = admin
      .from("academic_routines")
      .select("*, uploader:profiles!academic_routines_user_id_fkey(full_name, avatar_url)")
      .eq("is_public", true)
      .neq("user_id", userId);

    if (typeof academic_group === "string" && academic_group.trim()) {
      query = query.ilike("academic_group", `%${academic_group.trim()}%`);
    } else {
      if (department) query = query.ilike("department", `%${String(department)}%`);
      if (semester) query = query.ilike("semester", `%${String(semester)}%`);
      if (section) query = query.ilike("section", `%${String(section)}%`);
    }

    const { data: routines, error } = await query
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    // Fetch stats for each discovered routine
    const routineIds = (routines || []).map((r) => r.id);
    let validationsMap: Record<string, { confirmed: number; reported: number }> = {};

    if (routineIds.length > 0) {
      const { data: vals } = await admin
        .from("routine_validations")
        .select("routine_id, status")
        .in("routine_id", routineIds);

      (vals || []).forEach((v) => {
        const currVal = validationsMap[v.routine_id] || { confirmed: 0, reported: 0 };
        if (v.status === "confirmed") currVal.confirmed++;
        if (v.status === "reported") currVal.reported++;
        validationsMap[v.routine_id] = currVal;
      });
    }

    const enriched = (routines || []).map((r) => ({
      ...r,
      confirmedCount: validationsMap[r.id]?.confirmed ?? 0,
      reportedCount: validationsMap[r.id]?.reported ?? 0,
    }));

    res.json({ routines: enriched });
  }),
);

// POST /api/v1/calendar/routines/:id/copy (Copy public routine to personal draft)
calendar.post(
  "/routines/:id/copy",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: source } = await admin
      .from("academic_routines")
      .select("*, entries:routine_entries(*)")
      .eq("id", id)
      .eq("is_public", true)
      .single();

    if (!source) return res.status(404).json({ error: "Public routine not found" });

    // Create personal copy as draft
    const { data: newRoutine, error: insertError } = await admin
      .from("academic_routines")
      .insert({
        user_id: userId,
        title: `${source.title} (My Copy)`,
        university: source.university,
        department: source.department,
        semester: source.semester,
        section: source.section,
        batch: source.batch,
        academic_group: source.academic_group,
        version: 1,
        is_active: false,
        is_public: false,
        source_type: "public_copy",
        verification_status: "ai_draft", // Requires review!
        raw_metadata: { copiedFrom: source.id },
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Copy entries
    const entries = (source.entries || []).map((e: any) => ({
      routine_id: newRoutine.id,
      course_code: e.course_code,
      course_title: e.course_title,
      day_of_week: e.day_of_week,
      start_time: e.start_time,
      end_time: e.end_time,
      room: e.room,
      instructor: e.instructor,
      type: e.type,
      group_name: e.group_name,
      confidence: "high",
      warnings: [],
      is_confirmed: false,
    }));

    if (entries.length > 0) {
      await admin.from("routine_entries").insert(entries);
    }

    res.status(201).json({
      success: true,
      message: "Routine copied to your drafts. Please review and verify it before activating.",
      routine: newRoutine,
    });
  }),
);

// POST /api/v1/calendar/routines/:id/validate (Community validation / report)
calendar.post(
  "/routines/:id/validate",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const body = z
      .object({
        status: z.enum(["confirmed", "reported"]),
        issue_category: z
          .enum(["wrong_time", "wrong_course", "wrong_section", "outdated", "duplicate", "other"])
          .optional(),
        comment: z.string().max(500).optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("routine_validations")
      .upsert({
        routine_id: id,
        user_id: userId,
        status: body.status,
        issue_category: body.issue_category || null,
        comment: body.comment || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update routine status flag if reported
    if (body.status === "reported") {
      await admin
        .from("academic_routines")
        .update({ verification_status: "reported_issue" })
        .eq("id", id);
    }

    res.json({ validation: data });
  }),
);

// POST /api/v1/calendar/routines/:id/overrides (Personal override for routine class)
calendar.post(
  "/routines/:id/overrides",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id: routine_id } = req.params;

    const body = z
      .object({
        routine_entry_id: z.string().uuid(),
        custom_room: z.string().max(50).optional().nullable(),
        custom_instructor: z.string().max(100).optional().nullable(),
        custom_start_time: z.string().optional().nullable(),
        custom_end_time: z.string().optional().nullable(),
        custom_notes: z.string().max(500).optional().nullable(),
        is_hidden: z.boolean().default(false),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("user_routine_overrides")
      .upsert({
        user_id: userId,
        routine_id,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ override: data });
  }),
);

// ── 5. Academic Calendar Events & Tasks ────────────────────────────────────────

// Helper to expand dates between start and end
function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (curr <= end) {
    const dStr = curr.toISOString().split("T")[0];
    if (dStr) dates.push(dStr);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// GET /api/v1/calendar/events (Merged timeline of classes, tasks, exceptions)
calendar.get(
  "/events",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { start_date, end_date, type, search } = req.query;

    const todayStr = new Date().toISOString().split("T")[0] || "";
    const startDate = typeof start_date === "string" ? start_date : todayStr;
    const endDate =
      typeof end_date === "string"
        ? end_date
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] || "";

    // 1. Fetch user's active routine and its entries
    const { data: activeRoutine } = await admin
      .from("academic_routines")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    let recurringClasses: any[] = [];

    if (activeRoutine) {
      const { data: routineEntries } = await admin
        .from("routine_entries")
        .select("*")
        .eq("routine_id", activeRoutine.id);

      // Fetch user's overrides
      const { data: overrides } = await admin
        .from("user_routine_overrides")
        .select("*")
        .eq("user_id", userId)
        .eq("routine_id", activeRoutine.id);

      const overrideMap = new Map((overrides || []).map((o) => [o.routine_entry_id, o]));

      // Fetch exceptions in range (cancelled classes, rescheduled, etc.)
      const { data: exceptions } = await admin
        .from("academic_calendar_events")
        .select("*")
        .eq("user_id", userId)
        .eq("is_exception", true)
        .gte("date", startDate)
        .lte("date", endDate);

      const exceptionMap = new Map(
        (exceptions || []).map((ex) => [`${ex.routine_entry_id}_${ex.date}`, ex]),
      );

      // Expand routine for each day in range
      const datesInRange = getDatesInRange(startDate, endDate);

      for (const dateStr of datesInRange) {
        const dObj = new Date(dateStr);
        const dayName = DAYS_OF_WEEK[dObj.getDay()] || "Sunday";

        const matchingEntries = (routineEntries || []).filter(
          (entry) => entry.day_of_week === dayName,
        );

        for (const entry of matchingEntries) {
          const override = overrideMap.get(entry.id);
          if (override?.is_hidden) continue;

          const exKey = `${entry.id}_${dateStr}`;
          const ex = exceptionMap.get(exKey);

          // If explicitly cancelled
          if (ex && ex.exception_type === "cancelled") {
            recurringClasses.push({
              id: `class-${entry.id}-${dateStr}`,
              routine_entry_id: entry.id,
              title: `${entry.course_code}: ${entry.course_title}`,
              event_type: entry.type,
              course_code: entry.course_code,
              course_title: entry.course_title,
              description: "Class cancelled for this date",
              location: override?.custom_room || entry.room || "TBA",
              instructor: override?.custom_instructor || entry.instructor || null,
              date: dateStr,
              start_time: entry.start_time,
              end_time: entry.end_time,
              is_all_day: false,
              is_completed: false,
              priority: "medium",
              is_exception: true,
              is_cancelled: true,
              exception_type: "cancelled",
              is_routine_class: true,
            });
            continue;
          }

          recurringClasses.push({
            id: `class-${entry.id}-${dateStr}`,
            routine_entry_id: entry.id,
            title: `${entry.course_code}: ${entry.course_title}`,
            event_type: entry.type,
            course_code: entry.course_code,
            course_title: entry.course_title,
            description: override?.custom_notes || "",
            location: override?.custom_room || entry.room || "TBA",
            instructor: override?.custom_instructor || entry.instructor || null,
            date: dateStr,
            start_time: ex?.start_time || override?.custom_start_time || entry.start_time,
            end_time: ex?.end_time || override?.custom_end_time || entry.end_time,
            is_all_day: false,
            is_completed: false,
            priority: "medium",
            is_exception: false,
            is_cancelled: false,
            is_routine_class: true,
          });
        }
      }
    }

    // 2. Fetch explicit events & tasks (Assignments, Exams, Quizzes, Deadlines, Personal Tasks)
    const { data: explicitEvents, error: expError } = await admin
      .from("academic_calendar_events")
      .select("*")
      .eq("user_id", userId)
      .eq("is_exception", false)
      .gte("date", startDate)
      .lte("date", endDate);

    if (expError) throw expError;

    // Combine
    let allEvents = [...recurringClasses, ...(explicitEvents || [])];

    // Filter by type if provided
    if (typeof type === "string" && type && type !== "ALL") {
      allEvents = allEvents.filter((e) => e.event_type === type);
    }

    // Filter by search query if provided
    if (typeof search === "string" && search.trim()) {
      const q = search.trim().toLowerCase();
      allEvents = allEvents.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) ||
          e.course_code?.toLowerCase().includes(q) ||
          e.course_title?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.instructor?.toLowerCase().includes(q),
      );
    }

    // Sort chronologically (date asc, start_time asc)
    allEvents.sort((a, b) => {
      const dComp = a.date.localeCompare(b.date);
      if (dComp !== 0) return dComp;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });

    res.json({ events: allEvents });
  }),
);

// POST /api/v1/calendar/events (Create Task, Assignment, Exam, Quiz)
calendar.post(
  "/events",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        title: z.string().min(1).max(200),
        event_type: z.enum([
          "CLASS",
          "LAB",
          "QUIZ",
          "ASSIGNMENT",
          "EXAM",
          "PRESENTATION",
          "PROJECT",
          "DEADLINE",
          "PERSONAL_TASK",
          "HOLIDAY",
          "OTHER",
        ]),
        course_code: z.string().max(30).optional().nullable(),
        course_title: z.string().max(100).optional().nullable(),
        description: z.string().max(1000).optional().nullable(),
        location: z.string().max(100).optional().nullable(),
        instructor: z.string().max(100).optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Start time must be HH:MM"),
        end_time: z
          .string()
          .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "End time must be HH:MM")
          .optional()
          .nullable(),
        is_all_day: z.boolean().default(false),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        reminder_minutes: z.array(z.number().int()).default([60]),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("academic_calendar_events")
      .insert({
        user_id: userId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ event: data });
  }),
);

// PUT /api/v1/calendar/events/:id
calendar.put(
  "/events/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const body = z
      .object({
        title: z.string().optional(),
        event_type: z
          .enum([
            "CLASS",
            "LAB",
            "QUIZ",
            "ASSIGNMENT",
            "EXAM",
            "PRESENTATION",
            "PROJECT",
            "DEADLINE",
            "PERSONAL_TASK",
            "HOLIDAY",
            "OTHER",
          ])
          .optional(),
        course_code: z.string().optional().nullable(),
        course_title: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        location: z.string().optional().nullable(),
        instructor: z.string().optional().nullable(),
        date: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional().nullable(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        reminder_minutes: z.array(z.number().int()).optional(),
        is_completed: z.boolean().optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("academic_calendar_events")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ event: data });
  }),
);

// PATCH /api/v1/calendar/events/:id/toggle (Toggle completed)
calendar.patch(
  "/events/:id/toggle",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: curr } = await admin
      .from("academic_calendar_events")
      .select("is_completed")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!curr) return res.status(404).json({ error: "Event not found" });

    const { data, error } = await admin
      .from("academic_calendar_events")
      .update({
        is_completed: !curr.is_completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ event: data });
  }),
);

// DELETE /api/v1/calendar/events/:id
calendar.delete(
  "/events/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("academic_calendar_events")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;
    res.status(204).end();
  }),
);

// POST /api/v1/calendar/events/exception (Cancel class, reschedule, makeup)
calendar.post(
  "/events/exception",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        routine_entry_id: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        exception_type: z.enum(["cancelled", "rescheduled", "makeup", "extra"]),
        note: z.string().max(200).optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
      })
      .parse(req.body);

    const { data: entry } = await admin
      .from("routine_entries")
      .select("*")
      .eq("id", body.routine_entry_id)
      .single();

    if (!entry) return res.status(404).json({ error: "Routine entry not found" });

    const title =
      body.exception_type === "cancelled"
        ? `[Cancelled] ${entry.course_code}`
        : `[${body.exception_type}] ${entry.course_code}`;

    const { data, error } = await admin
      .from("academic_calendar_events")
      .insert({
        user_id: userId,
        routine_entry_id: body.routine_entry_id,
        title,
        event_type: entry.type,
        course_code: entry.course_code,
        course_title: entry.course_title,
        description: body.note || "",
        location: entry.room,
        instructor: entry.instructor,
        date: body.date,
        start_time: body.start_time || entry.start_time,
        end_time: body.end_time || entry.end_time,
        is_exception: true,
        exception_type: body.exception_type,
        original_date: body.date,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ exception: data });
  }),
);

// ── 6. Upcoming Widget / "What's Next?" ────────────────────────────────────────

// GET /api/v1/calendar/upcoming
calendar.get(
  "/upcoming",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const now = new Date();
    // Dhaka time representation
    const dhakaOffsetMinutes = 6 * 60;
    const utcMinutes = now.getTime() + now.getTimezoneOffset() * 60000;
    const dhakaDate = new Date(utcMinutes + dhakaOffsetMinutes * 60000);

    const todayStr = dhakaDate.toISOString().split("T")[0];
    const tomorrowDate = new Date(dhakaDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

    const currentH = String(dhakaDate.getHours()).padStart(2, "0");
    const currentM = String(dhakaDate.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${currentH}:${currentM}`;
    const currentMins = dhakaDate.getHours() * 60 + dhakaDate.getMinutes();

    // 1. Get user's active routine
    const { data: activeRoutine } = await admin
      .from("academic_routines")
      .select("id, title, department, semester, section")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const todayDayName = DAYS_OF_WEEK[dhakaDate.getDay()] || "Sunday";
    const tomorrowDayName = DAYS_OF_WEEK[tomorrowDate.getDay()] || "Monday";

    let todayClasses: any[] = [];
    let tomorrowClasses: any[] = [];

    if (activeRoutine) {
      const { data: entries } = await admin
        .from("routine_entries")
        .select("*")
        .eq("routine_id", activeRoutine.id);

      // Check user overrides
      const { data: overrides } = await admin
        .from("user_routine_overrides")
        .select("*")
        .eq("user_id", userId)
        .eq("routine_id", activeRoutine.id);

      const overrideMap = new Map((overrides || []).map((o) => [o.routine_entry_id, o]));

      (entries || []).forEach((e) => {
        const ov = overrideMap.get(e.id);
        if (ov?.is_hidden) return;

        const classObj = {
          id: e.id,
          courseCode: e.course_code,
          courseTitle: e.course_title,
          startTime: ov?.custom_start_time || e.start_time,
          endTime: ov?.custom_end_time || e.end_time,
          room: ov?.custom_room || e.room || "TBA",
          instructor: ov?.custom_instructor || e.instructor,
          type: e.type,
        };

        if (e.day_of_week === todayDayName) todayClasses.push(classObj);
        if (e.day_of_week === tomorrowDayName) tomorrowClasses.push(classObj);
      });

      todayClasses.sort((a, b) => a.startTime.localeCompare(b.startTime));
      tomorrowClasses.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    // Determine active class ("NOW")
    let activeClass: any = null;
    let nextClass: any = null;

    for (const c of todayClasses) {
      const sParts = c.startTime.split(":");
      const eParts = c.endTime.split(":");
      const sh = Number(sParts[0] ?? 0);
      const sm = Number(sParts[1] ?? 0);
      const eh = Number(eParts[0] ?? 0);
      const em = Number(eParts[1] ?? 0);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      if (currentMins >= startMins && currentMins < endMins) {
        activeClass = {
          ...c,
          minutesLeft: endMins - currentMins,
        };
      } else if (currentMins < startMins && !nextClass) {
        const diffMins = startMins - currentMins;
        const h = Math.floor(diffMins / 60);
        const m = diffMins % 60;
        const countdown = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
        nextClass = {
          ...c,
          countdown,
          dayLabel: "Today",
        };
      }
    }

    // If no more classes today, pick first class tomorrow
    if (!nextClass && tomorrowClasses.length > 0 && tomorrowClasses[0]) {
      nextClass = {
        ...tomorrowClasses[0],
        countdown: `Tomorrow at ${tomorrowClasses[0].startTime}`,
        dayLabel: "Tomorrow",
      };
    }

    // 2. Fetch upcoming assignments, quizzes, exams, tasks
    const { data: upcomingEvents } = await admin
      .from("academic_calendar_events")
      .select("*")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .eq("is_exception", false)
      .gte("date", todayStr)
      .order("date")
      .order("start_time")
      .limit(10);

    const assignmentsCount = (upcomingEvents || []).filter(
      (e) => e.event_type === "ASSIGNMENT" || e.event_type === "DEADLINE",
    ).length;
    const quizzesCount = (upcomingEvents || []).filter((e) => e.event_type === "QUIZ").length;
    const examsCount = (upcomingEvents || []).filter((e) => e.event_type === "EXAM").length;

    res.json({
      activeClass,
      nextClass,
      todayClasses,
      upcomingTasks: (upcomingEvents || []).slice(0, 3),
      counts: {
        assignments: assignmentsCount,
        quizzes: quizzesCount,
        exams: examsCount,
        todayClassesCount: todayClasses.length,
      },
      routine: activeRoutine,
    });
  }),
);

// ── 7. Academic Notification Preferences ──────────────────────────────────────

// GET /api/v1/calendar/preferences
calendar.get(
  "/preferences",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data } = await admin
      .from("academic_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) return res.json({ preferences: data });

    // Defaults
    const defaults = {
      user_id: userId,
      notify_classes: true,
      class_lead_minutes: 60,
      notify_assignments: true,
      assignment_lead_hours: 24,
      notify_exams: true,
      exam_lead_hours: 24,
      notify_tasks: true,
      task_lead_minutes: 30,
      smart_grouping: true,
      timezone: "Asia/Dhaka",
    };

    res.json({ preferences: defaults });
  }),
);

// PUT /api/v1/calendar/preferences
calendar.put(
  "/preferences",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z
      .object({
        notify_classes: z.boolean().optional(),
        class_lead_minutes: z.number().int().min(5).max(1440).optional(),
        notify_assignments: z.boolean().optional(),
        assignment_lead_hours: z.number().int().min(1).max(168).optional(),
        notify_exams: z.boolean().optional(),
        exam_lead_hours: z.number().int().min(1).max(168).optional(),
        notify_tasks: z.boolean().optional(),
        task_lead_minutes: z.number().int().min(5).max(1440).optional(),
        smart_grouping: z.boolean().optional(),
        timezone: z.string().optional(),
      })
      .parse(req.body);

    const { data, error } = await admin
      .from("academic_notification_preferences")
      .upsert({
        user_id: userId,
        ...body,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ preferences: data });
  }),
);
