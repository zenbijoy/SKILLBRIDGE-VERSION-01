import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { NotificationService } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";

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
  is_custom_proposal: z.boolean().optional(),
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

// GET /api/v1/bookings/tutors - Discover peer tutors with search & filter
bookings.get(
  "/tutors",
  wrap(async (req, res) => {
    const { q, query, skill_id, department } = req.query;
    const searchTerm = (typeof q === "string" ? q : typeof query === "string" ? query : "").trim().toLowerCase();
    const departmentFilter = typeof department === "string" ? department.trim().toLowerCase() : "";
    const skillFilter = typeof skill_id === "string" ? skill_id.trim() : "";

    let profilesQuery = admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, university, department, headline, roles, reputation")
      .limit(60);

    const { data: profiles, error } = await profilesQuery;
    if (error) throw error;

    const tutorProfiles = Array.isArray(profiles) ? profiles : profiles ? [profiles] : [];
    const tutorIds = tutorProfiles.map((p) => p.id);
    const reviewsByReviewee: Record<string, { total: number; count: number }> = {};
    const skillsByTutor: Record<string, Array<{ id: string; name: string }>> = {};

    if (tutorIds.length > 0) {
      const [reviewsRes, userSkillsRes] = await Promise.all([
        admin.from("reviews").select("reviewee_id, rating").in("reviewee_id", tutorIds),
        admin.from("user_skills").select("user_id, skill:skills(id, name)").in("user_id", tutorIds),
      ]);

      if (reviewsRes.data) {
        for (const rev of reviewsRes.data) {
          const existing = reviewsByReviewee[rev.reviewee_id] ?? { total: 0, count: 0 };
          existing.total += rev.rating;
          existing.count += 1;
          reviewsByReviewee[rev.reviewee_id] = existing;
        }
      }

      if (userSkillsRes.data) {
        for (const item of userSkillsRes.data as any[]) {
          if (item?.user_id && item?.skill) {
            const list = skillsByTutor[item.user_id] ?? [];
            list.push({ id: item.skill.id, name: item.skill.name });
            skillsByTutor[item.user_id] = list;
          }
        }
      }
    }

    let tutors = tutorProfiles.map((p) => {
      const stats = reviewsByReviewee[p.id];
      const reviewsCount = stats ? stats.count : 0;
      const rating = stats && stats.count > 0 ? Number((stats.total / stats.count).toFixed(1)) : null;
      const tutorSkills = skillsByTutor[p.id] ?? [];
      const hasTutorRole = (p.roles || []).includes("tutor") || (p.roles || []).includes("peer_tutor");

      return {
        ...p,
        is_tutor: hasTutorRole || (p.roles || []).includes("student"),
        rating,
        reviewsCount,
        skills: tutorSkills,
      };
    });

    // Apply filters
    if (departmentFilter) {
      tutors = tutors.filter((t) => t.department?.toLowerCase().includes(departmentFilter));
    }

    if (skillFilter) {
      tutors = tutors.filter((t) => t.skills.some((s) => s.id === skillFilter || s.name.toLowerCase().includes(skillFilter.toLowerCase())));
    }

    if (searchTerm) {
      tutors = tutors.filter((t) => {
        const matchesName = t.full_name?.toLowerCase().includes(searchTerm);
        const matchesUser = t.username?.toLowerCase().includes(searchTerm);
        const matchesHead = t.headline?.toLowerCase().includes(searchTerm);
        const matchesDept = t.department?.toLowerCase().includes(searchTerm);
        const matchesUni = t.university?.toLowerCase().includes(searchTerm);
        const matchesSkill = t.skills.some((s) => s.name.toLowerCase().includes(searchTerm));
        return Boolean(matchesName || matchesUser || matchesHead || matchesDept || matchesUni || matchesSkill);
      });
    }

    // Sort: Verified tutors first, then highest rating / reputation
    tutors.sort((a, b) => {
      const aIsTutor = (a.roles || []).includes("tutor") || (a.roles || []).includes("peer_tutor") ? 1 : 0;
      const bIsTutor = (b.roles || []).includes("tutor") || (b.roles || []).includes("peer_tutor") ? 1 : 0;
      if (bIsTutor !== aIsTutor) return bIsTutor - aIsTutor;
      return (b.rating || b.reputation || 0) - (a.rating || a.reputation || 0);
    });

    res.json({ tutors });
  }),
);

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
    const hasCustomRules = Boolean(rules && rules.length > 0);
    const activeRules = hasCustomRules
      ? rules
      : [
          // Mon - Fri default afternoon / evening hours (14:00 - 18:00 UTC)
          { day_of_week: 1, start_time_utc: "14:00", end_time_utc: "18:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          { day_of_week: 2, start_time_utc: "14:00", end_time_utc: "18:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          { day_of_week: 3, start_time_utc: "14:00", end_time_utc: "18:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          { day_of_week: 4, start_time_utc: "14:00", end_time_utc: "18:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          { day_of_week: 5, start_time_utc: "14:00", end_time_utc: "18:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          // Sat - Sun weekend hours (11:00 - 16:00 UTC)
          { day_of_week: 6, start_time_utc: "11:00", end_time_utc: "16:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
          { day_of_week: 0, start_time_utc: "11:00", end_time_utc: "16:00", slot_duration_minutes: 60, buffer_minutes: 15, mode: "online" },
        ];

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
      const matchingRules = (activeRules || []).filter((r: any) => r.day_of_week === dayOfWeek);

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
      has_custom_rules: hasCustomRules,
      supports_custom_booking: true,
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

    const bookingId = (data as any)?.booking_id || (data as any)?.id || "";
    // Notify tutor asynchronously
    void (async () => {
      try {
        const { data: learnerProfile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle();

        const learnerName = learnerProfile?.full_name || "A student";
        await NotificationService.dispatch({
          userId: body.tutor_id,
          type: "BOOKING_REQUESTED",
          title: "New Tutoring Request 📅",
          body: `${learnerName} requested a session with you on ${new Date(body.start_time).toLocaleString()}.`,
          entityType: "booking",
          entityId: bookingId,
          data: { bookingId, startTime: body.start_time, mode: body.mode, url: "/schedule" },
        });
      } catch (notifErr) {
        logger.warn({ err: (notifErr as Error).message, tutorId: body.tutor_id }, "Failed dispatching booking requested notification");
      }
    })();

    res.status(201).json(data);
  }),
);

// POST /api/v1/bookings/:id/status - Update status (Accept, Decline, Cancel)
bookings.post(
  "/:id/status",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const id = String(req.params.id);
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

    // Asynchronous notification and 1:1 room provisioning
    void (async () => {
      try {
        const { data: bookingRecord } = await admin
          .from("session_bookings")
          .select("id, tutor_id, learner_id, start_time, mode, room_id, learner_note")
          .eq("id", id)
          .maybeSingle();

        if (bookingRecord) {
          const isConfirmed = status === "accepted" || status === "confirmed";

          // Auto-provision private 1:1 room if not already attached
          if (isConfirmed && !bookingRecord.room_id) {
            try {
              const { data: newRoom, error: rErr } = await admin
                .from("rooms")
                .insert({
                  owner_id: bookingRecord.tutor_id,
                  title: "1:1 Tutoring Session",
                  description: bookingRecord.learner_note || "SkillBridge 1:1 Peer Tutoring Room",
                  topic: "Peer Tutoring",
                  tags: ["tutoring", "1-on-1"],
                  visibility: "private",
                  mode: bookingRecord.mode || "online",
                  capacity: 2,
                  scheduled_at: bookingRecord.start_time,
                  status: "scheduled",
                })
                .select("id")
                .single();

              if (!rErr && newRoom) {
                await admin
                  .from("session_bookings")
                  .update({ room_id: newRoom.id })
                  .eq("id", id);

                await admin
                  .from("room_members")
                  .upsert([
                    { room_id: newRoom.id, user_id: bookingRecord.tutor_id, role: "teacher" },
                    { room_id: newRoom.id, user_id: bookingRecord.learner_id, role: "member" },
                  ], { onConflict: "room_id,user_id" });
              }
            } catch (roomErr) {
              logger.warn({ err: (roomErr as Error).message, bookingId: id }, "Could not auto-provision room for booking");
            }
          }

          const recipientId = userId === bookingRecord.tutor_id ? bookingRecord.learner_id : bookingRecord.tutor_id;
          const notifType = isConfirmed ? "BOOKING_CONFIRMED" : "BOOKING_CANCELLED";
          const notifTitle = isConfirmed ? "Session Confirmed! ✅" : `Session Update: ${status}`;
          const notifBody = isConfirmed
            ? `Your session scheduled for ${new Date(bookingRecord.start_time).toLocaleString()} is confirmed!`
            : `Your tutoring booking was updated to ${status}.`;

          await NotificationService.dispatch({
            userId: recipientId,
            type: notifType,
            title: notifTitle,
            body: notifBody,
            entityType: "booking",
            entityId: id,
            data: { bookingId: id, status, url: "/schedule" },
          });
        }
      } catch (notifErr) {
        logger.warn({ err: (notifErr as Error).message, bookingId: id }, "Failed dispatching booking status notification");
      }
    })();

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

// POST /api/v1/bookings/:id/review - Submit rating & review for completed session
bookings.post(
  "/:id/review",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const body = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }).parse(req.body);

    // Call atomic RPC
    const { data: rpcData, error: rpcError } = await admin.rpc("submit_booking_review_atomic", {
      p_booking_id: id,
      p_reviewer_id: userId,
      p_rating: body.rating,
      p_comment: body.comment ?? null,
    });

    if (rpcError) {
      // Fallback: verify booking and write to reviews table directly
      const { data: booking, error: bErr } = await admin
        .from("session_bookings")
        .select("id, learner_id, tutor_id, status")
        .eq("id", id)
        .maybeSingle();

      if (bErr || !booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.learner_id !== userId) return res.status(403).json({ error: "Only the learner can review this session" });
      if (booking.status !== "completed") return res.status(400).json({ error: "Can only review completed sessions" });

      const { data: newReview, error: revErr } = await admin
        .from("reviews")
        .insert({
          booking_id: id,
          reviewer_id: userId,
          reviewee_id: booking.tutor_id,
          rating: body.rating,
          comment: body.comment ?? null,
        })
        .select()
        .single();

      if (revErr) {
        return res.status(400).json({ error: revErr.message });
      }

      if (body.rating >= 4) {
        const bonus = body.rating === 5 ? 10 : 5;
        await admin.from("points_ledger").insert({
          user_id: booking.tutor_id,
          points: bonus,
          action: `tutor_rating_bonus:${id}`,
          reference_id: id,
        });
      }

      return res.status(201).json({ success: true, review: newReview });
    }

    res.status(201).json(rpcData);
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
