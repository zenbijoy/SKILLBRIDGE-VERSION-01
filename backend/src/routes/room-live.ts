import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { env } from "../config/env.js";
import { admin } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { wrap } from "../middleware/error.js";
import { logger } from "../lib/logger.js";
import { audit } from "../services/audit.js";
import { roomLiveLimiter } from "../middleware/rateLimiters.js";
import { getSocketServer, roomPresenceRoom } from "../socket.js";
import { NotificationService } from "../services/notificationService.js";

export const roomLive = Router();

// Apply rate limiter to all room live endpoints
roomLive.use(roomLiveLimiter);

// 2-minute in-memory fallback cooldown for room live notifications
const roomNotificationCooldowns = new Map<string, number>();

async function canDispatchRoomNotification(roomId: string): Promise<boolean> {
  const key = `room:live:notif_cooldown:${roomId}`;
  if (redis) {
    try {
      const res = await redis.set(key, "1", "EX", 120, "NX");
      return res === "OK";
    } catch {
      // Fall through to in-memory fallback
    }
  }
  const last = roomNotificationCooldowns.get(roomId) || 0;
  if (Date.now() - last < 120_000) {
    return false;
  }
  roomNotificationCooldowns.set(roomId, Date.now());
  return true;
}

export function getRoomServiceClient(): RoomServiceClient | null {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    return null;
  }
  return new RoomServiceClient(
    env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
}

/**
 * Check if a user is a member of the room.
 * Auto-heals room owner membership if missing in room_members.
 */
export async function getRoomMembership(
  roomId: string,
  userId: string,
): Promise<{ isMember: boolean; role: string | null; isOwner: boolean }> {
  // Check room ownership first
  const { data: room } = await admin
    .from("rooms")
    .select("id, owner_id, visibility, knock_mode_enabled, is_locked")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    return { isMember: false, role: null, isOwner: false };
  }

  const isOwner = room.owner_id === userId;

  let { data: member } = await admin
    .from("room_members")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member && isOwner) {
    // Auto-heal owner membership
    const { data: healed } = await admin
      .from("room_members")
      .upsert({ room_id: roomId, user_id: userId, role: "owner" })
      .select("role")
      .single();
    member = healed || { role: "owner" };
  } else if (!member && room.visibility === "public" && !room.is_locked && !room.knock_mode_enabled) {
    // Auto-join open public room
    const { error: joinErr } = await admin.rpc("join_room_service_atomic", {
      p_room_id: roomId,
      p_user_id: userId,
    });
    if (!joinErr) {
      member = { role: "member" };
    }
  }

  return {
    isMember: Boolean(member),
    role: member?.role || (isOwner ? "owner" : null),
    isOwner,
  };
}

/**
 * Check if a user has study session creation privileges:
 * - Room owner (always allowed)
 * - Room teacher role
 * - Unexpired entry in room_study_permissions
 */
export async function checkStudySessionPermission(
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
  if (!isMember) return false;
  if (isOwner || role === "owner" || role === "teacher") return true;

  // Check room_study_permissions table
  const { data: perm } = await admin
    .from("room_study_permissions")
    .select("user_id, expires_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!perm) return false;
  if (perm.expires_at && new Date(perm.expires_at) <= new Date()) {
    return false;
  }
  return true;
}

export async function getAllRoomMemberIds(
  roomId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const memberIds: string[] = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = admin
      .from("room_members")
      .select("user_id")
      .eq("room_id", roomId)
      .range(from, from + pageSize - 1);

    if (excludeUserId) {
      query = query.neq("user_id", excludeUserId);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      break;
    }

    for (const row of data) {
      memberIds.push(row.user_id);
    }

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return memberIds;
}

export async function getRoomLiveStatusPayload(roomId: string, userId?: string) {
  // 1. Fetch active open session
  const { data: openSession } = await admin
    .from("room_open_sessions")
    .select("id, room_id, media, status, started_by, host_id, livekit_room, started_at, last_empty_at")
    .eq("room_id", roomId)
    .eq("status", "live")
    .maybeSingle();

  let openSessionPayload = null;
  if (openSession) {
    // Fetch active participants up to 12
    const { data: activeParticipants } = await admin
      .from("room_open_participants")
      .select("user_id, joined_at, is_host")
      .eq("session_id", openSession.id)
      .is("left_at", null)
      .order("joined_at", { ascending: true })
      .limit(12);

    const userIds = (activeParticipants || []).map((p) => p.user_id);
    let profilesMap = new Map<string, { full_name: string | null; username: string | null; avatar_url: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", userIds);

      for (const pr of profiles || []) {
        profilesMap.set(pr.id, pr);
      }
    }

    const { count: totalParticipants } = await admin
      .from("room_open_participants")
      .select("user_id", { count: "exact", head: true })
      .eq("session_id", openSession.id)
      .is("left_at", null);

    openSessionPayload = {
      id: openSession.id,
      roomId: openSession.room_id,
      media: openSession.media as "audio" | "video",
      status: openSession.status,
      hostId: openSession.host_id,
      startedBy: openSession.started_by,
      startedAt: openSession.started_at,
      participantCount: totalParticipants ?? activeParticipants?.length ?? 0,
      participants: (activeParticipants || []).map((p) => {
        const profile = profilesMap.get(p.user_id);
        return {
          userId: p.user_id,
          fullName: profile?.full_name || null,
          username: profile?.username || null,
          avatarUrl: profile?.avatar_url || null,
          isHost: p.is_host,
        };
      }),
    };
  }

  // 2. Fetch live or next scheduled study session
  const { data: studySessions } = await admin
    .from("sessions")
    .select("id, room_id, title, media, status, teacher_id, starts_at, ends_at")
    .eq("room_id", roomId)
    .in("status", ["live", "scheduled"])
    .order("starts_at", { ascending: true })
    .limit(1);

  const studySession = studySessions?.[0] || null;

  // Study window is active if study session is live or scheduled within next 2 minutes
  const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000);
  const studyWindowActive = Boolean(
    studySession &&
      (studySession.status === "live" ||
        (studySession.status === "scheduled" && new Date(studySession.starts_at) <= twoMinutesFromNow)),
  );

  let mePayload = null;
  if (userId) {
    const { isMember, role, isOwner } = await getRoomMembership(roomId, userId);
    const canStartStudy = await checkStudySessionPermission(roomId, userId);

    let canStartOpen = false;
    let reason: string | undefined;

    if (!isMember) {
      reason = "Membership required to participate in sessions";
    } else if (studyWindowActive) {
      reason = "A study session is currently live or scheduled to start within 2 minutes";
    } else if (openSessionPayload) {
      reason = "An open session is already in progress";
    } else {
      canStartOpen = true;
    }

    const canJoin = Boolean(
      isMember && (openSessionPayload || (studySession && (studySession.status === "live" || canStartStudy))),
    );

    mePayload = {
      canStartOpen,
      canStartStudy,
      canJoin,
      isMember,
      isOwner,
      role,
      reason,
    };
  }

  return {
    openSession: openSessionPayload,
    studySession: studySession
      ? {
          id: studySession.id,
          title: studySession.title,
          media: studySession.media as "audio" | "video",
          status: studySession.status,
          teacherId: studySession.teacher_id,
          startsAt: studySession.starts_at,
          endsAt: studySession.ends_at,
        }
      : null,
    studyWindow: {
      active: studyWindowActive,
      startsAt: studySession?.starts_at || null,
      endsAt: studySession?.ends_at || null,
    },
    participantCount: openSessionPayload?.participantCount || 0,
    participants: openSessionPayload?.participants || [],
    hostId: openSessionPayload?.hostId || null,
    media: openSessionPayload?.media || (studySession?.status === "live" ? (studySession.media as "audio" | "video") : null),
    me: mePayload,
  };
}

export async function broadcastRoomLiveStatus(roomId: string): Promise<void> {
  const io = getSocketServer();
  if (!io) return;
  try {
    const payload = await getRoomLiveStatusPayload(roomId);
    io.to(roomPresenceRoom(roomId)).emit("room:live:status", payload);
    io.emit("room:live:feed", {
      roomId,
      isLive: Boolean(payload.openSession || payload.studySession?.status === "live"),
      media: payload.media,
      kind: payload.studySession?.status === "live" ? "study" : (payload.openSession ? "open" : null),
      participantCount: payload.participantCount,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, roomId }, "Failed to broadcast room:live:status");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/rooms/:id/live/status
// Comprehensive status of live open and study sessions in this room.
// ─────────────────────────────────────────────────────────────────────────────
roomLive.get(
  "/:id/live/status",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const payload = await getRoomLiveStatusPayload(roomId, userId);
    res.json(payload);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/v1/rooms/:id/live/open
// Starts or idempotently joins an open audio/video session.
// ─────────────────────────────────────────────────────────────────────────────
const openSessionSchema = z.object({
  media: z.enum(["audio", "video"]).default("audio"),
});

roomLive.post(
  "/:id/live/open",
  wrap(async (req: Request, res: Response) => {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      return res.status(503).json({
        error: "LiveKit service is not configured",
        code: "LIVEKIT_NOT_CONFIGURED",
      });
    }

    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = openSessionSchema.parse(req.body || {});

    const { isMember, role } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({
        error: "Join the learning room first to start a session",
        code: "MEMBERSHIP_REQUIRED",
        roomId,
      });
    }

    // Call atomic RPC
    const { data: rawResult, error: rpcErr } = await admin.rpc("start_open_session_atomic", {
      p_room_id: roomId,
      p_user_id: userId,
      p_media: body.media,
    });

    if (rpcErr) {
      if (rpcErr.message.includes("SB004")) {
        return res.status(409).json({
          error: "Cannot start open session: a study session is currently live or starts soon",
          code: "STUDY_SESSION_ACTIVE",
        });
      }
      logger.error({ event: "start_open_session_atomic_failed", roomId, userId, err: rpcErr.message }, "RPC failed");
      return res.status(400).json({ error: rpcErr.message, code: "RPC_ERROR" });
    }

    const result = rawResult as {
      session_id: string;
      room_id: string;
      media: "audio" | "video";
      status: string;
      host_id: string;
      started_by: string;
      livekit_room: string;
      started_at: string;
      already_live?: boolean;
    };

    // Enrich participant info for LiveKit token
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    const participantName = profile?.full_name || (profile?.username ? `@${profile.username}` : userId);
    const isHost = result.host_id === userId;

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      name: participantName,
      ttl: "4h",
      metadata: JSON.stringify({
        kind: "open",
        openSessionId: result.session_id,
        roomId: result.room_id,
        media: result.media,
        role: role || "member",
        isHost,
        fullName: profile?.full_name || null,
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: result.livekit_room,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources:
        result.media === "audio"
          ? [TrackSource.MICROPHONE]
          : [
              TrackSource.CAMERA,
              TrackSource.MICROPHONE,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
    });

    const token = await at.toJwt();

    // Broadcast socket event to room presence room
    const io = getSocketServer();
    if (io) {
      io.to(roomPresenceRoom(roomId)).emit(result.already_live ? "room:live:participants" : "room:live:started", {
        roomId,
        openSessionId: result.session_id,
        media: result.media,
        hostId: result.host_id,
        status: "live",
      });
      // Lightweight feed event for room cards
      io.emit("room:live:feed", {
        roomId,
        isLive: true,
        media: result.media,
        sessionId: result.session_id,
      });
    }

    // If newly started session, dispatch notifications to all room members
    if (!result.already_live) {
      void (async () => {
        try {
          const canSend = await canDispatchRoomNotification(roomId);
          if (!canSend) return;

          const [{ data: roomData }, memberIds] = await Promise.all([
            admin.from("rooms").select("title").eq("id", roomId).maybeSingle(),
            getAllRoomMemberIds(roomId, userId),
          ]);

          const roomTitle = roomData?.title || "Learning Space";
          const mediaLabel = result.media === "audio" ? "Audio Room" : "Video Session";

          for (const memberId of memberIds) {
            void NotificationService.dispatch({
              userId: memberId,
              type: "ROOM_LIVE_OPEN_STARTED",
              title: `Live ${mediaLabel} Started 🎙️`,
              body: `${participantName} started an open ${result.media} session in "${roomTitle}". Tap to join!`,
              priority: "high",
              entityType: "room",
              entityId: roomId,
              data: {
                roomId,
                openSessionId: result.session_id,
                media: result.media,
                route: "room",
              },
            });
          }
        } catch (notifErr) {
          logger.warn({ err: (notifErr as Error).message, roomId }, "Failed dispatching open session notifications");
        }
      })();

      void audit(userId, "room:open_session_started", "room_open_session", result.session_id, {
        roomId,
        media: result.media,
      });
    }

    void broadcastRoomLiveStatus(roomId);

    res.json({
      session: {
        id: result.session_id,
        roomId: result.room_id,
        media: result.media,
        status: result.status,
        hostId: result.host_id,
        startedBy: result.started_by,
        startedAt: result.started_at,
      },
      alreadyLive: Boolean(result.already_live),
      token,
      url: env.LIVEKIT_URL,
      roomName: result.livekit_room,
      isHost,
      media: result.media,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/v1/rooms/:id/live/:sessionId/token
// Canonical token endpoint for an existing open session or study session.
// ─────────────────────────────────────────────────────────────────────────────
roomLive.post(
  "/:id/live/:sessionId/token",
  wrap(async (req: Request, res: Response) => {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      return res.status(503).json({
        error: "LiveKit service is not configured",
        code: "LIVEKIT_NOT_CONFIGURED",
      });
    }

    const roomId = z.string().uuid().parse(req.params.id);
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const userId = req.userId!;

    const { isMember, role } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({
        error: "Join the learning room first",
        code: "MEMBERSHIP_REQUIRED",
        roomId,
      });
    }

    // Check if sessionId is an open session
    const { data: openSession } = await admin
      .from("room_open_sessions")
      .select("id, room_id, media, status, host_id, livekit_room")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (openSession) {
      if (openSession.status !== "live") {
        return res.status(403).json({ error: "Session has ended", code: "SESSION_ENDED" });
      }

      // Record join in atomic RPC
      await admin.rpc("join_open_session_atomic", {
        p_session_id: openSession.id,
        p_user_id: userId,
      });

      const io = getSocketServer();
      if (io) {
        io.to(roomPresenceRoom(roomId)).emit("room:live:participants", {
          roomId,
          sessionId: openSession.id,
          action: "joined",
          userId,
        });
      }
      void broadcastRoomLiveStatus(roomId);

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      const participantName = profile?.full_name || (profile?.username ? `@${profile.username}` : userId);
      const isHost = openSession.host_id === userId;

      const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: userId,
        name: participantName,
        ttl: "4h",
        metadata: JSON.stringify({
          kind: "open",
          openSessionId: openSession.id,
          roomId: openSession.room_id,
          media: openSession.media,
          role: role || "member",
          isHost,
          fullName: profile?.full_name || null,
          username: profile?.username || null,
          avatarUrl: profile?.avatar_url || null,
        }),
      });

      at.addGrant({
        roomJoin: true,
        room: openSession.livekit_room,
        canSubscribe: true,
        canPublish: true,
        canPublishData: true,
        canPublishSources:
          openSession.media === "audio"
            ? [TrackSource.MICROPHONE]
            : [
                TrackSource.CAMERA,
                TrackSource.MICROPHONE,
                TrackSource.SCREEN_SHARE,
                TrackSource.SCREEN_SHARE_AUDIO,
              ],
      });

      return res.json({
        url: env.LIVEKIT_URL,
        token: await at.toJwt(),
        sessionId: openSession.id,
        roomName: openSession.livekit_room,
        participantName,
        isHost,
        media: openSession.media,
        kind: "open",
      });
    }

    // Check if sessionId is a study session in sessions table
    const { data: studySession } = await admin
      .from("sessions")
      .select("id, room_id, title, media, status, teacher_id, starts_at, ends_at")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!studySession) {
      return res.status(404).json({ error: "Session not found", code: "NOT_FOUND" });
    }

    if (["completed", "cancelled"].includes(studySession.status)) {
      return res.status(403).json({ error: `Cannot join session in ${studySession.status} state` });
    }

    const isHost = ["owner", "teacher", "moderator"].includes(role || "") || studySession.teacher_id === userId;
    if (studySession.status === "scheduled" && isHost) {
      await admin.from("sessions").update({ status: "live" }).eq("id", studySession.id);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    const participantName = profile?.full_name || (profile?.username ? `@${profile.username}` : userId);
    const roomName = `skillbridge-session-${studySession.id}`;

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      name: participantName,
      ttl: "4h",
      metadata: JSON.stringify({
        kind: "study",
        sessionId: studySession.id,
        roomId: studySession.room_id,
        role: role || "member",
        isHost,
        fullName: profile?.full_name || null,
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources:
        studySession.media === "audio"
          ? [TrackSource.MICROPHONE]
          : [
              TrackSource.CAMERA,
              TrackSource.MICROPHONE,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
    });

    res.json({
      url: env.LIVEKIT_URL,
      token: await at.toJwt(),
      sessionId: studySession.id,
      roomName,
      participantName,
      isHost,
      media: studySession.media || "video",
      kind: "study",
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/v1/rooms/:id/live/:sessionId/leave
// Explicit participant leave from an open session.
// ─────────────────────────────────────────────────────────────────────────────
roomLive.post(
  "/:id/live/:sessionId/leave",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const userId = req.userId!;

    const { data: rawResult, error } = await admin.rpc("leave_open_session_atomic", {
      p_session_id: sessionId,
      p_user_id: userId,
    });

    if (error) {
      logger.error({ event: "leave_open_session_atomic_failed", sessionId, userId, err: error.message }, "Leave RPC error");
      return res.status(400).json({ error: error.message });
    }

    const result = rawResult as {
      host_transferred?: boolean;
      new_host_id?: string | null;
      remaining_participants: number;
    };

    const io = getSocketServer();
    if (io) {
      if (result.host_transferred && result.new_host_id) {
        io.to(roomPresenceRoom(roomId)).emit("room:live:host_changed", {
          roomId,
          sessionId,
          newHostId: result.new_host_id,
        });
      }
      io.to(roomPresenceRoom(roomId)).emit("room:live:participants", {
        roomId,
        sessionId,
        remainingParticipants: result.remaining_participants,
      });
    }

    void broadcastRoomLiveStatus(roomId);

    res.json({ success: true, ...result });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/v1/rooms/:id/live/:sessionId/end
// Host / Owner / Moderator ends an open session or study session.
// ─────────────────────────────────────────────────────────────────────────────
roomLive.post(
  "/:id/live/:sessionId/end",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const userId = req.userId!;

    const { role, isOwner } = await getRoomMembership(roomId, userId);

    // Check open session
    const { data: openSession } = await admin
      .from("room_open_sessions")
      .select("id, host_id, livekit_room, status")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (openSession) {
      const canEnd = isOwner || role === "moderator" || role === "teacher" || openSession.host_id === userId;
      if (!canEnd) {
        return res.status(403).json({ error: "Only the session host, room owner, or moderator may end the session" });
      }

      await admin
        .from("room_open_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), end_reason: "host_ended" })
        .eq("id", sessionId);

      await admin
        .from("room_open_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .is("left_at", null);

      const client = getRoomServiceClient();
      if (client) {
        await client.deleteRoom(openSession.livekit_room).catch((err) => {
          logger.warn({ event: "livekit_delete_room_failed", room: openSession.livekit_room, err: err.message }, "LiveKit delete failed");
        });
      }

      const io = getSocketServer();
      if (io) {
        io.to(roomPresenceRoom(roomId)).emit("room:live:ended", {
          roomId,
          sessionId,
          reason: "host_ended",
        });
        io.emit("room:live:feed", {
          roomId,
          isLive: false,
        });
      }

      void broadcastRoomLiveStatus(roomId);
      void audit(userId, "room:open_session_ended", "room_open_session", sessionId, { roomId });
      return res.json({ success: true, endedSessionId: sessionId });
    }

    // Check study session
    const { data: studySession } = await admin
      .from("sessions")
      .select("id, teacher_id, status")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (studySession) {
      const canEnd = isOwner || role === "moderator" || role === "teacher" || studySession.teacher_id === userId;
      if (!canEnd) {
        return res.status(403).json({ error: "Only session host, teacher, or moderator may end study session" });
      }

      await admin
        .from("sessions")
        .update({ status: "completed", ends_at: new Date().toISOString() })
        .eq("id", sessionId);

      const client = getRoomServiceClient();
      if (client) {
        await client.deleteRoom(`skillbridge-session-${sessionId}`).catch(() => {});
      }

      const io = getSocketServer();
      if (io) {
        io.to(roomPresenceRoom(roomId)).emit("room:live:ended", {
          roomId,
          sessionId,
          reason: "study_completed",
        });
        io.emit("room:live:feed", {
          roomId,
          isLive: false,
        });
      }

      void broadcastRoomLiveStatus(roomId);
      void audit(userId, "room:study_session_ended", "session", sessionId, { roomId });
      return res.json({ success: true, endedSessionId: sessionId });
    }

    res.status(404).json({ error: "Session not found" });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. STUDY SESSIONS: GET, POST, PATCH, DELETE /api/v1/rooms/:id/study-sessions
// ─────────────────────────────────────────────────────────────────────────────
roomLive.get(
  "/:id/study-sessions",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { isMember } = await getRoomMembership(roomId, userId);
    if (!isMember) {
      return res.status(403).json({ error: "Join room to view study sessions" });
    }

    const { data: sessions, error } = await admin
      .from("sessions")
      .select(`
        id, room_id, title, media, mode, status, starts_at, ends_at, teacher_id, created_by,
        profiles:teacher_id (id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId)
      .order("starts_at", { ascending: false });

    if (error) throw error;
    res.json({ sessions: sessions || [] });
  }),
);

const createStudySessionSchema = z.object({
  title: z.string().min(2).max(200),
  media: z.enum(["audio", "video"]).default("video"),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  startNow: z.boolean().default(false),
});

roomLive.post(
  "/:id/study-sessions",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = createStudySessionSchema.parse(req.body);

    const hasPermission = await checkStudySessionPermission(roomId, userId);
    if (!hasPermission) {
      return res.status(403).json({
        error: "You do not have permission to create study sessions in this room. Contact the room owner.",
        code: "PERMISSION_DENIED",
      });
    }

    if (body.startNow) {
      // Start study session immediately via atomic RPC (which terminates live open sessions)
      const { data: rawResult, error: rpcErr } = await admin.rpc("start_study_session_atomic", {
        p_room_id: roomId,
        p_user_id: userId,
        p_title: body.title,
        p_media: body.media,
        p_starts_at: body.startsAt || new Date().toISOString(),
        p_ends_at: body.endsAt || null,
      });

      if (rpcErr) {
        logger.error({ event: "start_study_session_atomic_failed", err: rpcErr.message }, "RPC error");
        return res.status(400).json({ error: rpcErr.message });
      }

      const result = rawResult as {
        session_id: string;
        room_id: string;
        title: string;
        media: "audio" | "video";
        status: string;
        teacher_id: string;
        ended_open_sessions?: Array<{ session_id: string; livekit_room: string }>;
      };

      if (!result) {
        return res.status(500).json({ error: "Failed to initialize study session" });
      }

      // Clean up any ended open sessions from LiveKit SFU
      const client = getRoomServiceClient();
      if (client && result.ended_open_sessions) {
        for (const eos of result.ended_open_sessions) {
          await client.deleteRoom(eos.livekit_room).catch(() => {});
        }
      }

      // Realtime alerts: notify open session users that open session was ended because a study session started
      const io = getSocketServer();
      if (io) {
        io.to(roomPresenceRoom(roomId)).emit("room:live:ended", {
          roomId,
          reason: "study_session_started",
          nextStudySessionId: result.session_id,
        });
        io.to(roomPresenceRoom(roomId)).emit("room:live:started", {
          roomId,
          studySessionId: result.session_id,
          title: result.title,
          media: result.media,
          teacherId: result.teacher_id,
          status: "live",
        });
        io.emit("room:live:feed", {
          roomId,
          isLive: true,
          media: result.media,
          studySessionId: result.session_id,
        });
      }

      // Notify room members
      void (async () => {
        try {
          const [{ data: roomData }, memberIds] = await Promise.all([
            admin.from("rooms").select("title").eq("id", roomId).maybeSingle(),
            getAllRoomMemberIds(roomId, userId),
          ]);
          const roomTitle = roomData?.title || "Study Room";
          for (const memberId of memberIds) {
            void NotificationService.dispatch({
              userId: memberId,
              type: "ROOM_STUDY_STARTED",
              title: "Study Session Live 🎓",
              body: `"${result.title}" has started in ${roomTitle}. Tap to join!`,
              priority: "high",
              entityType: "room",
              entityId: roomId,
              data: {
                roomId,
                studySessionId: result.session_id,
                route: "room",
              },
            });
          }
        } catch {}
      })();

      void broadcastRoomLiveStatus(roomId);
      void audit(userId, "room:study_session_started_now", "session", result.session_id, { roomId, title: result.title });
      return res.status(201).json({ session: result });
    }

    // Schedule study session for future
    const startsAt = body.startsAt || new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: newSession, error: insertErr } = await admin
      .from("sessions")
      .insert({
        room_id: roomId,
        teacher_id: userId,
        created_by: userId,
        title: body.title,
        media: body.media,
        mode: "online",
        status: "scheduled",
        starts_at: startsAt,
        ends_at: body.endsAt || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    void broadcastRoomLiveStatus(roomId);
    void audit(userId, "room:study_session_scheduled", "session", newSession.id, { roomId, title: body.title, startsAt });
    res.status(201).json({ session: newSession });
  }),
);

roomLive.patch(
  "/:id/study-sessions/:sessionId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const userId = req.userId!;

    const { isOwner, role } = await getRoomMembership(roomId, userId);

    const { data: existing } = await admin
      .from("sessions")
      .select("id, teacher_id, created_by")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Session not found" });

    const canEdit = isOwner || role === "teacher" || role === "moderator" || existing.created_by === userId || existing.teacher_id === userId;
    if (!canEdit) return res.status(403).json({ error: "Unauthorized to edit this study session" });

    const patchSchema = z.object({
      title: z.string().min(2).max(200).optional(),
      media: z.enum(["audio", "video"]).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional().nullable(),
      status: z.enum(["scheduled", "live", "completed", "cancelled"]).optional(),
    });

    const body = patchSchema.parse(req.body);
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.media !== undefined) updates.media = body.media;
    if (body.startsAt !== undefined) updates.starts_at = body.startsAt;
    if (body.endsAt !== undefined) updates.ends_at = body.endsAt;
    if (body.status !== undefined) updates.status = body.status;

    const { data: updated, error } = await admin
      .from("sessions")
      .update(updates)
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw error;
    void broadcastRoomLiveStatus(roomId);
    res.json({ session: updated });
  }),
);

roomLive.delete(
  "/:id/study-sessions/:sessionId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const userId = req.userId!;

    const { isOwner, role } = await getRoomMembership(roomId, userId);

    const { data: existing } = await admin
      .from("sessions")
      .select("id, teacher_id, created_by, status")
      .eq("id", sessionId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Session not found" });

    const canDelete = isOwner || role === "teacher" || role === "moderator" || existing.created_by === userId;
    if (!canDelete) return res.status(403).json({ error: "Unauthorized to cancel this study session" });

    await admin.from("sessions").update({ status: "cancelled", ends_at: new Date().toISOString() }).eq("id", sessionId);

    const client = getRoomServiceClient();
    if (client) {
      await client.deleteRoom(`skillbridge-session-${sessionId}`).catch(() => {});
    }

    void broadcastRoomLiveStatus(roomId);
    res.json({ success: true, cancelledSessionId: sessionId });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. STUDY PERMISSIONS: GET, PUT, DELETE /api/v1/rooms/:id/study-permissions[/:userId]
// ─────────────────────────────────────────────────────────────────────────────
roomLive.get(
  "/:id/study-permissions",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { isOwner, role } = await getRoomMembership(roomId, userId);
    if (!isOwner && role !== "moderator" && role !== "teacher") {
      return res.status(403).json({ error: "Only room admins can manage study permissions" });
    }

    const { data: perms, error } = await admin
      .from("room_study_permissions")
      .select(`
        room_id, user_id, granted_by, granted_at, expires_at,
        profiles:user_id (id, full_name, username, avatar_url)
      `)
      .eq("room_id", roomId);

    if (error) throw error;
    res.json({ permissions: perms || [] });
  }),
);

const grantStudyPermissionSchema = z.object({
  expiresAt: z.string().datetime().optional().nullable(),
});

roomLive.put(
  "/:id/study-permissions/:targetUserId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.targetUserId);
    const userId = req.userId!;
    const body = grantStudyPermissionSchema.parse(req.body || {});

    const { isOwner } = await getRoomMembership(roomId, userId);
    if (!isOwner) {
      return res.status(403).json({ error: "Only the room owner can grant study session permissions" });
    }

    const { data: perm, error } = await admin
      .from("room_study_permissions")
      .upsert(
        {
          room_id: roomId,
          user_id: targetUserId,
          granted_by: userId,
          granted_at: new Date().toISOString(),
          expires_at: body.expiresAt || null,
        },
        { onConflict: "room_id,user_id" },
      )
      .select()
      .single();

    if (error) throw error;

    // Notify granted user
    void (async () => {
      try {
        const { data: roomData } = await admin.from("rooms").select("title").eq("id", roomId).maybeSingle();
        void NotificationService.dispatch({
          userId: targetUserId,
          type: "ROOM_STUDY_PERMISSION_GRANTED",
          title: "Study Session Permission Granted 🎓",
          body: `You have been granted permission to host study sessions in "${roomData?.title || "Study Room"}".`,
          entityType: "room",
          entityId: roomId,
          data: { roomId, route: "room" },
        });
      } catch {}
    })();

    void broadcastRoomLiveStatus(roomId);
    void audit(userId, "room:study_permission_granted", "room_study_permission", targetUserId, { roomId });
    res.json({ success: true, permission: perm });
  }),
);

roomLive.delete(
  "/:id/study-permissions/:targetUserId",
  wrap(async (req: Request, res: Response) => {
    const roomId = z.string().uuid().parse(req.params.id);
    const targetUserId = z.string().uuid().parse(req.params.targetUserId);
    const userId = req.userId!;

    const { isOwner } = await getRoomMembership(roomId, userId);
    if (!isOwner) {
      return res.status(403).json({ error: "Only the room owner can revoke study session permissions" });
    }

    const { error } = await admin
      .from("room_study_permissions")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", targetUserId);

    if (error) throw error;

    void broadcastRoomLiveStatus(roomId);
    void audit(userId, "room:study_permission_revoked", "room_study_permission", targetUserId, { roomId });
    res.json({ success: true });
  }),
);
