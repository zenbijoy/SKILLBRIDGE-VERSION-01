import { Router, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { getSocketServer, roomPresenceRoom } from "../socket.js";
import { NotificationService } from "../services/notificationService.js";
import { getRoomMembership } from "./room-live.js";
import { logger } from "../lib/logger.js";

export const roomHelpRequests = Router({ mergeParams: true });

export interface RoomHelpRequest {
  id: string;
  roomId: string;
  userId: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
  };
  teacherId?: string | null;
  teacher?: {
    id: string;
    fullName: string;
  } | null;
  topic: string;
  details?: string | null;
  urgency: "immediate" | "normal";
  preferredMedia: "audio" | "video";
  status: "pending" | "accepted" | "resolved" | "dismissed";
  sessionId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

// In-memory fallback cache so help requests work instantly with zero-downtime
const inMemoryHelpRequests = new Map<string, RoomHelpRequest[]>();

export function getRoomHelpRequestsStore(roomId: string): RoomHelpRequest[] {
  let list = inMemoryHelpRequests.get(roomId);
  if (!list) {
    list = [];
    inMemoryHelpRequests.set(roomId, list);
  }
  return list;
}

const createHelpRequestSchema = z.object({
  topic: z.string().min(2, "Topic must be at least 2 characters").max(180),
  details: z.string().max(1000).optional(),
  urgency: z.enum(["immediate", "normal"]).default("immediate"),
  preferredMedia: z.enum(["audio", "video"]).default("audio"),
  teacherId: z.string().uuid().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /api/v1/rooms/:id/help-requests
// Student requests immediate assistance / session from teachers or admin
// ─────────────────────────────────────────────────────────────────────────────
roomHelpRequests.post(
  "/",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = createHelpRequestSchema.parse(req.body);

    const { isMember } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({ error: "You must be a member of this room to request help" });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    let targetTeacher: { id: string; fullName: string } | null = null;
    if (body.teacherId) {
      const { data: tp } = await admin
        .from("profiles")
        .select("id, full_name")
        .eq("id", body.teacherId)
        .maybeSingle();
      if (tp) {
        targetTeacher = { id: tp.id, fullName: tp.full_name || "Teacher" };
      }
    }

    const newRequest: RoomHelpRequest = {
      id: crypto.randomUUID(),
      roomId,
      userId,
      user: {
        id: userId,
        fullName: profile?.full_name || (profile?.username ? `@${profile.username}` : "Student"),
        username: profile?.username || "student",
        avatarUrl: profile?.avatar_url || null,
      },
      teacherId: body.teacherId || null,
      teacher: targetTeacher,
      topic: body.topic.trim(),
      details: body.details?.trim() || null,
      urgency: body.urgency,
      preferredMedia: body.preferredMedia,
      status: "pending",
      sessionId: null,
      createdAt: new Date().toISOString(),
    };

    // Store in in-memory list (and try best-effort DB upsert)
    const list = getRoomHelpRequestsStore(roomId);
    list.unshift(newRequest);

    try {
      await admin.from("room_help_requests").insert({
        id: newRequest.id,
        room_id: roomId,
        user_id: userId,
        teacher_id: body.teacherId || null,
        topic: newRequest.topic,
        details: newRequest.details,
        urgency: newRequest.urgency,
        preferred_media: newRequest.preferredMedia,
        status: newRequest.status,
        created_at: newRequest.createdAt,
      });
    } catch {
      // Table may not exist yet, in-memory store persists during app runtime
    }

    // Socket notification to room presence
    const io = getSocketServer();
    if (io) {
      io.to(roomPresenceRoom(roomId)).emit("room:help_request:new", {
        roomId,
        request: newRequest,
      });
    }

    // Dispatch notification to teachers & room owner
    void (async () => {
      try {
        const { data: room } = await admin.from("rooms").select("title, owner_id").eq("id", roomId).maybeSingle();
        const { data: teacherMembers } = await admin
          .from("room_members")
          .select("user_id")
          .eq("room_id", roomId)
          .in("role", ["owner", "admin", "teacher"]);

        const recipientIds = new Set<string>();
        if (room?.owner_id) recipientIds.add(room.owner_id);
        if (body.teacherId) recipientIds.add(body.teacherId);
        for (const tm of teacherMembers || []) {
          recipientIds.add(tm.user_id);
        }
        recipientIds.delete(userId); // Don't notify requester

        const urgencyPrefix = body.urgency === "immediate" ? "🚨 Immediate Help Needed" : "🙋 Session Request";
        for (const recipientId of recipientIds) {
          void NotificationService.dispatch({
            userId: recipientId,
            type: "ROOM_HELP_REQUEST",
            title: `${urgencyPrefix} in ${room?.title || "Room"}`,
            body: `${newRequest.user.fullName}: "${newRequest.topic}". Tap to respond or start session.`,
            priority: body.urgency === "immediate" ? "high" : "normal",
            entityType: "room",
            entityId: roomId,
            data: {
              roomId,
              requestId: newRequest.id,
              urgency: newRequest.urgency,
              preferredMedia: newRequest.preferredMedia,
            },
          });
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "Failed dispatching help request push");
      }
    })();

    res.status(201).json({ request: newRequest });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/rooms/:id/help-requests
// List active/pending help requests for this room
// ─────────────────────────────────────────────────────────────────────────────
roomHelpRequests.get(
  "/",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({ error: "Room membership required" });
    }

    const isTeacher = Boolean(isOwner || role === "owner" || role === "admin" || role === "teacher");
    const list = getRoomHelpRequestsStore(roomId);

    // Teachers see all pending/active requests; regular members see all or theirs
    const filtered = isTeacher
      ? list.filter((r) => r.status === "pending" || r.status === "accepted")
      : list.filter((r) => r.status === "pending" && (r.userId === userId || !r.teacherId));

    res.json({
      requests: filtered,
      pendingCount: list.filter((r) => r.status === "pending").length,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PATCH /api/v1/rooms/:id/help-requests/:requestId
// Teacher accepts, resolves, or dismisses a request
// ─────────────────────────────────────────────────────────────────────────────
const updateHelpRequestSchema = z.object({
  status: z.enum(["pending", "accepted", "resolved", "dismissed"]),
  sessionId: z.string().uuid().optional().nullable(),
});

roomHelpRequests.patch(
  "/:requestId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = req.params.requestId;
    const userId = req.userId!;
    const body = updateHelpRequestSchema.parse(req.body);

    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({ error: "Room membership required" });
    }

    const isTeacher = Boolean(isOwner || role === "owner" || role === "admin" || role === "teacher");
    const list = getRoomHelpRequestsStore(roomId);
    const reqIndex = list.findIndex((r) => r.id === requestId);

    if (reqIndex === -1) {
      return res.status(404).json({ error: "Help request not found" });
    }

    const currentReq = list[reqIndex];
    if (!currentReq) {
      return res.status(404).json({ error: "Help request not found" });
    }

    if (!isTeacher && currentReq.userId !== userId) {
      return res.status(403).json({ error: "Only a room teacher, admin, or the requester can update this request" });
    }

    currentReq.status = body.status;
    if (body.sessionId) currentReq.sessionId = body.sessionId;
    if (body.status === "resolved" || body.status === "dismissed") {
      currentReq.resolvedAt = new Date().toISOString();
    }

    list[reqIndex] = currentReq;

    // Best-effort database update
    try {
      await admin
        .from("room_help_requests")
        .update({
          status: body.status,
          session_id: body.sessionId || null,
          resolved_at: currentReq.resolvedAt || null,
        })
        .eq("id", requestId);
    } catch {}

    const io = getSocketServer();
    if (io) {
      io.to(roomPresenceRoom(roomId)).emit("room:help_request:updated", {
        roomId,
        request: currentReq,
      });
    }

    // If accepted by a teacher, notify the student
    if (body.status === "accepted" && currentReq.userId !== userId) {
      void NotificationService.dispatch({
        userId: currentReq.userId,
        type: "ROOM_HELP_ACCEPTED",
        title: "Help Request Accepted! 🎉",
        body: `A teacher accepted your request: "${currentReq.topic}". Join the live session now!`,
        priority: "high",
        entityType: "room",
        entityId: roomId,
        data: {
          roomId,
          requestId: currentReq.id,
          sessionId: currentReq.sessionId || "",
        },
      });
    }

    res.json({ request: currentReq });
  }),
);
