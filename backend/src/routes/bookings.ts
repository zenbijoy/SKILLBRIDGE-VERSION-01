import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const bookings = Router();

const requestBookingSchema = z.object({
  tutor_id: z.string().uuid(),
  skill_id: z.string().uuid().optional().nullable(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  mode: z.enum(["online", "offline", "hybrid"]).default("online"),
  offline_location: z.string().max(300).optional(),
  learner_note: z.string().max(1000).optional(),
  idempotency_key: z.string().max(128).optional(),
});

const availabilityRuleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time_utc: z.string().regex(/^\d{2}:\d{2}$/),
  end_time_utc: z.string().regex(/^\d{2}:\d{2}$/),
  slot_duration_minutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]).default(60),
  buffer_minutes: z.number().int().min(0).max(60).default(15),
  mode: z.enum(["online", "offline", "hybrid"]).default("online"),
  offline_location: z.string().max(300).optional(),
  is_active: z.boolean().default(true),
});

const exceptionSchema = z.object({
  exception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time_utc: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  end_time_utc: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  is_blackout: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

// GET /api/v1/bookings/tutor/:tutorId/availability - Calculate available slots
bookings.get(
  "/tutor/:tutorId/availability",
  wrap(async (req, res) => {
    const { tutorId } = req.params;
    const { start_date, days = "7" } = req.query;

    const numDays = Math.min(30, Math.max(1, parseInt(days as string, 10) || 7));
    const baseDate = start_date ? new Date(start_date as string) : new Date();

    // 1. Fetch tutor rules
    const { data: rules, error: rulesErr } = await admin
      .from("tutor_availability_rules")
      .select("*")
      .eq("tutor_id", tutorId)
      .eq("is_active", true);

    if (rulesErr) throw rulesErr;

    // 2. Fetch exceptions
    const { data: exceptions, error: excErr } = await admin
      .from("tutor_availability_exceptions")
      .select("*")
      .eq("tutor_id", tutorId);

    if (excErr) throw excErr;

    // 3. Fetch active bookings in range
    const windowStart = new Date(baseDate);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(baseDate);
    windowEnd.setDate(windowEnd.getDate() + numDays);
    windowEnd.setHours(23, 59, 59, 999);

    const { data: existingBookings, error: bookErr } = await admin
      .from("session_bookings")
      .select("start_time, end_time, status")
      .eq("tutor_id", tutorId)
      .in("status", ["requested", "accepted", "confirmed"])
      .gte("start_time", windowStart.toISOString())
      .lte("start_time", windowEnd.toISOString());

    if (bookErr) throw bookErr;

    // Compute discrete slots
    const availableSlots: any[] = [];
    const now = new Date();

    for (let d = 0; d < numDays; d++) {
      const currentDay = new Date(baseDate);
      currentDay.setDate(currentDay.getDate() + d);
      const dateStr = currentDay.toISOString().split("T")[0];
      const dayOfWeek = currentDay.getDay();

      // Check for full day blackout exception
      const dayExceptions = (exceptions || []).filter((e) => e.exception_date === dateStr);
      const isFullDayBlackout = dayExceptions.some((e) => e.is_blackout && !e.start_time_utc);
      if (isFullDayBlackout) continue;

      // Find matching rule for this day of week
      const matchingRules = (rules || []).filter((r) => r.day_of_week === dayOfWeek);

      for (const rule of matchingRules) {
        const [startH, startM] = rule.start_time_utc.split(":").map(Number);
        const [endH, endM] = rule.end_time_utc.split(":").map(Number);

        let slotStart = new Date(currentDay);
        slotStart.setUTCHours(startH, startM, 0, 0);

        const ruleEnd = new Date(currentDay);
        ruleEnd.setUTCHours(endH, endM, 0, 0);

        while (slotStart.getTime() + rule.slot_duration_minutes * 60 * 1000 <= ruleEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + rule.slot_duration_minutes * 60 * 1000);

          // Must be in the future (minimum 1 hour notice)
          if (slotStart.getTime() > now.getTime() + 60 * 60 * 1000) {
            // Check against existing bookings
            const isConflicting = (existingBookings || []).some((eb) => {
              const bStart = new Date(eb.start_time).getTime();
              const bEnd = new Date(eb.end_time).getTime();
              return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
            });

            if (!isConflicting) {
              availableSlots.push({
                tutor_id: tutorId,
                date: dateStr,
                start_time: slotStart.toISOString(),
                end_time: slotEnd.toISOString(),
                duration_minutes: rule.slot_duration_minutes,
                mode: rule.mode,
                offline_location: rule.offline_location,
              });
            }
          }

          // Advance by slot duration + buffer
          slotStart = new Date(slotEnd.getTime() + (rule.buffer_minutes || 0) * 60 * 1000);
        }
      }
    }

    res.json({
      tutor_id: tutorId,
      total_slots: availableSlots.length,
      slots: availableSlots,
    });
  }),
);

// GET /api/v1/bookings/my - User's bookings
bookings.get(
  "/my",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { role = "all", status } = req.query;

    let query = admin
      .from("session_bookings")
      .select("*, skill:skills(id, name), tutor:profiles!session_bookings_tutor_id_fkey(id, full_name, avatar_url, roles), learner:profiles!session_bookings_learner_id_fkey(id, full_name, avatar_url, roles)")
      .order("start_time", { ascending: false });

    if (role === "tutor") {
      query = query.eq("tutor_id", userId);
    } else if (role === "learner") {
      query = query.eq("learner_id", userId);
    } else {
      query = query.or(`learner_id.eq.${userId},tutor_id.eq.${userId}`);
    }

    if (status && typeof status === "string") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ bookings: data ?? [] });
  }),
);

// GET /api/v1/bookings/:id - Booking details
bookings.get(
  "/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data: booking, error } = await admin
      .from("session_bookings")
      .select("*, skill:skills(id, name), tutor:profiles!session_bookings_tutor_id_fkey(id, full_name, avatar_url, email), learner:profiles!session_bookings_learner_id_fkey(id, full_name, avatar_url, email), history:booking_status_history(*, changed_by:profiles(id, full_name))")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (booking.learner_id !== userId && booking.tutor_id !== userId) {
      return res.status(403).json({ error: "Unauthorized access to booking" });
    }

    res.json({ booking });
  }),
);

// POST /api/v1/bookings - Request a booking (Atomic RPC)
bookings.post(
  "/",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = requestBookingSchema.parse(req.body);

    const idempotencyKey = body.idempotency_key || `booking-${userId}-${body.tutor_id}-${body.start_time}`;

    const { data, error } = await admin.rpc("request_session_booking_atomic", {
      p_learner_id: userId,
      p_tutor_id: body.tutor_id,
      p_skill_id: body.skill_id ?? null,
      p_start_time: body.start_time,
      p_end_time: body.end_time,
      p_mode: body.mode,
      p_note: body.learner_note ?? null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data);
  }),
);

// POST /api/v1/bookings/:id/status - Update status (Accept, Decline, Cancel)
bookings.post(
  "/:id/status",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { status, note, reason } = req.body || {};

    if (!["accepted", "confirmed", "declined", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status transition" });
    }

    const { data, error } = await admin.rpc("update_booking_status_atomic", {
      p_booking_id: id,
      p_user_id: userId,
      p_new_status: status,
      p_note: note ?? null,
      p_reason: reason ?? null,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  }),
);

// POST /api/v1/bookings/:id/complete - Mark session complete
bookings.post(
  "/:id/complete",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { data, error } = await admin.rpc("complete_booking_atomic", {
      p_booking_id: id,
      p_user_id: userId,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  }),
);

// GET /api/v1/bookings/tutor/rules - Tutor availability settings
bookings.get(
  "/tutor/rules",
  wrap(async (req, res) => {
    const userId = req.userId!;

    const { data: rules, error: rErr } = await admin
      .from("tutor_availability_rules")
      .select("*")
      .eq("tutor_id", userId)
      .order("day_of_week", { ascending: true });

    if (rErr) throw rErr;

    const { data: exceptions, error: eErr } = await admin
      .from("tutor_availability_exceptions")
      .select("*")
      .eq("tutor_id", userId)
      .order("exception_date", { ascending: true });

    if (eErr) throw eErr;

    res.json({
      rules: rules ?? [],
      exceptions: exceptions ?? [],
    });
  }),
);

// POST /api/v1/bookings/tutor/rules - Save availability rules
bookings.post(
  "/tutor/rules",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = z.array(availabilityRuleSchema).parse(req.body);

    // Delete existing rules and insert new ones
    await admin
      .from("tutor_availability_rules")
      .delete()
      .eq("tutor_id", userId);

    if (body.length > 0) {
      const rows = body.map((r) => ({
        tutor_id: userId,
        ...r,
      }));

      const { data, error } = await admin
        .from("tutor_availability_rules")
        .insert(rows)
        .select();

      if (error) throw error;
      return res.json({ rules: data });
    }

    res.json({ rules: [] });
  }),
);

// POST /api/v1/bookings/tutor/exceptions - Add blackout exception
bookings.post(
  "/tutor/exceptions",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const body = exceptionSchema.parse(req.body);

    const { data, error } = await admin
      .from("tutor_availability_exceptions")
      .insert({
        tutor_id: userId,
        ...body,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ exception: data });
  }),
);

// DELETE /api/v1/bookings/tutor/exceptions/:id - Remove exception
bookings.delete(
  "/tutor/exceptions/:id",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await admin
      .from("tutor_availability_exceptions")
      .delete()
      .eq("id", id)
      .eq("tutor_id", userId);

    if (error) throw error;

    res.json({ success: true });
  }),
);
