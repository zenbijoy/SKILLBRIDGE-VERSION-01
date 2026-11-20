import type { Server as SocketServer } from "socket.io";
import { admin } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { redis } from "./lib/redis.js";
import {
  getUserPrivacySettings,
  filterVisiblePresence,
  updateUserPrivacySettings,
} from "./services/privacyService.js";
import { getRoomLiveStatusPayload } from "./routes/room-live.js";
import { ensureConversationMember } from "./lib/chatAccess.js";

/**
 * Lightweight real-time presence bus.
 *
 * LiveKit webhooks (join/leave) have no access to the Socket.IO server instance,
 * so we keep a module-level reference that setupSocket() registers at boot.
 * Room subscribers receive `room:presence` events with the live participant count.
 */
let ioRef: SocketServer | null = null;

export function registerSocketServer(io: SocketServer): void {
  ioRef = io;
}

export function getSocketServer(): SocketServer | null {
  return ioRef;
}

export const roomPresenceRoom = (roomId: string) => `room:${roomId}`;
export const sessionPresenceRoom = (sessionId: string) => `session:${sessionId}`;
export const clubRoom = (clubId: string) => `club:${clubId}`;

export function emitClubEvent(
  clubId: string,
  event: string,
  payload: Record<string, any>,
): void {
  if (!ioRef) return;
  try {
    ioRef.to(clubRoom(clubId)).emit(event, { ...payload, clubId });
  } catch (err) {
    logger.warn(
      { event: "club_emit_failed", clubId, err: (err as Error).message },
      "Club socket event broadcast failed",
    );
  }
}

/**
 * Broadcast the current live participant count to everyone watching the room.
 * Silently no-ops when no socket server is registered (e.g. in tests).
 */
export function broadcastRoomPresence(
  roomId: string,
  payload: {
    sessionId: string | null;
    liveParticipantCount: number;
    isLive: boolean;
  },
): void {
  if (!ioRef) return;
  try {
    ioRef.to(roomPresenceRoom(roomId)).emit("room:presence", payload);
    if (payload.sessionId) {
      ioRef
        .to(sessionPresenceRoom(payload.sessionId))
        .emit("session:presence", payload);
    }
  } catch (err) {
    logger.warn(
      { event: "presence_broadcast_failed", roomId, err: (err as Error).message },
      "Failed to broadcast room presence",
    );
  }
}

/**
 * Broadcast real-time Q&A actions (new questions, votes, status changes) to everyone watching the room.
 */
export function broadcastRoomQA(
  roomId: string,
  event: "new" | "voted" | "resolved" | "stage_status",
  payload: Record<string, any>,
): void {
  if (!ioRef) return;
  try {
    ioRef.to(roomPresenceRoom(roomId)).emit(`room:qa:${event}`, { ...payload, roomId });
  } catch (err) {
    logger.warn(
      { event: "qa_broadcast_failed", roomId, qaEvent: event, err: (err as Error).message },
      "Failed to broadcast room Q&A update",
    );
  }
}

/**
 * Broadcast real-time Poll events (created, voted, closed, deleted) to everyone in the room.
 */
export function broadcastRoomPoll(
  roomId: string,
  event: "created" | "voted" | "closed" | "deleted",
  payload: Record<string, any>,
): void {
  if (!ioRef) return;
  try {
    ioRef.to(roomPresenceRoom(roomId)).emit(`room:poll:${event}`, { ...payload, roomId });
    ioRef.to(roomPresenceRoom(roomId)).emit("room:poll:updated", { ...payload, roomId, event });
  } catch (err) {
    logger.warn(
      { event: "poll_broadcast_failed", roomId, pollEvent: event, err: (err as Error).message },
      "Failed to broadcast room poll update",
    );
  }
}

/**
 * Broadcast real-time Member Session Requests (created, upvoted, status_changed, deleted).
 */
export function broadcastRoomSessionRequest(
  roomId: string,
  event: "created" | "upvoted" | "status_changed" | "deleted",
  payload: Record<string, any>,
): void {
  if (!ioRef) return;
  try {
    ioRef.to(roomPresenceRoom(roomId)).emit(`room:session_request:${event}`, { ...payload, roomId });
    ioRef.to(roomPresenceRoom(roomId)).emit("room:session_request:updated", { ...payload, roomId, event });
  } catch (err) {
    logger.warn(
      { event: "session_request_broadcast_failed", roomId, reqEvent: event, err: (err as Error).message },
      "Failed to broadcast room session request update",
    );
  }
}

/**
 * Broadcast real-time Room Sessions (created, updated, deleted).
 */
export function broadcastRoomSession(
  roomId: string,
  event: "created" | "updated" | "deleted",
  payload: Record<string, any>,
): void {
  if (!ioRef) return;
  try {
    ioRef.to(roomPresenceRoom(roomId)).emit(`room:session:${event}`, { ...payload, roomId });
    ioRef.to(roomPresenceRoom(roomId)).emit("room:session:updated", { ...payload, roomId, event });
  } catch (err) {
    logger.warn(
      { event: "session_broadcast_failed", roomId, sessionEvent: event, err: (err as Error).message },
      "Failed to broadcast room session update",
    );
  }
}

export const userConnections = new Map<string, number>();

// In-memory per-socket rate limiter for signaling abuse protection
const socketRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkSignalingRateLimit(socketId: string, limit = 150, windowMs = 10000): boolean {
  const now = Date.now();
  const entry = socketRateLimits.get(socketId);
  if (!entry || now > entry.resetAt) {
    socketRateLimits.set(socketId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

// In-memory call peer authorization cache for instant sub-millisecond lookup
export const callPeerCache = new Map<string, { callerId: string; calleeId: string; expiresAt: number }>();

// Server-side call signaling buffer (Bug 3: prevents dropped offer/ICE during navigation)
export interface BufferedCallSignaling {
  offer?: any;
  candidates: any[];
  createdAt: number;
}

export const callSignalingBuffer = new Map<string, BufferedCallSignaling>();

// Multi-party Room WebRTC Mesh Peer Model
export interface RoomWebRTCPeer {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: string;
  media: "audio" | "video";
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeaking: boolean;
  isHandRaised: boolean;
  joinedAt: number;
}

// Map<roomId, Map<socketId, RoomWebRTCPeer>>
export const roomWebRTCParticipants = new Map<string, Map<string, RoomWebRTCPeer>>();

// Live Poll Model
export interface RoomLivePoll {
  id: string;
  roomId: string;
  question: string;
  options: { id: number; text: string; votes: number }[];
  voters: Record<string, number>; // userId -> optionId
  creatorName: string;
  isOpen: boolean;
  createdAt: number;
}
export const roomLivePolls = new Map<string, RoomLivePoll>();

// Shared Stage Resources Model
export interface RoomSharedResource {
  id: string;
  roomId: string;
  title: string;
  url: string;
  type: "link" | "doc" | "pdf" | "code";
  sharedByName: string;
  sharedByAvatar?: string | null;
  timestamp: number;
}
export const roomSharedResources = new Map<string, RoomSharedResource[]>();

// Clean up stale buffered call signaling entries older than 30 seconds
const SIGNALING_BUFFER_TTL_MS = 30_000;
const signalingCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [callId, entry] of callSignalingBuffer.entries()) {
    if (now - entry.createdAt > SIGNALING_BUFFER_TTL_MS) {
      callSignalingBuffer.delete(callId);
    }
  }
}, 15_000);
if (typeof signalingCleanupTimer.unref === "function") {
  signalingCleanupTimer.unref();
}

export function setupSocket(io: SocketServer) {
  // Make the server instance reachable from webhook-driven presence broadcasts.
  registerSocketServer(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== "string") return next(new Error("unauthorized"));
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return next(new Error("unauthorized"));

      const { data: p } = await admin
        .from("profiles")
        .select("account_status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (p && (p.account_status === "suspended" || p.account_status === "banned")) {
        return next(new Error(`Account is ${p.account_status}`));
      }

      socket.data.userId = data.user.id;
      next();
    } catch (e) {
      next(e as Error);
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);

    const count = (userConnections.get(userId) || 0) + 1;
    userConnections.set(userId, count);

    if (count === 1) {
      getUserPrivacySettings(userId)
        .then((priv) => {
          if (priv.presence_visibility !== "nobody") {
            socket.broadcast.emit("user:online", { userId });
          }
        })
        .catch(() => {
          socket.broadcast.emit("user:online", { userId });
        });
    }

    socket.on("disconnect", () => {
      socketRateLimits.delete(socket.id);
      const newCount = (userConnections.get(userId) || 1) - 1;
      if (newCount === 0) {
        userConnections.delete(userId);
        getUserPrivacySettings(userId)
          .then((priv) => {
            if (priv.presence_visibility !== "nobody") {
              socket.broadcast.emit("user:offline", { userId });
            }
          })
          .catch(() => {
            socket.broadcast.emit("user:offline", { userId });
          });
      } else {
        userConnections.set(userId, newCount);
      }

      // Auto-cleanup any Room WebRTC Participation upon disconnect
      for (const [roomId, peers] of roomWebRTCParticipants.entries()) {
        if (peers.has(socket.id)) {
          peers.delete(socket.id);
          const count = peers.size;
          io.to(`room:${roomId}:webrtc`).emit("room:webrtc:peer-left", {
            socketId: socket.id,
            userId,
            participantCount: count,
          });
          io.to(roomPresenceRoom(roomId)).emit("room:presence", {
            sessionId: roomId,
            liveParticipantCount: count,
            isLive: count > 0,
          });
          if (count === 0) {
            roomWebRTCParticipants.delete(roomId);
          }
        }
      }
    });

    const handleJoin = async (payload: any) => {
      const convId = payload?.conversationId || payload?.conversation_id;
      if (typeof convId !== "string" || !socket.data.userId) return;
      const access = await ensureConversationMember(convId, socket.data.userId);
      if (access.allowed) {
        socket.join(`conversation:${convId}`);
      }
    };

    const handleLeave = (payload: any) => {
      const convId = payload?.conversationId || payload?.conversation_id;
      if (typeof convId === "string") socket.leave(`conversation:${convId}`);
    };

    socket.on("conversation:join", handleJoin);
    socket.on("join_conversation", handleJoin);
    socket.on("conversation:leave", handleLeave);
    socket.on("leave_conversation", handleLeave);

    // ── Room presence (live classroom participant count) ────────────────────
    const handleRoomSubscribe = async (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      if (typeof roomId !== "string") return;

      // Only room members (or the public room itself) may observe presence.
      const { data: membership } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", socket.data.userId)
        .maybeSingle();

      const { data: room } = await admin
        .from("rooms")
        .select("id, visibility")
        .eq("id", roomId)
        .maybeSingle();

      if (!room) return;
      if (membership) {
        socket.join(roomPresenceRoom(roomId));
      } else if (room.visibility === "public") {
        socket.join(roomPresenceRoom(roomId));
      } else {
        return;
      }

      // Send the authoritative room:live:status snapshot immediately
      try {
        const liveStatus = await getRoomLiveStatusPayload(roomId, socket.data.userId);
        socket.emit("room:live:status", liveStatus);
      } catch (e) {
        logger.warn({ err: (e as Error).message, roomId }, "Failed to compute room:live:status snapshot");
      }

      // Send the legacy room:presence snapshot so existing clients never break
      const { data: liveSession } = await admin
        .from("sessions")
        .select("id")
        .eq("room_id", roomId)
        .eq("status", "live")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let count = 0;
      if (liveSession) {
        const { count: c } = await admin
          .from("livekit_attendance")
          .select("id", { count: "exact", head: true })
          .eq("session_id", liveSession.id)
          .is("left_at", null);
        count = c ?? 0;
      }
      socket.emit("room:presence", {
        sessionId: liveSession?.id ?? null,
        liveParticipantCount: count,
        isLive: Boolean(liveSession),
      });
    };

    const handleRoomUnsubscribe = (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      if (typeof roomId === "string") socket.leave(roomPresenceRoom(roomId));
    };

    socket.on("room:presence:subscribe", handleRoomSubscribe);
    socket.on("room:subscribe", handleRoomSubscribe);
    socket.on("room:presence:unsubscribe", handleRoomUnsubscribe);
    socket.on("room:unsubscribe", handleRoomUnsubscribe);

    // ── Club real-time room subscribers ─────────────────────────────────────
    socket.on("club:join", (payload: any) => {
      const clubId = payload?.clubId || payload?.club_id;
      if (typeof clubId === "string") {
        socket.join(clubRoom(clubId));
      }
    });

    socket.on("club:leave", (payload: any) => {
      const clubId = payload?.clubId || payload?.club_id;
      if (typeof clubId === "string") {
        socket.leave(clubRoom(clubId));
      }
    });

    socket.on("room:join", (payload: any) => {
      const room = payload?.room;
      if (typeof room === "string") {
        socket.join(room);
      }
    });

    socket.on("room:leave", (payload: any) => {
      const room = payload?.room;
      if (typeof room === "string") {
        socket.leave(room);
      }
    });

    // ── Voice lounge real-time room subscribers & state sync (Shimmed for legacy clients) ──
    socket.on("room:voice:join", async (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      if (typeof roomId !== "string") return;
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", socket.data.userId)
        .maybeSingle();
      if (!member) return;

      const voiceRoom = `room:${roomId}:voice`;
      socket.join(voiceRoom);

      // Query active open session participant count authoritatively from DB (no Redis requirement)
      let count = 0;
      const { data: openSession } = await admin
        .from("room_open_sessions")
        .select("id")
        .eq("room_id", roomId)
        .eq("status", "live")
        .maybeSingle();

      if (openSession) {
        const { count: c } = await admin
          .from("room_open_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("session_id", openSession.id)
          .is("left_at", null);
        count = c ?? 0;
      }

      // Best effort Redis cache update if available
      if (redis) {
        try {
          await redis.sadd(`room:${roomId}:voice_users`, socket.data.userId);
          await redis.expire(`room:${roomId}:voice_users`, 3600);
        } catch {}
      }

      io.to(voiceRoom).emit("room:voice:updated", {
        roomId,
        userId: socket.data.userId,
        action: "joined",
        participantCount: Math.max(1, count),
      });
      io.to(roomPresenceRoom(roomId)).emit("room:voice:status", {
        roomId,
        active: true,
        participantCount: Math.max(1, count),
      });
    });

    socket.on("room:voice:leave", async (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      if (typeof roomId !== "string") return;
      const voiceRoom = `room:${roomId}:voice`;
      socket.leave(voiceRoom);

      let count = 0;
      const { data: openSession } = await admin
        .from("room_open_sessions")
        .select("id")
        .eq("room_id", roomId)
        .eq("status", "live")
        .maybeSingle();

      if (openSession) {
        const { count: c } = await admin
          .from("room_open_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("session_id", openSession.id)
          .is("left_at", null);
        count = c ?? 0;
      }

      if (redis) {
        try {
          await redis.srem(`room:${roomId}:voice_users`, socket.data.userId);
        } catch {}
      }

      io.to(voiceRoom).emit("room:voice:updated", {
        roomId,
        userId: socket.data.userId,
        action: "left",
        participantCount: count,
      });
      io.to(roomPresenceRoom(roomId)).emit("room:voice:status", {
        roomId,
        active: count > 0,
        participantCount: count,
      });
    });

    socket.on("room:voice:state", (payload: any) => {
      const roomId = payload?.roomId;
      if (typeof roomId !== "string") return;
      socket.to(`room:${roomId}:voice`).emit("room:voice:participant_state", {
        roomId,
        userId: socket.data.userId,
        isMuted: Boolean(payload?.isMuted),
        isSpeaking: Boolean(payload?.isSpeaking),
      });
    });

    socket.on("typing:start", (payload: any) => {
      const convId = typeof payload === "string" ? payload : payload?.conversationId;
      if (typeof convId !== "string") return;
      const userName = payload?.userName || payload?.senderName;
      if (socket.rooms.has(`conversation:${convId}`)) {
        socket.to(`conversation:${convId}`).emit("typing:start", {
          userId,
          conversationId: convId,
          userName: userName || "Someone",
        });
      }
    });

    socket.on("typing:stop", (payload: any) => {
      const convId = typeof payload === "string" ? payload : payload?.conversationId;
      if (typeof convId !== "string") return;
      if (socket.rooms.has(`conversation:${convId}`)) {
        socket.to(`conversation:${convId}`).emit("typing:stop", {
          userId,
          conversationId: convId,
        });
      }
    });

    // =========================================================================
    // WebRTC 1:1 Call Signaling Protocol Handlers (Secured & Rate Limited)
    // =========================================================================

    // Server-authoritative peer resolver with in-memory caching for zero-latency candidate exchange
    async function getAuthorizedCallPeer(callId: string): Promise<string | null> {
      if (!callId || typeof callId !== "string" || callId.length > 36) return null;

      const cached = callPeerCache.get(callId);
      if (cached && Date.now() < cached.expiresAt) {
        if (cached.callerId === userId) return cached.calleeId;
        if (cached.calleeId === userId) return cached.callerId;
        return null;
      }

      const { data: callRecord } = await admin
        .from("calls")
        .select("caller_id, callee_id, status")
        .eq("id", callId)
        .maybeSingle();

      if (!callRecord) return null;

      callPeerCache.set(callId, {
        callerId: callRecord.caller_id,
        calleeId: callRecord.callee_id,
        expiresAt: Date.now() + 180_000,
      });

      if (callRecord.caller_id === userId) return callRecord.callee_id;
      if (callRecord.callee_id === userId) return callRecord.caller_id;
      return null;
    }

    // Call SDP Offer forwarder with buffering for early arrivals (Bug 3)
    socket.on("call:offer", async (payload: { callId?: string; sdp?: any }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, sdp } = payload || {};
      if (!callId || !sdp) return;
      if (typeof sdp === "string" && sdp.length > 65536) return; // 64KB max

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;

      // Buffer offer so callee receives it if mounting CallScreen during navigation (Bug 3)
      const existing = callSignalingBuffer.get(callId) || { candidates: [], createdAt: Date.now() };
      existing.offer = sdp;
      existing.createdAt = Date.now();
      callSignalingBuffer.set(callId, existing);

      io.to(`user:${peerId}`).emit("call:offer", { callId, sdp });
    });

    // Call SDP Answer forwarder (Payload limit: 64KB)
    socket.on("call:answer", async (payload: { callId?: string; sdp?: any }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, sdp } = payload || {};
      if (!callId || !sdp) return;
      if (typeof sdp === "string" && sdp.length > 65536) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:answer", { callId, sdp });
    });

    // Call ICE Candidate forwarder with buffering for early arrivals (Bug 3)
    socket.on("call:ice-candidate", async (payload: { callId?: string; candidate?: any }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, candidate } = payload || {};
      if (!callId || !candidate) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;

      // Buffer ICE candidate so it can be replayed to callee on call:ready
      const existing = callSignalingBuffer.get(callId) || { candidates: [], createdAt: Date.now() };
      existing.candidates.push(candidate);
      callSignalingBuffer.set(callId, existing);

      io.to(`user:${peerId}`).emit("call:ice-candidate", { callId, candidate });
    });

    // Call Acceptance signal
    socket.on("call:accept", async (payload: { callId?: string }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:accept", { callId });
    });

    // Call Rejection signal
    socket.on("call:reject", async (payload: { callId?: string; reason?: string }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, reason = "declined" } = payload || {};
      if (!callId) return;
      const safeReason = typeof reason === "string" ? reason.slice(0, 50) : "declined";

      const peerId = await getAuthorizedCallPeer(callId);
      callSignalingBuffer.delete(callId);
      callPeerCache.delete(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:reject", { callId, reason: safeReason });
    });

    // Call Hangup / End signal
    socket.on("call:end", async (payload: { callId?: string; durationSeconds?: number }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, durationSeconds = 0 } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      callSignalingBuffer.delete(callId);
      callPeerCache.delete(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:end", {
        callId,
        durationSeconds: typeof durationSeconds === "number" ? Math.max(0, durationSeconds) : 0,
      });
    });

    // Call Ready signal (emitted by callee once CallScreen is mounted and media is initialized)
    socket.on("call:ready", async (payload: { callId?: string }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:ready", { callId });

      // Replay any buffered offer and ICE candidates directly to the ready peer, then clear to avoid duplicate offers
      const buffered = callSignalingBuffer.get(callId);
      if (buffered) {
        callSignalingBuffer.delete(callId);
        if (buffered.offer) {
          socket.emit("call:offer", { callId, sdp: buffered.offer });
        }
        if (buffered.candidates && buffered.candidates.length > 0) {
          for (const candidate of buffered.candidates) {
            socket.emit("call:ice-candidate", { callId, candidate });
          }
        }
      }
    });

    // Call Connected signal (emitted by client when WebRTC connectionState reaches "connected") (Bug 6)
    socket.on("call:connected", async (payload: { callId?: string }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;

      try {
        const { data: callRecord } = await admin
          .from("calls")
          .select("status")
          .eq("id", callId)
          .maybeSingle();

        if (
          callRecord &&
          (callRecord.status === "accepted" ||
            callRecord.status === "connecting" ||
            callRecord.status === "reconnecting")
        ) {
          await admin
            .from("calls")
            .update({
              status: "connected",
              connected_at: new Date().toISOString(),
            })
            .eq("id", callId);
        }
      } catch {
        // DB update error non-fatal to real-time relay
      }

      io.to(`user:${peerId}`).emit("call:connected", { callId });
    });

    // Real-time peer presence lookup with Facebook Messenger privacy enforcement
    socket.on("presence:check", async (payload: { userIds?: string[] }, callback?: (res: any) => void) => {
      const ids = Array.isArray(payload?.userIds) ? payload.userIds : [];
      const validIds = ids.filter((id): id is string => typeof id === "string");
      const viewerId = socket.data?.userId;

      // Facebook Messenger privacy:
      // If the viewer has disabled their own active status ("nobody"), they also cannot see others' active status
      if (viewerId) {
        try {
          const viewerPrivacy = await getUserPrivacySettings(viewerId);
          if (viewerPrivacy.presence_visibility === "nobody") {
            const hiddenMap: Record<string, boolean> = {};
            for (const id of validIds) hiddenMap[id] = false;
            if (typeof callback === "function") callback({ status: hiddenMap });
            else socket.emit("presence:status", { status: hiddenMap });
            return;
          }
        } catch {
          // ignore error
        }
      }

      // Check which candidate users allow this viewer to see their presence
      let allowedIds = new Set(validIds);
      if (viewerId) {
        try {
          const visible = await filterVisiblePresence(viewerId, validIds);
          allowedIds = new Set(visible);
        } catch {
          // fallback
        }
      }

      const statusMap: Record<string, boolean> = {};
      for (const id of validIds) {
        statusMap[id] = allowedIds.has(id) && Boolean(userConnections.has(id));
      }
      if (typeof callback === "function") {
        callback({ status: statusMap });
      } else {
        socket.emit("presence:status", { status: statusMap });
      }
    });

    // Real-time active status toggle from app settings (instant feedback)
    socket.on("presence:toggle", async (payload: { isOnlineVisible?: boolean }, callback?: (res: any) => void) => {
      const isVisible = Boolean(payload?.isOnlineVisible);
      try {
        await updateUserPrivacySettings(userId, {
          presence_visibility: isVisible ? "everyone" : "nobody",
        });
        if (isVisible) {
          socket.broadcast.emit("user:online", { userId });
        } else {
          socket.broadcast.emit("user:offline", { userId });
        }
        if (typeof callback === "function") callback({ success: true, isOnlineVisible: isVisible });
      } catch (err: any) {
        if (typeof callback === "function") callback({ success: false, error: err?.message });
      }
    });

    // Call ICE Restart / Reconnect signal
    socket.on("call:reconnect", async (payload: { callId?: string }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:reconnect", { callId });
    });

    // =========================================================================
    // Multi-Party Room WebRTC Mesh & Co-Study Audio/Video Protocol Handlers
    // (High-performance, zero external dependency, robust LiveKit alternative)
    // =========================================================================

    socket.on("room:webrtc:join", async (payload: {
      roomId?: string;
      name?: string;
      avatarUrl?: string;
      media?: "audio" | "video";
      role?: string;
    }, callback?: (res: any) => void) => {
      const roomId = payload?.roomId;
      if (!roomId || typeof roomId !== "string") {
        if (typeof callback === "function") callback({ error: "Invalid roomId" });
        return;
      }

      // Check room access
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

      const { data: roomData } = await admin
        .from("rooms")
        .select("id, owner_id, visibility, is_locked, knock_mode_enabled")
        .eq("id", roomId)
        .maybeSingle();

      if (!roomData) {
        if (typeof callback === "function") callback({ error: "Room not found" });
        return;
      }

      const isOwner = roomData.owner_id === userId;
      let effectiveRole = member?.role || (isOwner ? "owner" : null);

      if (!effectiveRole && roomData.visibility === "public" && !roomData.is_locked && !roomData.knock_mode_enabled) {
        effectiveRole = "member";
      }

      if (!effectiveRole) {
        if (typeof callback === "function") callback({ error: "Access denied to room" });
        return;
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      const peerInfo: RoomWebRTCPeer = {
        socketId: socket.id,
        userId,
        name: payload?.name || profile?.full_name || (profile?.username ? `@${profile.username}` : "Member"),
        avatarUrl: payload?.avatarUrl || profile?.avatar_url || null,
        role: effectiveRole,
        media: payload?.media === "video" ? "video" : "audio",
        isMuted: false,
        isVideoEnabled: payload?.media === "video",
        isSpeaking: false,
        isHandRaised: false,
        joinedAt: Date.now(),
      };

      const webrtcRoom = `room:${roomId}:webrtc`;
      socket.join(webrtcRoom);

      if (!roomWebRTCParticipants.has(roomId)) {
        roomWebRTCParticipants.set(roomId, new Map());
      }
      const roomMap = roomWebRTCParticipants.get(roomId)!;

      // Existing peers in this room
      const existingPeers = Array.from(roomMap.values());

      roomMap.set(socket.id, peerInfo);

      // Notify others in room
      socket.to(webrtcRoom).emit("room:webrtc:peer-joined", {
        peer: peerInfo,
        participantCount: roomMap.size,
      });

      // Update room presence for all viewers
      io.to(roomPresenceRoom(roomId)).emit("room:presence", {
        sessionId: roomId,
        liveParticipantCount: roomMap.size,
        isLive: true,
      });

      if (typeof callback === "function") {
        callback({
          success: true,
          self: peerInfo,
          peers: existingPeers,
          participantCount: roomMap.size,
          poll: roomLivePolls.get(roomId) || null,
          resources: roomSharedResources.get(roomId) || [],
        });
      }
    });

    socket.on("room:webrtc:signal", (payload: {
      roomId?: string;
      toSocketId?: string;
      signal?: any;
      type?: "offer" | "answer" | "candidate";
    }) => {
      if (!checkSignalingRateLimit(socket.id, 250, 10000)) return;
      const { roomId, toSocketId, signal, type } = payload || {};
      if (!roomId || !toSocketId || !signal) return;

      io.to(toSocketId).emit("room:webrtc:signal", {
        fromSocketId: socket.id,
        fromUserId: userId,
        signal,
        type,
        roomId,
      });
    });

    socket.on("room:webrtc:state", (payload: {
      roomId?: string;
      isMuted?: boolean;
      isVideoEnabled?: boolean;
      isSpeaking?: boolean;
      isHandRaised?: boolean;
      audioLevel?: number;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const roomMap = roomWebRTCParticipants.get(roomId);
      if (roomMap && roomMap.has(socket.id)) {
        const peer = roomMap.get(socket.id)!;
        if (typeof payload.isMuted === "boolean") peer.isMuted = payload.isMuted;
        if (typeof payload.isVideoEnabled === "boolean") peer.isVideoEnabled = payload.isVideoEnabled;
        if (typeof payload.isSpeaking === "boolean") peer.isSpeaking = payload.isSpeaking;
        if (typeof payload.isHandRaised === "boolean") peer.isHandRaised = payload.isHandRaised;
      }

      socket.to(`room:${roomId}:webrtc`).emit("room:webrtc:state", {
        socketId: socket.id,
        userId,
        ...payload,
      });
    });

    socket.on("room:webrtc:reaction", (payload: {
      roomId?: string;
      emoji?: string;
      senderName?: string;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId || !payload?.emoji) return;
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:reaction", {
        emoji: payload.emoji,
        senderId: userId,
        senderName: payload.senderName || "Member",
        timestamp: Date.now(),
      });
    });

    socket.on("room:webrtc:raise-hand", (payload: {
      roomId?: string;
      isHandRaised?: boolean;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const isRaised = Boolean(payload.isHandRaised);
      const roomMap = roomWebRTCParticipants.get(roomId);
      let peerName = "Member";
      if (roomMap && roomMap.has(socket.id)) {
        const peer = roomMap.get(socket.id)!;
        peer.isHandRaised = isRaised;
        peerName = peer.name;
      }
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:hand-changed", {
        socketId: socket.id,
        userId,
        isHandRaised: isRaised,
        name: peerName,
      });
    });

    socket.on("room:webrtc:media-sync", (payload: {
      roomId?: string;
      type: "PLAY" | "PAUSE" | "SEEK" | "LOAD_MEDIA";
      currentTime?: number;
      mediaUrl?: string;
      mediaTitle?: string;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      socket.to(`room:${roomId}:webrtc`).emit("room:webrtc:media-sync", {
        ...payload,
        senderId: userId,
        timestamp: Date.now(),
      });
    });

    socket.on("room:webrtc:moderation", async (payload: {
      roomId?: string;
      targetUserId?: string;
      targetSocketId?: string;
      action: "mute" | "kick" | "spotlight" | "end_room";
    }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const { data: member } = await admin
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

      const { data: roomData } = await admin
        .from("rooms")
        .select("owner_id")
        .eq("id", roomId)
        .maybeSingle();

      const isHost = roomData?.owner_id === userId || ["owner", "teacher", "moderator"].includes(member?.role || "");
      if (!isHost) return;

      if (payload.action === "mute" && payload.targetSocketId) {
        io.to(payload.targetSocketId).emit("room:webrtc:force-mute", { byUserId: userId });
        io.to(`room:${roomId}:webrtc`).emit("room:webrtc:state", {
          socketId: payload.targetSocketId,
          userId: payload.targetUserId,
          isMuted: true,
        });
      } else if (payload.action === "kick" && payload.targetSocketId) {
        io.to(payload.targetSocketId).emit("room:webrtc:kicked", { byUserId: userId });
      } else if (payload.action === "end_room") {
        io.to(`room:${roomId}:webrtc`).emit("room:webrtc:room-ended", { byUserId: userId, roomId });
        roomWebRTCParticipants.delete(roomId);
      } else if (payload.action === "spotlight" && payload.targetUserId) {
        io.to(`room:${roomId}:webrtc`).emit("room:webrtc:spotlight", { targetUserId: payload.targetUserId });
      }
    });

    // Real-time Latency Ping / Pong
    socket.on("room:webrtc:ping", (payload: { timestamp?: number }) => {
      socket.emit("room:webrtc:pong", {
        clientTimestamp: payload?.timestamp || Date.now(),
        serverTimestamp: Date.now(),
      });
    });

    // Collaborative Live Whiteboard
    socket.on("room:webrtc:whiteboard:draw", (payload: { roomId?: string; stroke?: any }) => {
      const roomId = payload?.roomId;
      if (!roomId || !payload?.stroke) return;
      socket.to(`room:${roomId}:webrtc`).emit("room:webrtc:whiteboard:draw", payload.stroke);
    });

    socket.on("room:webrtc:whiteboard:clear", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:whiteboard:clear", { byUserId: userId });
    });

    // Live Interactive Polls
    socket.on("room:webrtc:poll:create", (payload: { roomId?: string; question?: string; options?: string[]; creatorName?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId || !payload?.question || !Array.isArray(payload?.options)) return;
      const poll: RoomLivePoll = {
        id: `poll-${Date.now()}`,
        roomId,
        question: payload.question.trim().slice(0, 150),
        options: payload.options.slice(0, 4).map((text, idx) => ({ id: idx, text: String(text).trim().slice(0, 60), votes: 0 })),
        voters: {},
        creatorName: payload.creatorName || "Host",
        isOpen: true,
        createdAt: Date.now(),
      };
      roomLivePolls.set(roomId, poll);
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:poll:update", poll);
    });

    socket.on("room:webrtc:poll:vote", (payload: { roomId?: string; optionId?: number }) => {
      const roomId = payload?.roomId;
      if (!roomId || !userId || typeof payload?.optionId !== "number") return;
      const poll = roomLivePolls.get(roomId);
      if (!poll || !poll.isOpen) return;

      const previousVote = poll.voters[userId];
      const prevOpt = typeof previousVote === "number" ? poll.options[previousVote] : undefined;
      if (prevOpt) {
        prevOpt.votes = Math.max(0, prevOpt.votes - 1);
      }
      const targetOpt = poll.options[payload.optionId];
      if (targetOpt) {
        targetOpt.votes += 1;
        poll.voters[userId] = payload.optionId;
      }
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:poll:update", poll);
    });

    socket.on("room:webrtc:poll:close", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const poll = roomLivePolls.get(roomId);
      if (poll) {
        poll.isOpen = false;
        io.to(`room:${roomId}:webrtc`).emit("room:webrtc:poll:update", poll);
      }
    });

    // Stage Shared Resource Hub
    socket.on("room:webrtc:resource:share", (payload: {
      roomId?: string;
      title?: string;
      url?: string;
      type?: "link" | "doc" | "pdf" | "code";
      sharedByName?: string;
      sharedByAvatar?: string | null;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId || !payload?.title || !payload?.url) return;
      const item: RoomSharedResource = {
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        title: payload.title.trim().slice(0, 100),
        url: payload.url.trim().slice(0, 300),
        type: payload.type || "link",
        sharedByName: payload.sharedByName || "Member",
        sharedByAvatar: payload.sharedByAvatar,
        timestamp: Date.now(),
      };
      if (!roomSharedResources.has(roomId)) {
        roomSharedResources.set(roomId, []);
      }
      const list = roomSharedResources.get(roomId)!;
      list.unshift(item);
      if (list.length > 25) list.pop();
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:resource:new", item);
    });

    // Live Urgent Broadcast Announcement
    socket.on("room:webrtc:broadcast", (payload: { roomId?: string; message?: string; durationMs?: number; senderName?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId || !payload?.message) return;
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:broadcast", {
        id: `bc-${Date.now()}`,
        message: payload.message.trim().slice(0, 180),
        senderId: userId,
        senderName: payload.senderName || "Host",
        durationMs: payload.durationMs || 8000,
        timestamp: Date.now(),
      });
    });

    // In-Room Private Whisper / Discreet Direct Message
    socket.on("room:webrtc:whisper", (payload: {
      roomId?: string;
      toSocketId?: string;
      message?: string;
      senderName?: string;
      senderAvatar?: string | null;
    }) => {
      const { toSocketId, message, senderName, senderAvatar, roomId } = payload || {};
      if (!toSocketId || !message) return;
      io.to(toSocketId).emit("room:webrtc:whisper", {
        senderSocketId: socket.id,
        senderUserId: userId,
        senderName: senderName || "Peer",
        senderAvatar,
        message: message.trim().slice(0, 200),
        roomId,
        timestamp: Date.now(),
      });
    });

    // Breakout Groups Generator
    socket.on("room:webrtc:breakout:start", (payload: {
      roomId?: string;
      durationMinutes?: number;
      groupSize?: number;
    }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const roomMap = roomWebRTCParticipants.get(roomId);
      if (!roomMap) return;
      const members = Array.from(roomMap.values());
      const groupSize = Math.max(2, payload.groupSize || 2);
      const shuffled = [...members].sort(() => 0.5 - Math.random());
      const groups: { groupId: string; groupName: string; members: string[] }[] = [];
      for (let i = 0; i < shuffled.length; i += groupSize) {
        const slice = shuffled.slice(i, i + groupSize);
        groups.push({
          groupId: `grp-${Math.floor(i / groupSize) + 1}`,
          groupName: `Breakout Room ${Math.floor(i / groupSize) + 1}`,
          members: slice.map(s => s.userId),
        });
      }
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:breakout:started", {
        roomId,
        groups,
        durationMinutes: payload.durationMinutes || 10,
        startedAt: Date.now(),
      });
    });

    socket.on("room:webrtc:breakout:end", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      io.to(`room:${roomId}:webrtc`).emit("room:webrtc:breakout:ended", { roomId });
    });

    socket.on("room:webrtc:leave", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      socket.leave(`room:${roomId}:webrtc`);
      const roomMap = roomWebRTCParticipants.get(roomId);
      if (roomMap && roomMap.has(socket.id)) {
        roomMap.delete(socket.id);
        const count = roomMap.size;
        socket.to(`room:${roomId}:webrtc`).emit("room:webrtc:peer-left", {
          socketId: socket.id,
          userId,
          participantCount: count,
        });
        io.to(roomPresenceRoom(roomId)).emit("room:presence", {
          sessionId: roomId,
          liveParticipantCount: count,
          isLive: count > 0,
        });
        if (count === 0) {
          roomWebRTCParticipants.delete(roomId);
        }
      }
    });
  });
}
