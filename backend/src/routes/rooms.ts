import { Router } from "express";
import { z } from "zod";
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
    title: z.string().min(4).max(120),
    description: z.string().max(1000),
    topic: z.string().min(2).max(100),
    visibility: z.enum(["public", "private", "invite_only"]).default("public"),
    mode: z.enum(["online", "offline", "hybrid"]).default("hybrid"),
    capacity: z.number().int().min(2).max(env.MAX_ROOM_CAPACITY).default(30),
    tags: z.array(z.string().max(40)).max(10).default([]),
    rules: z.string().max(1000).optional().default(""),
    campus_location: z.string().max(200).optional(),
  })
  .refine(
    (data) => data.mode === "online" || (data.campus_location && data.campus_location.trim().length > 0),
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
    const { data: v_room_id, error } = await admin.rpc("create_room_atomic", {
      p_title: body.title,
      p_description: body.description,
      p_topic: body.topic,
      p_visibility: body.visibility,
      p_mode: body.mode,
      p_capacity: body.capacity,
      p_tags: body.tags,
      p_rules: body.rules,
      p_campus_location: body.campus_location,
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
    res.json({
      room,
      membership,
      members: members ?? [],
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
