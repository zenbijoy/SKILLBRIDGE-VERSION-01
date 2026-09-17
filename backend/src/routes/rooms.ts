import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { notifyUser } from "../services/push.js";
import { env } from "../config/env.js";
import { cacheGet, cacheSet, redis, cacheDelPattern } from "../lib/redis.js";
import { NotificationService } from "../services/notificationService.js";
import { qaQuestionLimiter, qaAnswerLimiter, recordingLimiter } from "../middleware/rateLimiters.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import {
  extractYouTubeVideoId,
  fetchYouTubeVideoMetadata,
  getYouTubeWatchUrl,
} from "../services/youtubeService.js";
import { enqueueJob } from "../services/jobQueue.js";

export const rooms = Router();

const createSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
    description: z.string().max(1000).optional().default(""),
    topic: z.string().trim().min(2, "Topic must be at least 2 characters").max(100),
    visibility: z.enum(["public", "private", "invite_only"]).default("public"),
    mode: z.enum(["online", "offline", "hybrid"]).default("online"),
    capacity: z.number().int().min(2).max(env.MAX_ROOM_CAPACITY).default(30),
    tags: z.array(z.string().max(40)).max(10).default([]),
    rules: z.string().max(1000).optional().default(""),
    campus_location: z.string().max(200).optional().nullable(),
  })
  .refine(
    (data) => data.mode === "online" || (Boolean(data.campus_location) && data.campus_location!.trim().length > 0),
    {
      message: "Campus location is required for offline or hybrid learning rooms",
      path: ["campus_location"],
    },
  );

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Invalidate room list cache
async function invalidateRoomCache() {
  await cacheDelPattern("rooms:public:*");
}

rooms.get(
  "/",
  wrap(async (req, res) => {
    const page = pageSchema.parse(req.query.page ?? 1);
    const limit = limitSchema.parse(req.query.limit ?? 20);
    const cacheKey = `rooms:public:p${page}:l${limit}`;

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return res.json(cached);

    const from = (page - 1) * limit;
    const to = page * limit - 1;

    const { data, count, error } = await admin
      .from("rooms")
      .select("*", { count: "exact" })
      .in("status", ["open", "scheduled", "live"])
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const result = {
      rooms: data ?? [],
      total: count ?? 0,
      page,
      limit,
    };
    await cacheSet(cacheKey, result, 30);
    res.json(result);
  }),
);

rooms.post(
  "/",
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const resolvedDescription = body.description?.trim() || `Peer study and collaboration room for ${body.topic.trim()}`;
    const sanitizedLocation = body.mode === "online" ? null : (body.campus_location?.trim() || null);

    const { data: v_room_id, error } = await admin.rpc("create_room_atomic", {
      p_title: body.title.trim(),
      p_description: resolvedDescription,
      p_topic: body.topic.trim(),
      p_visibility: body.visibility,
      p_mode: body.mode,
      p_capacity: body.capacity,
      p_tags: body.tags,
      p_rules: body.rules ?? "",
      p_campus_location: sanitizedLocation,
      p_owner_id: req.userId!,
    });
    if (error) throw error;

    await invalidateRoomCache();

    const { data: room, error: fetchErr } = await admin
      .from("rooms")
      .select("*")
      .eq("id", v_room_id)
      .single();
    if (fetchErr) throw fetchErr;
    res.status(201).json(room);
  }),
);

rooms.get(
  "/invitations/received",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("room_invitations")
      .select("*, room:rooms(title), inviter:profiles!room_invitations_inviter_id_fkey(username, full_name, avatar_url)")
      .eq("invitee_id", req.userId!)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  })
);

rooms.get(
  "/invitations/sent",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("room_invitations")
      .select("*, room:rooms(title), invitee:profiles!room_invitations_invitee_id_fkey(username, full_name, avatar_url)")
      .eq("inviter_id", req.userId!)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  })
);

rooms.post(
  "/invitations/:id/accept",
  wrap(async (req, res) => {
    const inviteId = z.string().uuid().parse(req.params.id);
    const { data: invite } = await admin
      .from("room_invitations")
      .select("room_id, invitee_id")
      .eq("id", inviteId)
      .eq("status", "pending")
      .single();
    if (!invite || invite.invitee_id !== req.userId) {
      return res.status(404).json({ error: "Invitation not found or invalid" });
    }
    const { data: rpcData, error: rpcError } = await admin.rpc("join_room_service_atomic", {
      p_room_id: invite.room_id,
      p_user_id: req.userId!,
    });
    if (rpcError) throw rpcError;
    await invalidateRoomCache();
    res.json({ joined: true, room_id: invite.room_id });
  })
);

rooms.post(
  "/invitations/:id/decline",
  wrap(async (req, res) => {
    const inviteId = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("room_invitations")
      .update({ status: "declined" })
      .eq("id", inviteId)
      .eq("invitee_id", req.userId!);
    if (error) throw error;
    res.json({ success: true });
  })
);

rooms.post(
  "/invitations/:id/revoke",
  wrap(async (req, res) => {
    const inviteId = z.string().uuid().parse(req.params.id);
    const { error } = await admin
      .from("room_invitations")
      .delete()
      .eq("id", inviteId)
      .eq("inviter_id", req.userId!);
    if (error) throw error;
    res.json({ success: true });
  })
);

rooms.get(
  "/:id",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { data: room, error } = await admin
      .from("rooms")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    const [
      { data: membership },
      { data: members },
      { data: teach },
      { data: sessions },
      { data: resources },
    ] = await Promise.all([
      admin
        .from("room_members")
        .select("role, user_id")
        .eq("room_id", id)
        .eq("user_id", req.userId!)
        .maybeSingle(),
      admin
        .from("room_members")
        .select("role, profiles(id, full_name, username, avatar_url, reputation)")
        .eq("room_id", id)
        .limit(100),
      admin
        .from("teaching_requests")
        .select(
          "id,status,note,created_at,volunteer:profiles!teaching_requests_volunteer_id_fkey(id, full_name, username, avatar_url)",
        )
        .eq("room_id", id),
      admin.from("sessions").select("*").eq("room_id", id).order("starts_at"),
      admin.from("resources").select("id,title,url,kind,created_at").eq("room_id", id),
    ]);
    if (room.visibility !== "public" && !membership)
      return res.status(403).json({ error: "Room is private" });

    const normalizedMembers = (members ?? []).map((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id: p?.id ?? m.user_id,
        user_id: m.user_id ?? p?.id,
        role: m.role,
        full_name: p?.full_name ?? "Member",
        username: p?.username ?? "user",
        avatar_url: p?.avatar_url ?? null,
        reputation: p?.reputation ?? 0,
      };
    });

    res.json({
      room,
      membership,
      members: normalizedMembers,
      teachingRequests: teach ?? [],
      sessions: sessions ?? [],
      resources: resources ?? [],
    });
  }),
);

rooms.post(
  "/:id/teach",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { note } = z
      .object({ note: z.string().max(500).default("") })
      .parse(req.body);
    const { data: m } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", id)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!m) return res.status(403).json({ error: "Must join room first" });
    const { data, error } = await admin
      .from("teaching_requests")
      .upsert(
        { room_id: id, volunteer_id: req.userId!, note, status: "pending" },
        { onConflict: "room_id,volunteer_id" },
      )
      .select()
      .single();
    if (error) throw error;
    const { data: room } = await admin
      .from("rooms")
      .select("owner_id,title")
      .eq("id", id)
      .single();
    if (room)
      await notifyUser(
        room.owner_id,
        "New teaching volunteer",
        `A member volunteered to teach in ${room.title}.`,
        "room",
        { roomId: id },
      );
    res.status(201).json(data);
  }),
);

rooms.patch(
  "/:id/teach/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    const { status } = z
      .object({ status: z.enum(["accepted", "rejected"]) })
      .parse(req.body);
    const { data: room } = await admin
      .from("rooms")
      .select("owner_id")
      .eq("id", roomId)
      .single();
    if (room?.owner_id !== req.userId)
      return res.status(403).json({ error: "Only room owner can decide" });
    if (status === "accepted") {
      const { error } = await admin.rpc("accept_teaching_request", {
        p_room_id: roomId,
        p_request_id: requestId,
      });
      if (error) throw error;
      res.json({ status: "accepted" });
    } else {
      const { error } = await admin
        .from("teaching_requests")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      res.json({ status: "rejected" });
    }
  }),
);

rooms.delete(
  "/:id/teach/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    
    const { data: request } = await admin
      .from("teaching_requests")
      .select("volunteer_id, status")
      .eq("id", requestId)
      .eq("room_id", roomId)
      .single();
      
    if (!request) return res.status(404).json({ error: "Request not found" });
    
    if (request.volunteer_id !== req.userId) {
      const { data: room } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", roomId)
        .single();
      if (room?.owner_id !== req.userId) {
         return res.status(403).json({ error: "Not authorized to cancel this request" });
      }
    }
    
    const { error } = await admin
      .from("teaching_requests")
      .delete()
      .eq("id", requestId);
      
    if (error) throw error;
    res.status(204).end();
  }),
);

// Room Invitations: Create Invitation
rooms.post(
  "/:id/invitations",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { username } = z.object({ username: z.string().min(1) }).parse(req.body);

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    const invitee_id = profile.id;

    if (invitee_id === req.userId!) {
      return res.status(400).json({ error: "Cannot invite yourself" });
    }

    // Verify caller is owner or moderator
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room hosts or moderators can invite members" });
    }

    // Verify invitee is not already a member
    const { data: existingMember } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", invitee_id)
      .maybeSingle();

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this room" });
    }

    const { data: invite, error } = await admin
      .from("room_invitations")
      .insert({
        room_id: roomId,
        inviter_id: req.userId!,
        invitee_id,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    const { data: room } = await admin.from("rooms").select("title").eq("id", roomId).single();
    await notifyUser(
      invitee_id,
      "Room Invitation",
      `You were invited to join "${room?.title || "a study room"}".`,
      "room",
      { roomId },
    );

    res.status(201).json(invite);
  }),
);

// Room Invitations: List
rooms.get(
  "/:id/invitations",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Not authorized to view invitations" });
    }

    const { data, error } = await admin
      .from("room_invitations")
      .select("*, invitee:profiles!room_invitations_invitee_id_fkey(id, full_name, username, avatar_url)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ invitations: data ?? [] });
  }),
);

// Atomic Join
rooms.post(
  "/:id/join",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    
    const { data: rpcData, error: rpcError } = await admin.rpc("join_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (rpcError) {
      const msg = (rpcError.message || "").toLowerCase();
      if (msg.includes("capacity") || msg.includes("full")) {
        return res.status(400).json({ error: "Room is at maximum capacity" });
      }
      if (msg.includes("invit") || msg.includes("invite")) {
        return res.status(403).json({ error: "This room requires an invitation to join" });
      }
      if (msg.includes("private")) {
        return res.status(403).json({ error: "This room is private" });
      }
      if (msg.includes("not found")) {
        return res.status(404).json({ error: "Room not found" });
      }
      throw rpcError;
    }

    await invalidateRoomCache();
    res.json({ joined: true, role: "member", member_count: rpcData?.member_count ?? 1 });
  }),
);

// Atomic Leave
rooms.post(
  "/:id/leave",
  wrap(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const { data: rpcData, error: rpcError } = await admin.rpc("leave_room_service_atomic", {
      p_room_id: id,
      p_user_id: req.userId!,
    });

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("owner")) {
        return res.status(400).json({ error: "Room owner cannot leave without transferring ownership" });
      }
      if (msg.includes("not found")) {
        return res.status(404).json({ error: "Room not found" });
      }
      throw rpcError;
    }

    await invalidateRoomCache();
    res.json({ left: true, member_count: rpcData?.member_count ?? 1 });
  }),
);

// -----------------------------------------------------------------------------
// ROOM Q&A BOARD
// -----------------------------------------------------------------------------

// GET /api/v1/rooms/:id/questions - List room questions
rooms.get(
  "/:id/questions",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("room_questions")
      .select(`
        *,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url),
        answers:room_question_answers(
          id, body, is_accepted, upvotes_count, created_at,
          author:profiles!room_question_answers_author_id_fkey(id, full_name, username, avatar_url)
        )
      `)
      .eq("room_id", roomId)
      .order("is_resolved", { ascending: true })
      .order("upvotes_count", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ questions: data ?? [] });
  }),
);

// POST /api/v1/rooms/:id/questions - Post a new question
rooms.post(
  "/:id/questions",
  qaQuestionLimiter,
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(3).max(200),
        body: z.string().min(3).max(3000),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Join room before asking questions" });
    }

    const { data, error } = await admin
      .from("room_questions")
      .insert({
        room_id: roomId,
        author_id: req.userId!,
        title: body.title,
        body: body.body,
      })
      .select(`
        *,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    logDomainEvent({
      event: "question_created",
      roomId,
      questionId: data.id,
      isAnonymous: false,
    });

    res.status(201).json({ question: data });
  }),
);

// POST /api/v1/rooms/:id/questions/:qId/answers - Post an answer
rooms.post(
  "/:id/questions/:qId/answers",
  qaAnswerLimiter,
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const qId = z.string().uuid().parse(req.params.qId);
    const body = z.object({ body: z.string().min(2).max(4000) }).parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Join room before answering questions" });
    }

    const { data, error } = await admin
      .from("room_question_answers")
      .insert({
        question_id: qId,
        author_id: req.userId!,
        body: body.body,
      })
      .select(`
        *,
        author:profiles!room_question_answers_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Notify question author of new answer
    void (async () => {
      try {
        const { data: q } = await admin
          .from("room_questions")
          .select("author_id, title")
          .eq("id", qId)
          .maybeSingle();

        if (q && q.author_id !== req.userId!) {
          void NotificationService.dispatch({
            userId: q.author_id,
            type: "QUESTION_ANSWERED",
            title: "New Answer on Your Question",
            body: `Someone replied to: "${q.title.slice(0, 50)}"`,
            entityType: "question",
            entityId: qId,
            data: { roomId, questionId: qId, answerId: data.id, route: "room", targetTab: "qa" },
          });
        }
      } catch {}
    })();

    res.status(201).json({ answer: data });
  }),
);

// POST /api/v1/rooms/:id/questions/:qId/vote - Toggle upvote
rooms.post(
  "/:id/questions/:qId/vote",
  wrap(async (req, res) => {
    const qId = z.string().uuid().parse(req.params.qId);

    const { data: existing } = await admin
      .from("room_question_votes")
      .select("question_id")
      .eq("question_id", qId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    let voted = false;
    if (existing) {
      await admin.from("room_question_votes").delete().eq("question_id", qId).eq("user_id", req.userId!);
      voted = false;
    } else {
      await admin.from("room_question_votes").insert({ question_id: qId, user_id: req.userId! });
      voted = true;
    }

    // Refresh count
    const { count } = await admin
      .from("room_question_votes")
      .select("*", { count: "exact", head: true })
      .eq("question_id", qId);

    await admin
      .from("room_questions")
      .update({ upvotes_count: count ?? 0 })
      .eq("id", qId);

    res.json({ success: true, voted, upvotes_count: count ?? 0 });
  }),
);

// PATCH /api/v1/rooms/:id/questions/:qId/answers/:aId/accept - Mark accepted solution
rooms.patch(
  "/:id/questions/:qId/answers/:aId/accept",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const qId = z.string().uuid().parse(req.params.qId);
    const aId = z.string().uuid().parse(req.params.aId);

    // Fetch question to check author
    const { data: question } = await admin
      .from("room_questions")
      .select("author_id")
      .eq("id", qId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Check room role
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    const isQuestionAuthor = question.author_id === req.userId!;
    const isRoomLeader = member && ["owner", "teacher", "moderator"].includes(member.role);

    if (!isQuestionAuthor && !isRoomLeader) {
      return res.status(403).json({ error: "Only the question author or room host can accept a solution" });
    }

    // Verify answer belongs to question
    const { data: answer } = await admin
      .from("room_question_answers")
      .select("id, author_id")
      .eq("id", aId)
      .eq("question_id", qId)
      .maybeSingle();

    if (!answer) {
      return res.status(404).json({ error: "Answer not found for this question" });
    }

    // Reset any previous accepted answer for this question
    await admin
      .from("room_question_answers")
      .update({ is_accepted: false })
      .eq("question_id", qId);

    // Mark target answer accepted
    await admin
      .from("room_question_answers")
      .update({ is_accepted: true })
      .eq("id", aId);

    // Mark question resolved with accepted answer ID
    const { data: updatedQuestion, error } = await admin
      .from("room_questions")
      .update({
        is_resolved: true,
        accepted_answer_id: aId,
      })
      .eq("id", qId)
      .select(`
        *,
        author:profiles!room_questions_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    if (answer.author_id && answer.author_id !== req.userId!) {
      void NotificationService.dispatch({
        userId: answer.author_id,
        type: "ANSWER_ACCEPTED",
        title: "Your Answer Was Accepted! 🎉",
        body: "Your answer was marked as the accepted solution.",
        priority: "high",
        entityType: "answer",
        entityId: aId,
        data: { roomId, questionId: qId, answerId: aId, route: "room", targetTab: "qa" },
      });
    }

    logDomainEvent({
      event: "answer_accepted",
      roomId,
      questionId: qId,
      answerId: aId,
    });

    res.json({ success: true, question: updatedQuestion, accepted_answer_id: aId });
  }),
);

// -----------------------------------------------------------------------------
// ROOM RECORDINGS (YOUTUBE ARCHIVE)
// -----------------------------------------------------------------------------

function extractYouTubeId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match?.[1] ?? null;
}

// GET /api/v1/rooms/:id/recordings - List recordings
rooms.get(
  "/:id/recordings",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("room_recordings")
      .select(`
        *,
        uploader:profiles!room_recordings_uploader_id_fkey(id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ recordings: data ?? [] });
  }),
);

// POST /api/v1/rooms/:id/recordings - Add YouTube recording
rooms.post(
  "/:id/recordings",
  recordingLimiter,
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional().default(""),
        youtubeUrl: z.string().min(5),
        durationSeconds: z.number().int().nonnegative().optional().default(0),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Room owner or moderator required to post recordings" });
    }

    const videoId = extractYouTubeVideoId(body.youtubeUrl);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL or Video ID" });
    }

    // Check duplicate recording in room
    const { data: existingRec } = await admin
      .from("room_recordings")
      .select("id")
      .eq("room_id", roomId)
      .eq("youtube_video_id", videoId)
      .maybeSingle();

    if (existingRec) {
      return res.status(409).json({ error: "This recording has already been added to this study room" });
    }

    // Fetch video metadata with quota-aware fallback
    const meta = await fetchYouTubeVideoMetadata(videoId);
    const canonicalUrl = getYouTubeWatchUrl(videoId);
    const finalTitle = body.title?.trim() ? body.title.trim() : meta.title;
    const finalDuration = body.durationSeconds > 0 ? body.durationSeconds : (meta.durationSeconds || 0);

    const { data, error } = await admin
      .from("room_recordings")
      .insert({
        room_id: roomId,
        uploader_id: req.userId!,
        title: finalTitle,
        description: body.description || meta.description,
        youtube_video_id: videoId,
        youtube_url: canonicalUrl,
        duration_seconds: finalDuration,
        thumbnail_url: meta.thumbnailUrl,
        source_type: "youtube",
        status: "ready",
        youtube_channel_id: meta.channelId,
        published_at: meta.publishedAt,
        privacy_status: meta.privacyStatus || "unlisted",
        provider_metadata: meta,
        last_synced_at: new Date().toISOString(),
      })
      .select(`
        *,
        uploader:profiles!room_recordings_uploader_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    logDomainEvent({
      event: "recording_added",
      roomId,
      recordingId: data.id,
      durationSeconds: finalDuration,
      provider: "youtube",
    });

    res.status(201).json({ recording: data });
  }),
);

// POST /api/v1/rooms/:id/recordings/:recId/sync - Resync recording metadata
rooms.post(
  "/:id/recordings/:recId/sync",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const recId = z.string().uuid().parse(req.params.recId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator", "admin"].includes(member.role)) {
      return res.status(403).json({ error: "Room owner or moderator required to sync recordings" });
    }

    const { data: rec, error: fetchErr } = await admin
      .from("room_recordings")
      .select("*")
      .eq("id", recId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (fetchErr || !rec) {
      return res.status(404).json({ error: "Recording not found in room" });
    }

    if (!rec.youtube_video_id) {
      return res.status(400).json({ error: "Recording does not have a linked YouTube video ID" });
    }

    // Refresh metadata directly and schedule background job
    const meta = await fetchYouTubeVideoMetadata(rec.youtube_video_id);

    const updatePayload: Record<string, any> = {
      title: meta.title || rec.title,
      description: meta.description || rec.description,
      thumbnail_url: meta.thumbnailUrl || rec.thumbnail_url,
      provider_metadata: meta,
      status: "ready",
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (meta.durationSeconds) updatePayload.duration_seconds = meta.durationSeconds;
    if (meta.channelId) updatePayload.youtube_channel_id = meta.channelId;
    if (meta.publishedAt) updatePayload.published_at = meta.publishedAt;
    if (meta.privacyStatus) updatePayload.privacy_status = meta.privacyStatus;

    const { data: updated, error: updateErr } = await admin
      .from("room_recordings")
      .update(updatePayload)
      .eq("id", recId)
      .select(`
        *,
        uploader:profiles!room_recordings_uploader_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (updateErr) throw updateErr;

    res.json({ recording: updated, synced: true });
  }),
);

// DELETE /api/v1/rooms/:id/recordings/:recId - Delete recording
rooms.delete(
  "/:id/recordings/:recId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const recId = z.string().uuid().parse(req.params.recId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    const { data: rec } = await admin
      .from("room_recordings")
      .select("uploader_id")
      .eq("id", recId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!rec) {
      return res.status(404).json({ error: "Recording not found" });
    }

    const isHostOrMod = member && ["owner", "moderator", "admin"].includes(member.role);
    const isUploader = rec.uploader_id === req.userId;

    if (!isHostOrMod && !isUploader) {
      return res.status(403).json({ error: "Permission denied to delete this recording" });
    }

    const { error: delErr } = await admin
      .from("room_recordings")
      .delete()
      .eq("id", recId)
      .eq("room_id", roomId);

    if (delErr) throw delErr;

    res.json({ success: true, message: "Recording deleted successfully" });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// ROOM OS CORE: POSTS, COMMENTS, REACTIONS, PERMISSIONS & MEMBER OPS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/rooms/:id/permissions - Server-authoritative capabilities
rooms.get(
  "/:id/permissions",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const uid = req.userId;

    const { data: room } = await admin
      .from("rooms")
      .select("owner_id, visibility, status")
      .eq("id", roomId)
      .maybeSingle();

    if (!room) return res.status(404).json({ error: "Room not found" });

    let memberRole: string | null = null;
    if (uid) {
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", uid)
        .maybeSingle();
      if (member) memberRole = member.role;
    }

    const isOwner = uid === room.owner_id || memberRole === "owner";
    const isTeacher = memberRole === "teacher";
    const isMod = memberRole === "moderator";
    const isMember = Boolean(memberRole);

    res.json({
      role: memberRole,
      isOwner,
      isMember,
      canPost: isMember,
      canAnnounce: isOwner || isTeacher || isMod,
      canPin: isOwner || isTeacher || isMod,
      canModerate: isOwner || isMod,
      canStartLive: isOwner || isTeacher,
      canUploadResource: isMember,
      canManageMembers: isOwner || isMod,
      canManageRoles: isOwner,
      canManageChannels: isOwner || isTeacher || isMod,
    });
  }),
);

// GET /api/v1/rooms/:id/posts - Keyset-paginated Room OS posts
rooms.get(
  "/:id/posts",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const cursor = req.query.cursor as string | undefined;
    const type = req.query.type as string | undefined;

    // Check room access
    const { data: room } = await admin.from("rooms").select("visibility").eq("id", roomId).maybeSingle();
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.visibility !== "public") {
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (!member) return res.status(403).json({ error: "Join room to view posts" });
    }

    let query = admin
      .from("room_posts")
      .select(`
        *,
        author:profiles!room_posts_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .neq("status", "deleted")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }
    if (type) {
      query = query.eq("type", type);
    }

    const { data: rawPosts, error } = await query;
    if (error) throw error;

    const posts = rawPosts ?? [];
    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at : null;

    // Fetch user reactions if signed in
    const postIds = items.map((p) => p.id);
    const userReactions = new Map<string, string>();

    if (req.userId && postIds.length > 0) {
      const { data: reactions } = await admin
        .from("room_post_reactions")
        .select("post_id, reaction_type")
        .eq("user_id", req.userId)
        .in("post_id", postIds);

      for (const r of reactions ?? []) {
        userReactions.set(r.post_id, r.reaction_type);
      }
    }

    const formattedPosts = items.map((p) => ({
      ...p,
      my_reaction: userReactions.get(p.id) ?? null,
    }));

    res.json({ posts: formattedPosts, next_cursor: nextCursor });
  }),
);

// POST /api/v1/rooms/:id/posts - Create Room Post
rooms.post(
  "/:id/posts",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().trim().max(160).optional(),
        body: z.string().trim().min(1, "Post body cannot be empty").max(10000),
        type: z
          .enum(["discussion", "question", "announcement", "poll", "resource", "event", "help", "achievement"])
          .default("discussion"),
        metadata: z.record(z.string(), z.any()).optional().default({}),
      })
      .parse(req.body);

    // Verify membership
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Join room to publish posts" });
    }

    // Role check for announcements
    if (body.type === "announcement" && !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room leaders can publish announcements" });
    }

    const { data: post, error } = await admin
      .from("room_posts")
      .insert({
        room_id: roomId,
        author_id: req.userId!,
        type: body.type,
        title: body.title || null,
        body: body.body,
        metadata: body.metadata,
        is_pinned: body.type === "announcement",
      })
      .select(`
        *,
        author:profiles!room_posts_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Log domain event
    logDomainEvent({
      event: "room_post_created",
      roomId,
      postId: post.id,
      postType: body.type,
    });

    res.status(201).json({ post });
  }),
);

// PATCH /api/v1/rooms/:id/posts/:postId/pin - Pin or unpin post
rooms.patch(
  "/:id/posts/:postId/pin",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const postId = z.string().uuid().parse(req.params.postId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room leaders can pin posts" });
    }

    const { data: post } = await admin.from("room_posts").select("is_pinned").eq("id", postId).eq("room_id", roomId).single();
    if (!post) return res.status(404).json({ error: "Post not found" });

    const nextPinned = !post.is_pinned;
    const { data: updated, error } = await admin
      .from("room_posts")
      .update({ is_pinned: nextPinned, updated_at: new Date().toISOString() })
      .eq("id", postId)
      .select()
      .single();

    if (error) throw error;
    res.json({ post: updated });
  }),
);

// DELETE /api/v1/rooms/:id/posts/:postId - Soft delete post
rooms.delete(
  "/:id/posts/:postId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const postId = z.string().uuid().parse(req.params.postId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    const { data: post } = await admin.from("room_posts").select("author_id").eq("id", postId).eq("room_id", roomId).single();
    if (!post) return res.status(404).json({ error: "Post not found" });

    const isAuthor = post.author_id === req.userId!;
    const isLeader = member && ["owner", "moderator"].includes(member.role);

    if (!isAuthor && !isLeader) {
      return res.status(403).json({ error: "Permission denied to delete post" });
    }

    const { error } = await admin
      .from("room_posts")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", postId);

    if (error) throw error;
    res.status(204).send();
  }),
);

// GET /api/v1/rooms/:id/posts/:postId/comments - Fetch post comments
rooms.get(
  "/:id/posts/:postId/comments",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const postId = z.string().uuid().parse(req.params.postId);

    const { data: comments, error } = await admin
      .from("room_post_comments")
      .select(`
        *,
        author:profiles!room_post_comments_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .eq("post_id", postId)
      .neq("status", "deleted")
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ comments: comments ?? [] });
  }),
);

// POST /api/v1/rooms/:id/posts/:postId/comments - Add comment
rooms.post(
  "/:id/posts/:postId/comments",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const postId = z.string().uuid().parse(req.params.postId);
    const body = z
      .object({
        body: z.string().trim().min(1, "Comment cannot be empty").max(2000),
        parent_comment_id: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Join room to comment" });
    }

    const { data: comment, error } = await admin
      .from("room_post_comments")
      .insert({
        post_id: postId,
        author_id: req.userId!,
        parent_comment_id: body.parent_comment_id || null,
        body: body.body,
      })
      .select(`
        *,
        author:profiles!room_post_comments_author_id_fkey(id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Increment comments_count
    const { count } = await admin
      .from("room_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId)
      .neq("status", "deleted");

    await admin.from("room_posts").update({ comments_count: count ?? 0 }).eq("id", postId);

    res.status(201).json({ comment });
  }),
);

// POST /api/v1/rooms/:id/posts/:postId/reactions - Toggle reaction
rooms.post(
  "/:id/posts/:postId/reactions",
  wrap(async (req, res) => {
    const postId = z.string().uuid().parse(req.params.postId);
    const body = z.object({ reaction_type: z.string().min(1).default("helpful") }).parse(req.body || {});

    const { data: existing } = await admin
      .from("room_post_reactions")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    let reacted = false;
    if (existing) {
      await admin.from("room_post_reactions").delete().eq("post_id", postId).eq("user_id", req.userId!);
      reacted = false;
    } else {
      await admin.from("room_post_reactions").insert({
        post_id: postId,
        user_id: req.userId!,
        reaction_type: body.reaction_type,
      });
      reacted = true;
    }

    const { count } = await admin
      .from("room_post_reactions")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    const likesCount = count ?? 0;
    await admin.from("room_posts").update({ likes_count: likesCount }).eq("id", postId);

    res.json({ success: true, reacted, reaction_type: body.reaction_type, likes_count: likesCount });
  }),
);

// PATCH /api/v1/rooms/:id/members/:memberId/role - Promote/demote room role
rooms.patch(
  "/:id/members/:memberId/role",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.memberId);
    const body = z.object({ role: z.enum(["teacher", "moderator", "member"]) }).parse(req.body);

    const { data: requester } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!requester || requester.role !== "owner") {
      return res.status(403).json({ error: "Only the room owner can manage member roles" });
    }

    const { data: updated, error } = await admin
      .from("room_members")
      .update({ role: body.role })
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, role: updated.role });
  }),
);

// DELETE /api/v1/rooms/:id/members/:memberId - Remove member from room
rooms.delete(
  "/:id/members/:memberId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.memberId);

    const { data: requester } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!requester || !["owner", "moderator"].includes(requester.role)) {
      return res.status(403).json({ error: "Permission denied to remove member" });
    }

    // Protect owner from removal
    const { data: target } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (target?.role === "owner") {
      return res.status(400).json({ error: "Cannot remove room owner" });
    }

    const { error } = await admin
      .from("room_members")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", targetUserId);

    if (error) throw error;
    res.json({ success: true });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT 5: ADVANCED ROOM COLLABORATION ENDPOINTS
// Channels, Pinned Hub, Video Playlists & Progress, Moderation & Analytics
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/rooms/:id/channels - List room channels (auto-seeds #general if empty)
rooms.get(
  "/:id/channels",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: room } = await admin
      .from("rooms")
      .select("id, conversation_id, visibility, owner_id")
      .eq("id", roomId)
      .maybeSingle();

    if (!room) return res.status(404).json({ error: "Room not found" });

    const { data: existingChannels, error } = await admin
      .from("room_channels")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (existingChannels && existingChannels.length > 0) {
      return res.json({ channels: existingChannels });
    }

    // Auto-seed default #general channel if none exists
    const { data: seededChannel, error: seedErr } = await admin
      .from("room_channels")
      .insert({
        room_id: roomId,
        name: "general",
        slug: "general",
        type: "text",
        description: "General discussion for this room",
        position: 0,
        is_default: true,
        conversation_id: room.conversation_id,
        created_by: room.owner_id,
      })
      .select()
      .single();

    if (seedErr) {
      const { data: retryChannels } = await admin
        .from("room_channels")
        .select("*")
        .eq("room_id", roomId)
        .order("position", { ascending: true });
      return res.json({ channels: retryChannels ?? [] });
    }

    res.json({ channels: [seededChannel] });
  }),
);

// POST /api/v1/rooms/:id/channels - Create new channel
rooms.post(
  "/:id/channels",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(2).max(50),
        type: z.enum(["text", "announcement", "question", "resource", "media", "voice"]).default("text"),
        description: z.string().max(300).optional().default(""),
        position: z.number().int().optional().default(0),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to create channels" });
    }

    const slug = body.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    let channelConvId: string | null = null;
    if (["text", "announcement"].includes(body.type)) {
      const { data: conv } = await admin
        .from("conversations")
        .insert({
          kind: "room",
          title: `#${slug}`,
        })
        .select("id")
        .single();
      if (conv) channelConvId = conv.id;
    }

    const { data: channel, error } = await admin
      .from("room_channels")
      .insert({
        room_id: roomId,
        name: body.name.trim(),
        slug,
        type: body.type,
        description: body.description,
        position: body.position,
        is_default: false,
        created_by: req.userId!,
        conversation_id: channelConvId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "A channel with this name already exists in this room" });
      }
      throw error;
    }

    res.status(201).json({ channel });
  }),
);

// PATCH /api/v1/rooms/:id/channels/:channelId - Update channel
rooms.patch(
  "/:id/channels/:channelId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const channelId = z.string().uuid().parse(req.params.channelId);
    const body = z
      .object({
        name: z.string().trim().min(2).max(50).optional(),
        description: z.string().max(300).optional(),
        position: z.number().int().optional(),
        is_archived: z.boolean().optional(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to modify channels" });
    }

    const updateData: Record<string, any> = {};
    if (body.name) {
      updateData.name = body.name.trim();
      updateData.slug = body.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.is_archived !== undefined) updateData.is_archived = body.is_archived;

    const { data: updated, error } = await admin
      .from("room_channels")
      .update(updateData)
      .eq("id", channelId)
      .eq("room_id", roomId)
      .select()
      .single();

    if (error) throw error;
    res.json({ channel: updated });
  }),
);

// DELETE /api/v1/rooms/:id/channels/:channelId - Delete channel
rooms.delete(
  "/:id/channels/:channelId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const channelId = z.string().uuid().parse(req.params.channelId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to delete channels" });
    }

    const { data: targetChannel } = await admin
      .from("room_channels")
      .select("is_default")
      .eq("id", channelId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!targetChannel) return res.status(404).json({ error: "Channel not found" });
    if (targetChannel.is_default) {
      return res.status(400).json({ error: "Cannot delete the default channel" });
    }

    const { error } = await admin
      .from("room_channels")
      .delete()
      .eq("id", channelId)
      .eq("room_id", roomId);

    if (error) throw error;
    res.json({ success: true });
  }),
);

// GET /api/v1/rooms/:id/search - Scoped Contextual In-Room Search
rooms.get(
  "/:id/search",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const q = z.string().min(1).max(100).parse(req.query.q);
    const category = z
      .enum(["all", "posts", "messages", "questions", "files", "videos", "members", "announcements"])
      .default("all")
      .parse(req.query.category || "all");
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const { data: room } = await admin
      .from("rooms")
      .select("id, conversation_id, visibility")
      .eq("id", roomId)
      .maybeSingle();
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.visibility !== "public") {
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", req.userId!)
        .maybeSingle();
      if (!member) return res.status(403).json({ error: "Must be a room member to search" });
    }

    const results: any[] = [];
    const tasks: Promise<void>[] = [];

    // Posts & Announcements
    if (["all", "posts", "announcements"].includes(category)) {
      tasks.push(
        (async () => {
          let query = admin
            .from("room_posts")
            .select("id, type, title, body, created_at, author:profiles!room_posts_author_id_fkey(full_name, username)")
            .eq("room_id", roomId)
            .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
            .limit(limit);

          if (category === "announcements") {
            query = query.eq("type", "announcement");
          }

          const { data } = await query;
          (data ?? []).forEach((p: any) => {
            results.push({
              id: p.id,
              kind: p.type === "announcement" ? "announcement" : "post",
              title: p.title || (p.body ? p.body.slice(0, 60) : "Untitled Post"),
              subtitle: `${p.type.toUpperCase()} • by ${p.author?.full_name || "Unknown"}`,
              targetTab: "posts",
              metadata: { postId: p.id, type: p.type },
            });
          });
        })(),
      );
    }

    // Messages
    if (["all", "messages"].includes(category) && room.conversation_id) {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("messages")
            .select("id, body, created_at, sender:profiles!messages_sender_id_fkey(full_name, username)")
            .eq("conversation_id", room.conversation_id)
            .ilike("body", `%${q}%`)
            .limit(limit);

          (data ?? []).forEach((m: any) => {
            results.push({
              id: m.id,
              kind: "message",
              title: m.body ? m.body.slice(0, 80) : "Message",
              subtitle: `Chat • by ${m.sender?.full_name || "Unknown"}`,
              targetTab: "chat",
              metadata: { messageId: m.id },
            });
          });
        })(),
      );
    }

    // Questions
    if (["all", "questions"].includes(category)) {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("room_questions")
            .select("id, title, body, is_resolved, created_at, author:profiles!room_questions_author_id_fkey(full_name)")
            .eq("room_id", roomId)
            .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
            .limit(limit);

          (data ?? []).forEach((item: any) => {
            results.push({
              id: item.id,
              kind: "question",
              title: item.title,
              subtitle: `Q&A • ${item.is_resolved ? "✓ Resolved" : "Open"}`,
              targetTab: "learn",
              metadata: { questionId: item.id },
            });
          });
        })(),
      );
    }

    // Files
    if (["all", "files"].includes(category)) {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("resources")
            .select("id, title, kind, url, created_at")
            .eq("room_id", roomId)
            .ilike("title", `%${q}%`)
            .limit(limit);

          (data ?? []).forEach((item: any) => {
            results.push({
              id: item.id,
              kind: "file",
              title: item.title,
              subtitle: `File • ${item.kind || "document"}`,
              targetTab: "media",
              metadata: { fileId: item.id, url: item.url },
            });
          });
        })(),
      );
    }

    // Videos
    if (["all", "videos"].includes(category)) {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("room_recordings")
            .select("id, title, duration_seconds, youtube_url, created_at")
            .eq("room_id", roomId)
            .ilike("title", `%${q}%`)
            .limit(limit);

          (data ?? []).forEach((item: any) => {
            results.push({
              id: item.id,
              kind: "video",
              title: item.title,
              subtitle: `Video • ${Math.round(item.duration_seconds / 60)} min`,
              targetTab: "media",
              metadata: { videoId: item.id, youtubeUrl: item.youtube_url },
            });
          });
        })(),
      );
    }

    // Members
    if (["all", "members"].includes(category)) {
      tasks.push(
        (async () => {
          const { data } = await admin
            .from("room_members")
            .select("user_id, role, profile:profiles!room_members_user_id_fkey(id, full_name, username, avatar_url, university)")
            .eq("room_id", roomId);

          (data ?? []).forEach((m: any) => {
            const p = m.profile;
            if (p && (p.full_name?.toLowerCase().includes(q.toLowerCase()) || p.username?.toLowerCase().includes(q.toLowerCase()))) {
              results.push({
                id: p.id,
                kind: "member",
                title: p.full_name || `@${p.username}`,
                subtitle: `Member • ${m.role.toUpperCase()} ${p.university ? `• ${p.university}` : ""}`,
                targetTab: "more",
                metadata: { userId: p.id, role: m.role },
              });
            }
          });
        })(),
      );
    }

    await Promise.all(tasks);
    res.json({ results: results.slice(0, limit), total: results.length, query: q, category });
  }),
);

// GET /api/v1/rooms/:id/pinned - List pinned items
rooms.get(
  "/:id/pinned",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data, error } = await admin
      .from("room_pinned_items")
      .select("*, pinner:profiles!room_pinned_items_pinned_by_fkey(id, full_name, username)")
      .eq("room_id", roomId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ pinnedItems: data ?? [] });
  }),
);

// POST /api/v1/rooms/:id/pinned - Pin an item to central hub
rooms.post(
  "/:id/pinned",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        item_type: z.enum(["post", "announcement", "question", "resource", "event", "message", "video"]),
        item_id: z.string().uuid(),
        title: z.string().min(1).max(200),
        subtitle: z.string().max(200).optional().default(""),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room hosts or moderators can pin items" });
    }

    const { data: pinned, error } = await admin
      .from("room_pinned_items")
      .insert({
        room_id: roomId,
        item_type: body.item_type,
        item_id: body.item_id,
        title: body.title,
        subtitle: body.subtitle,
        pinned_by: req.userId!,
      })
      .select()
      .single();

    if (error) throw error;

    if (body.item_type === "post" || body.item_type === "announcement") {
      await admin.from("room_posts").update({ is_pinned: true }).eq("id", body.item_id);
    }

    res.status(201).json({ pinned });
  }),
);

// DELETE /api/v1/rooms/:id/pinned/:pinnedId - Unpin item
rooms.delete(
  "/:id/pinned/:pinnedId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const pinnedId = z.string().uuid().parse(req.params.pinnedId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only room hosts or moderators can unpin items" });
    }

    const { data: target } = await admin
      .from("room_pinned_items")
      .select("item_type, item_id")
      .eq("id", pinnedId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: "Pinned item not found" });

    const { error } = await admin
      .from("room_pinned_items")
      .delete()
      .eq("id", pinnedId)
      .eq("room_id", roomId);

    if (error) throw error;

    if (target.item_type === "post" || target.item_type === "announcement") {
      await admin.from("room_posts").update({ is_pinned: false }).eq("id", target.item_id);
    }

    res.json({ success: true });
  }),
);

// POST /api/v1/rooms/:id/voice/token - Generate audio-first LiveKit token for Voice Room
rooms.post(
  "/:id/voice/token",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);

    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      return res.status(503).json({
        error: "LiveKit voice service is not configured",
        code: "LIVEKIT_NOT_CONFIGURED",
      });
    }

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Join the room first to enter voice" });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", req.userId!)
      .maybeSingle();

    const participantName = profile?.full_name || (profile?.username ? `@${profile.username}` : req.userId!);
    const roomName = `skillbridge-voice-${roomId}`;

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.userId!,
      name: participantName,
      ttl: "4h",
      metadata: JSON.stringify({
        roomId,
        mode: "voice",
        role: member.role,
        fullName: profile?.full_name,
        avatarUrl: profile?.avatar_url,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });

    res.json({
      url: env.LIVEKIT_URL,
      token: await at.toJwt(),
      roomName,
      participantName,
      canPublish: true,
    });
  }),
);

// GET /api/v1/rooms/:id/voice/active - Active voice presence
rooms.get(
  "/:id/voice/active",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    res.json({
      active: false,
      participantCount: 0,
      roomName: `skillbridge-voice-${roomId}`,
    });
  }),
);

// GET /api/v1/rooms/:id/videos/playlists - Video playlists
rooms.get(
  "/:id/videos/playlists",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: playlists, error } = await admin
      .from("room_video_playlists")
      .select(`
        id, title, description, position, created_at,
        items:room_video_playlist_items(
          position,
          recording:room_recordings(*)
        )
      `)
      .eq("room_id", roomId)
      .order("position", { ascending: true });

    if (error) throw error;
    res.json({ playlists: playlists ?? [] });
  }),
);

// POST /api/v1/rooms/:id/videos/playlists - Create playlist
rooms.post(
  "/:id/videos/playlists",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().max(500).optional().default(""),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to create playlists" });
    }

    const { data: playlist, error } = await admin
      .from("room_video_playlists")
      .insert({
        room_id: roomId,
        title: body.title.trim(),
        description: body.description,
        created_by: req.userId!,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ playlist });
  }),
);

// POST /api/v1/rooms/:id/videos/playlists/:playlistId/items - Add to playlist
rooms.post(
  "/:id/videos/playlists/:playlistId/items",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const playlistId = z.string().uuid().parse(req.params.playlistId);
    const body = z.object({ recordingId: z.string().uuid(), position: z.number().int().optional().default(0) }).parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "teacher", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to modify playlist items" });
    }

    const { error } = await admin
      .from("room_video_playlist_items")
      .upsert({
        playlist_id: playlistId,
        recording_id: body.recordingId,
        position: body.position,
      });

    if (error) throw error;
    res.json({ success: true });
  }),
);

// GET /api/v1/rooms/:id/videos/progress - User watch progress
rooms.get(
  "/:id/videos/progress",
  wrap(async (req, res) => {
    const { data, error } = await admin
      .from("user_video_progress")
      .select("recording_id, last_position_seconds, duration_seconds, completed, updated_at")
      .eq("user_id", req.userId!);

    if (error) throw error;
    res.json({ progress: data ?? [] });
  }),
);

// POST /api/v1/rooms/:id/videos/progress - Checkpoint watch progress
rooms.post(
  "/:id/videos/progress",
  wrap(async (req, res) => {
    const body = z
      .object({
        recordingId: z.string().uuid(),
        lastPositionSeconds: z.number().int().nonnegative(),
        durationSeconds: z.number().int().nonnegative(),
        completed: z.boolean().optional().default(false),
      })
      .parse(req.body);

    const { error } = await admin
      .from("user_video_progress")
      .upsert(
        {
          user_id: req.userId!,
          recording_id: body.recordingId,
          last_position_seconds: body.lastPositionSeconds,
          duration_seconds: body.durationSeconds,
          completed: body.completed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,recording_id" },
      );

    if (error) throw error;
    res.json({ success: true });
  }),
);

// GET /api/v1/rooms/:id/moderation/reports - Room moderation reports
rooms.get(
  "/:id/moderation/reports",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only owners and moderators can access room reports" });
    }

    const { data: reports, error } = await admin
      .from("reports")
      .select("*, reporter:profiles!reports_reporter_id_fkey(full_name, username)")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    res.json({ reports: reports ?? [] });
  }),
);

// POST /api/v1/rooms/:id/moderation/actions - Execute moderation action
rooms.post(
  "/:id/moderation/actions",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        action: z.enum(["dismiss_report", "remove_content", "warn_user", "mute_user", "remove_user", "ban_user"]),
        targetType: z.string(),
        targetId: z.string().uuid(),
        reason: z.string().max(500).optional().default(""),
        reportId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Permission denied for moderation actions" });
    }

    if (body.action === "remove_content") {
      if (body.targetType === "post" || body.targetType === "announcement") {
        await admin.from("room_posts").delete().eq("id", body.targetId).eq("room_id", roomId);
      } else if (body.targetType === "comment") {
        await admin.from("room_post_comments").delete().eq("id", body.targetId);
      }
    } else if (body.action === "remove_user" || body.action === "ban_user") {
      await admin.from("room_members").delete().eq("room_id", roomId).eq("user_id", body.targetId);
    }

    if (body.reportId) {
      await admin.from("reports").update({ status: "resolved" }).eq("id", body.reportId);
    }

    const { data: log, error } = await admin
      .from("room_moderation_logs")
      .insert({
        room_id: roomId,
        actor_id: req.userId!,
        action: body.action,
        target_type: body.targetType,
        target_id: body.targetId,
        reason: body.reason,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, log });
  }),
);

// GET /api/v1/rooms/:id/moderation/logs - Moderation audit trail
rooms.get(
  "/:id/moderation/logs",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Only owners and moderators can view moderation logs" });
    }

    const { data: logs, error } = await admin
      .from("room_moderation_logs")
      .select("*, actor:profiles!room_moderation_logs_actor_id_fkey(full_name, username)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ logs: logs ?? [] });
  }),
);

// GET /api/v1/rooms/:id/analytics - Lightweight server-aggregated metrics
rooms.get(
  "/:id/analytics",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const period = z.enum(["7d", "30d"]).default("7d").parse(req.query.period || "7d");

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator", "teacher"].includes(member.role)) {
      return res.status(403).json({ error: "Only room hosts and moderators can view analytics" });
    }

    const days = period === "30d" ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [membersCountRes, postsCountRes, questionsCountRes, recordingsCountRes] = await Promise.all([
      admin.from("room_members").select("user_id", { count: "exact", head: true }).eq("room_id", roomId),
      admin.from("room_posts").select("id", { count: "exact", head: true }).eq("room_id", roomId).gte("created_at", since),
      admin.from("room_questions").select("id", { count: "exact", head: true }).eq("room_id", roomId).gte("created_at", since),
      admin.from("room_recordings").select("id", { count: "exact", head: true }).eq("room_id", roomId),
    ]);

    res.json({
      analytics: {
        period,
        activeMembers: membersCountRes.count ?? 0,
        postsCount: postsCountRes.count ?? 0,
        questionsCount: questionsCountRes.count ?? 0,
        recordingsCount: recordingsCountRes.count ?? 0,
      },
    });
  }),
);

// PATCH /api/v1/rooms/:id/settings - Room customization & modules
rooms.patch(
  "/:id/settings",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        enabled_modules: z.array(z.string()).optional(),
        default_landing_tab: z.enum(["posts", "chat", "learn", "media"]).optional(),
        appearance: z.record(z.string(), z.any()).optional(),
        is_archived: z.boolean().optional(),
      })
      .parse(req.body);

    const { data: room } = await admin
      .from("rooms")
      .select("owner_id")
      .eq("id", roomId)
      .maybeSingle();

    if (!room || room.owner_id !== req.userId!) {
      return res.status(403).json({ error: "Only the room owner can modify room settings" });
    }

    const { data: updated, error } = await admin
      .from("rooms")
      .update(body)
      .eq("id", roomId)
      .select()
      .single();

    if (error) throw error;
    res.json({ room: updated });
  }),
);

// POST /api/v1/rooms/:id/invites - Create invite code
rooms.post(
  "/:id/invites",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        maxUses: z.number().int().positive().optional(),
        expiresInHours: z.number().int().positive().optional(),
      })
      .parse(req.body);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to generate invites" });
    }

    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 3600 * 1000).toISOString()
      : null;

    const { data: invite, error } = await admin
      .from("room_invites")
      .insert({
        room_id: roomId,
        code,
        created_by: req.userId!,
        max_uses: body.maxUses || null,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ invite });
  }),
);

// GET /api/v1/rooms/:id/invites - List active invites
rooms.get(
  "/:id/invites",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const { data: invites, error } = await admin
      .from("room_invites")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_revoked", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ invites: invites ?? [] });
  }),
);

// DELETE /api/v1/rooms/:id/invites/:inviteId - Revoke invite
rooms.delete(
  "/:id/invites/:inviteId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const inviteId = z.string().uuid().parse(req.params.inviteId);

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();

    if (!member || !["owner", "moderator"].includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized to revoke invites" });
    }

    const { error } = await admin
      .from("room_invites")
      .update({ is_revoked: true })
      .eq("id", inviteId)
      .eq("room_id", roomId);

    if (error) throw error;
    res.json({ success: true });
  }),
);
