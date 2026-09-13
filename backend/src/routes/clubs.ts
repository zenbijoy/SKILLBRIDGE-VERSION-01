import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { NotificationService } from "../services/notificationService.js";
import { negotiationLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";

export const clubs = Router();
clubs.get(
  "/",
  wrap(async (_req, res) => {
    const { data, error } = await admin
      .from("clubs")
      .select("*")
      .order("verified", { ascending: false })
      .order("name");
    if (error) throw error;
    res.json({ clubs: data ?? [] });
  }),
);
clubs.get(
  "/mine",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("club_members")
      .select("role,clubs(*)")
      .eq("user_id", req.userId!);
    if (error) throw error;
    res.json({ memberships: data ?? [] });
  }),
);
clubs.post(
  "/",
  wrap(async (req, res) => {
    const b = z
      .object({
        name: z.string().min(3).max(120),
        description: z.string().max(2000).optional(),
        university: z.string().max(150).optional(),
      })
      .parse(req.body);
    const { data: clubId, error } = await admin.rpc("create_club_atomic", {
      p_name: b.name,
      p_description: b.description ?? "",
      p_university: b.university ?? "",
      p_owner_id: req.userId!
    });
    if (error) throw error;
    
    const { data } = await admin
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();
      
    res.status(201).json(data);
  }),
);
clubs.post(
  "/:id/members/:userId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const userId = z.string().uuid().parse(req.params.userId);
    const { role } = z
      .object({ role: z.enum(["admin", "member"]) })
      .parse(req.body);
    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!me || !["owner", "admin"].includes(me.role))
      return res.status(403).json({ error: "Club admin required" });
    const { data, error } = await admin
      .from("club_members")
      .upsert(
        { club_id: clubId, user_id: userId, role },
        { onConflict: "club_id,user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

// Get Club Broadcasts
clubs.get(
  "/:id/broadcasts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const { data: broadcasts, error } = await admin
      .from("events")
      .select("*")
      .eq("club_id", clubId)
      .order("starts_at", { ascending: true });

    if (error) throw error;
    res.json({
      broadcasts: (broadcasts || []).map((b) => ({
        id: b.id,
        clubId: b.club_id,
        title: b.title,
        description: b.description,
        youtubeVideoId: (b.metadata as any)?.youtube_video_id || "dQw4w9WgXcQ",
        scheduledStart: b.starts_at,
        status: b.status,
      })),
    });
  }),
);

// Create Club YouTube Broadcast
clubs.post(
  "/:id/broadcasts",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(200),
        description: z.string().max(2000).optional(),
        youtubeVideoId: z.string().min(5).max(100),
        scheduledStart: z.string().datetime(),
      })
      .parse(req.body);

    const { data: me } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Club admin required to schedule broadcasts" });
    }

    const { data, error } = await admin
      .from("events")
      .insert({
        club_id: clubId,
        title: body.title,
        description: body.description ?? "",
        starts_at: body.scheduledStart,
        status: "scheduled",
        metadata: {
          youtube_video_id: body.youtubeVideoId,
          is_broadcast: true,
        },
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      broadcast: {
        id: data.id,
        clubId: data.club_id,
        title: data.title,
        description: data.description,
        youtubeVideoId: body.youtubeVideoId,
        scheduledStart: data.starts_at,
        status: data.status,
      },
    });
  }),
);

// -----------------------------------------------------------------------------
// 4-SIGNAL CROSS-CLUB CLASH DETECTION ENGINE
// -----------------------------------------------------------------------------

clubs.get(
  "/:id/clashes",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const startsAt = z.string().datetime().parse(req.query.startsAt);
    const endsAt = z.string().datetime().parse(req.query.endsAt);
    const location = (req.query.location as string | undefined)?.trim();

    // 1. Get total members in this club
    const { data: myMembers, count: totalMyMembers } = await admin
      .from("club_members")
      .select("user_id", { count: "exact" })
      .eq("club_id", clubId);

    const myMemberIds = new Set((myMembers ?? []).map((m) => m.user_id));
    const totalCount = totalMyMembers || 1;

    // 2. Query conflicting events from other clubs
    const { data: otherEvents } = await admin
      .from("events")
      .select(`
        id, title, starts_at, ends_at, location, club_id,
        club:clubs!events_club_id_fkey(id, name, university)
      `)
      .neq("club_id", clubId)
      .neq("status", "cancelled")
      .lte("starts_at", endsAt)
      .gte("ends_at", startsAt);

    const clashes = [];

    for (const evt of otherEvents ?? []) {
      if (!evt.club_id) continue;

      // Check common members
      const { data: otherClubMembers } = await admin
        .from("club_members")
        .select("user_id")
        .eq("club_id", evt.club_id);

      let commonCount = 0;
      for (const m of otherClubMembers ?? []) {
        if (myMemberIds.has(m.user_id)) commonCount++;
      }

      const overlapPct = Number(((commonCount / totalCount) * 100).toFixed(1));

      // Signal 3: Venue Collision
      const venueCollision = Boolean(location && evt.location && location.toLowerCase() === evt.location.toLowerCase());

      // Signal 4: Academic Exam Indicator
      const isAcademicConflict = evt.title.toLowerCase().includes("exam") || evt.title.toLowerCase().includes("midterm") || evt.title.toLowerCase().includes("final");

      // Compute severity
      let severity: "low" | "warning" | "critical" = "low";
      if (venueCollision || overlapPct >= 40 || (isAcademicConflict && commonCount > 0)) {
        severity = "critical";
      } else if (overlapPct >= 15 || commonCount >= 10) {
        severity = "warning";
      }

      if (commonCount > 0 || venueCollision) {
        clashes.push({
          target_event_id: evt.id,
          target_event_title: evt.title,
          target_club_id: evt.club_id,
          target_club_name: (evt.club as any)?.name || "Other Club",
          starts_at: evt.starts_at,
          ends_at: evt.ends_at,
          signals: {
            member_overlap_count: commonCount,
            member_overlap_percentage: overlapPct,
            venue_collision: venueCollision,
            academic_conflict: isAcademicConflict,
          },
          severity,
        });
      }
    }

    res.json({
      total_clashes: clashes.length,
      has_critical_clash: clashes.some((c) => c.severity === "critical"),
      clashes: clashes.sort((a, b) => b.signals.member_overlap_percentage - a.signals.member_overlap_percentage),
    });
  }),
);

// -----------------------------------------------------------------------------
// INTER-CLUB NEGOTIATION STATE MACHINE
// -----------------------------------------------------------------------------

// POST /api/v1/clubs/:id/negotiations - Initiate a reschedule proposal
clubs.post(
  "/:id/negotiations",
  negotiationLimiter,
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        initiatorEventId: z.string().uuid(),
        targetClubId: z.string().uuid(),
        targetEventId: z.string().uuid(),
        proposedNewTime: z.string().datetime(),
        note: z.string().max(500).optional().default(""),
        overlapCount: z.number().int().nonnegative().default(0),
        overlapPercentage: z.number().nonnegative().default(0),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required to initiate negotiations" });
    }

    const { data, error } = await admin
      .from("club_clash_negotiations")
      .insert({
        initiator_club_id: clubId,
        initiator_event_id: body.initiatorEventId,
        target_club_id: body.targetClubId,
        target_event_id: body.targetEventId,
        proposed_new_time: body.proposedNewTime,
        note: body.note,
        overlap_member_count: body.overlapCount,
        overlap_percentage: body.overlapPercentage,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    // Notify target club officers of the reschedule proposal
    void (async () => {
      try {
        const { data: targetAdmins } = await admin
          .from("club_members")
          .select("user_id")
          .eq("club_id", body.targetClubId)
          .in("role", ["owner", "admin"]);

        for (const adm of targetAdmins ?? []) {
          void NotificationService.dispatch({
            userId: adm.user_id,
            type: "NEGOTIATION_RECEIVED",
            title: "Schedule Clash Proposal",
            body: "Another club proposed rescheduling an event to resolve a mutual clash.",
            priority: "high",
            entityType: "event",
            entityId: body.targetEventId,
            data: { clubId: body.targetClubId, negotiationId: data.id, route: "club" },
          });
        }
      } catch {}
    })();

    logDomainEvent({
      event: "negotiation_created",
      negotiationId: data.id,
      initiatorClubId: clubId,
      targetClubId: body.targetClubId,
    });

    res.status(201).json({ negotiation: data });
  }),
);

// PATCH /api/v1/clubs/:id/negotiations/:negId - Respond to proposal
clubs.patch(
  "/:id/negotiations/:negId",
  wrap(async (req, res) => {
    const clubId = z.string().uuid().parse(req.params.id);
    const negId = z.string().uuid().parse(req.params.negId);
    const body = z
      .object({
        action: z.enum(["accept", "reject", "counter"]),
        counterTime: z.string().datetime().optional(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Club admin role required to respond to negotiations" });
    }

    const { data: neg } = await admin
      .from("club_clash_negotiations")
      .select("*")
      .eq("id", negId)
      .single();

    if (!neg) return res.status(404).json({ error: "Negotiation not found" });

    // State Machine Guard: Cannot modify finalized proposals
    if (["accepted", "rejected", "cancelled", "expired"].includes(neg.status)) {
      return res.status(400).json({ error: `Cannot modify negotiation with final status '${neg.status}'` });
    }

    // Party Authorization: Only target club or initiator can respond
    const isTarget = neg.target_club_id === clubId;
    const isInitiator = neg.initiator_club_id === clubId;

    if (!isTarget && !isInitiator) {
      return res.status(403).json({ error: "Only clubs party to this negotiation can respond" });
    }

    let newStatus: string = neg.status;

    if (body.action === "accept") {
      newStatus = "accepted";
      // Atomic Event Shift: Update scheduled start time
      await admin
        .from("events")
        .update({ starts_at: neg.proposed_new_time })
        .eq("id", neg.initiator_event_id);
    } else if (body.action === "reject") {
      newStatus = "rejected";
    } else if (body.action === "counter") {
      newStatus = "countered";
      if (body.counterTime) {
        await admin
          .from("club_clash_negotiations")
          .update({ proposed_new_time: body.counterTime })
          .eq("id", negId);
      }
    }

    const { data: updated, error } = await admin
      .from("club_clash_negotiations")
      .update({
        status: newStatus,
        resolved_by: req.userId!,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", negId)
      .select()
      .single();

    if (error) throw error;

    // Notify the other club's officers of the response
    const otherClubId = isTarget ? neg.initiator_club_id : neg.target_club_id;
    void (async () => {
      try {
        const { data: otherAdmins } = await admin
          .from("club_members")
          .select("user_id")
          .eq("club_id", otherClubId)
          .in("role", ["owner", "admin"]);

        const notifType =
          body.action === "accept"
            ? "NEGOTIATION_ACCEPTED"
            : body.action === "counter"
              ? "NEGOTIATION_COUNTERED"
              : "NEGOTIATION_REJECTED";
        const notifTitle =
          body.action === "accept"
            ? "Clash Proposal Accepted! 🎉"
            : body.action === "counter"
              ? "Clash Proposal Countered"
              : "Clash Proposal Declined";

        for (const adm of otherAdmins ?? []) {
          void NotificationService.dispatch({
            userId: adm.user_id,
            type: notifType,
            title: notifTitle,
            body: `The other club marked the clash negotiation as ${newStatus}.`,
            priority: body.action === "accept" ? "high" : "normal",
            entityType: "event",
            entityId: neg.target_event_id,
            data: { clubId: otherClubId, negotiationId: negId, route: "club" },
          });
        }
      } catch {}
    })();

    if (body.action === "accept") {
      logDomainEvent({
        event: "negotiation_accepted",
        negotiationId: negId,
        initiatorClubId: neg.initiator_club_id,
        targetClubId: neg.target_club_id,
        resolutionType: neg.resolution_type,
      });
    }

    res.json({ negotiation: updated });
  }),
);

