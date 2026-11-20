import { Router } from "express";
import { z } from "zod";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { broadcastRoomSessionRequest } from "../socket.js";
import { NotificationService } from "../services/notificationService.js";

export const roomSessionRequests = Router({ mergeParams: true });

async function needMember(roomId: string, userId: string) {
  const { data } = await admin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as { role: string };

  const { data: room } = await admin
    .from("rooms")
    .select("owner_id")
    .eq("id", roomId)
    .maybeSingle();
  if (room && room.owner_id === userId) {
    return { role: "owner" };
  }
  return null;
}

function leader(role?: string) {
  return role === "owner" || role === "admin" || role === "teacher" || role === "moderator";
}

// GET /api/v1/rooms/:id/session-requests - List all requests for this room
roomSessionRequests.get(
  "/",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) return res.status(403).json({ error: "Join room to view session requests" });

    const { data: requests, error } = await admin
      .from("room_session_requests")
      .select(`
        id, room_id, user_id, title, description, session_type, preferred_time, preferred_time_note,
        status, scheduled_session_id, poll_id, created_at, updated_at,
        profiles:user_id (id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const requestIds = (requests || []).map((r: any) => r.id);
    const upvotesMap: Record<string, { count: number; hasUpvoted: boolean }> = {};

    for (const id of requestIds) {
      upvotesMap[id] = { count: 0, hasUpvoted: false };
    }

    if (requestIds.length > 0) {
      const { data: upvotes } = await admin
        .from("room_session_request_upvotes")
        .select("request_id, user_id")
        .in("request_id", requestIds);

      for (const u of upvotes || []) {
        const entry = upvotesMap[u.request_id];
        if (entry) {
          entry.count++;
          if (u.user_id === userId) {
            entry.hasUpvoted = true;
          }
        }
      }
    }

    const normalized = (requests || []).map((r: any) => ({
      ...r,
      user: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
      upvotes_count: upvotesMap[r.id]?.count || 0,
      has_upvoted: upvotesMap[r.id]?.hasUpvoted || false,
    }));

    res.json({ requests: normalized });
  }),
);

// POST /api/v1/rooms/:id/session-requests - Submit a new session request
roomSessionRequests.post(
  "/",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) return res.status(403).json({ error: "Must be a room member to request a session" });

    const body = z
      .object({
        title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
        description: z.string().max(1000).optional().default(""),
        sessionType: z.enum(["voice", "offline", "video"]).default("video"),
        preferredTime: z.string().datetime().optional().nullable(),
        preferredTimeNote: z.string().max(200).optional().nullable(),
      })
      .parse(req.body);

    const { data: request, error } = await admin
      .from("room_session_requests")
      .insert({
        room_id: roomId,
        user_id: userId,
        title: body.title,
        description: body.description,
        session_type: body.sessionType,
        preferred_time: body.preferredTime || null,
        preferred_time_note: body.preferredTimeNote || null,
        status: "pending",
      })
      .select(`
        id, room_id, user_id, title, description, session_type, preferred_time, preferred_time_note,
        status, scheduled_session_id, poll_id, created_at, updated_at,
        profiles:user_id (id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    const normalized = {
      ...request,
      user: Array.isArray(request.profiles) ? request.profiles[0] : request.profiles,
      upvotes_count: 0,
      has_upvoted: false,
    };

    // Real-time broadcast to room
    broadcastRoomSessionRequest(roomId, "created", { request: normalized });

    // Notify room owner and teachers
    void (async () => {
      try {
        const [{ data: room }, { data: teachers }] = await Promise.all([
          admin.from("rooms").select("owner_id, title").eq("id", roomId).maybeSingle(),
          admin.from("room_members").select("user_id").eq("room_id", roomId).in("role", ["teacher", "moderator"]),
        ]);

        const recipients = new Set<string>();
        if (room?.owner_id && room.owner_id !== userId) recipients.add(room.owner_id);
        for (const t of teachers || []) {
          if (t.user_id !== userId) recipients.add(t.user_id);
        }

        const roomTitle = room?.title || "Study Room";
        for (const recipientId of recipients) {
          void NotificationService.dispatch({
            userId: recipientId,
            type: "ROOM_SESSION_REQUEST",
            title: "New Session Requested 💡",
            body: `A member requested "${body.title}" (${body.sessionType.toUpperCase()}) in ${roomTitle}.`,
            priority: "normal",
            entityType: "room",
            entityId: roomId,
            data: { roomId, requestId: request.id, route: "room" },
          });
        }
      } catch {}
    })();

    res.status(201).json({ request: normalized });
  }),
);

// POST /api/v1/rooms/:id/session-requests/:requestId/upvote - Upvote/un-upvote a request
roomSessionRequests.post(
  "/:requestId/upvote",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m) return res.status(403).json({ error: "Join room to upvote requests" });

    const { data: existing } = await admin
      .from("room_session_request_upvotes")
      .select("request_id")
      .eq("request_id", requestId)
      .eq("user_id", userId)
      .maybeSingle();

    let upvoted = false;
    if (existing) {
      await admin
        .from("room_session_request_upvotes")
        .delete()
        .eq("request_id", requestId)
        .eq("user_id", userId);
      upvoted = false;
    } else {
      await admin
        .from("room_session_request_upvotes")
        .insert({ request_id: requestId, user_id: userId });
      upvoted = true;
    }

    const { count } = await admin
      .from("room_session_request_upvotes")
      .select("user_id", { count: "exact", head: true })
      .eq("request_id", requestId);

    const upvotesCount = count ?? (upvoted ? 1 : 0);

    // Real-time broadcast
    broadcastRoomSessionRequest(roomId, "upvoted", {
      requestId,
      upvoted,
      upvotes_count: upvotesCount,
      user_id: userId,
    });

    res.json({ upvoted, upvotes_count: upvotesCount });
  }),
);

// PATCH /api/v1/rooms/:id/session-requests/:requestId - Leader approves, rejects, or converts to poll
roomSessionRequests.patch(
  "/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    const userId = req.userId!;

    const m = await needMember(roomId, userId);
    if (!m || !leader(m.role)) return res.status(403).json({ error: "Only leaders can manage session requests" });

    const body = z
      .object({
        status: z.enum(["pending", "approved", "rejected", "converted_to_poll"]),
        scheduledSessionId: z.string().uuid().optional().nullable(),
        pollId: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const { data: updated, error } = await admin
      .from("room_session_requests")
      .update({
        status: body.status,
        scheduled_session_id: body.scheduledSessionId || null,
        poll_id: body.pollId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("room_id", roomId)
      .select(`
        id, room_id, user_id, title, description, session_type, preferred_time, preferred_time_note,
        status, scheduled_session_id, poll_id, created_at, updated_at,
        profiles:user_id (id, full_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;

    const normalized = {
      ...updated,
      user: Array.isArray(updated.profiles) ? updated.profiles[0] : updated.profiles,
    };

    // Real-time broadcast
    broadcastRoomSessionRequest(roomId, "status_changed", {
      requestId,
      status: body.status,
      request: normalized,
    });

    // Notify requester
    if (updated.user_id && updated.user_id !== userId) {
      const statusText =
        body.status === "approved"
          ? "Approved & Scheduled 🚀"
          : body.status === "converted_to_poll"
          ? "Live Voting Started 📊"
          : "Declined";
      void NotificationService.dispatch({
        userId: updated.user_id,
        type: "ROOM_SESSION_REQUEST_UPDATE" as any,
        title: `Session Request ${statusText}`,
        body: `Your request "${updated.title}" was ${body.status.replace(/_/g, " ")}.`,
        priority: "normal",
        entityType: "room",
        entityId: roomId,
        data: { roomId, requestId, route: "room" },
      });
    }

    res.json({ request: normalized });
  }),
);

// DELETE /api/v1/rooms/:id/session-requests/:requestId - Delete a request
roomSessionRequests.delete(
  "/:requestId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const requestId = z.string().uuid().parse(req.params.requestId);
    const userId = req.userId!;

    const { data: reqItem } = await admin
      .from("room_session_requests")
      .select("user_id")
      .eq("id", requestId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!reqItem) return res.status(404).json({ error: "Request not found" });

    const m = await needMember(roomId, userId);
    const isAuthor = reqItem.user_id === userId;
    const isLeader = m && leader(m.role);

    if (!isAuthor && !isLeader) {
      return res.status(403).json({ error: "Unauthorized to delete this request" });
    }

    await admin.from("room_session_requests").delete().eq("id", requestId);

    // Real-time broadcast
    broadcastRoomSessionRequest(roomId, "deleted", { requestId });

    res.json({ success: true });
  }),
);
