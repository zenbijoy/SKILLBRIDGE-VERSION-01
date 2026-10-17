import type { Server as SocketServer } from "socket.io";
import { admin } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { redis } from "./lib/redis.js";
import {
  getUserPrivacySettings,
  filterVisiblePresence,
  updateUserPrivacySettings,
} from "./services/privacyService.js";

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

export const userConnections = new Map<string, number>();

// In-memory per-socket rate limiter for signaling abuse protection
const socketRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkSignalingRateLimit(socketId: string, limit = 60, windowMs = 10000): boolean {
  const now = Date.now();
  const entry = socketRateLimits.get(socketId);
  if (!entry || now > entry.resetAt) {
    socketRateLimits.set(socketId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

// Server-side call signaling buffer (Bug 3: prevents dropped offer/ICE during navigation)
export interface BufferedCallSignaling {
  offer?: any;
  candidates: any[];
  createdAt: number;
}

export const callSignalingBuffer = new Map<string, BufferedCallSignaling>();

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
    });

    const handleJoin = async (payload: any) => {
      const convId = payload?.conversationId || payload?.conversation_id;
      if (typeof convId !== "string") return;
      const { data } = await admin
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", convId)
        .eq("user_id", socket.data.userId)
        .maybeSingle();
      if (data) socket.join(`conversation:${convId}`);
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

      // Send the authoritative snapshot immediately so the client never renders "0".
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

    // ── Voice lounge real-time room subscribers & state sync ──────────────
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

      if (redis) {
        try {
          await redis.sadd(`room:${roomId}:voice_users`, socket.data.userId);
          await redis.expire(`room:${roomId}:voice_users`, 86400);
          const count = await redis.scard(`room:${roomId}:voice_users`);
          io.to(voiceRoom).emit("room:voice:updated", {
            roomId,
            userId: socket.data.userId,
            action: "joined",
            participantCount: count,
          });
          io.to(roomPresenceRoom(roomId)).emit("room:voice:status", {
            roomId,
            active: count > 0,
            participantCount: count,
          });
        } catch {}
      }
    });

    socket.on("room:voice:leave", async (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      if (typeof roomId !== "string") return;
      const voiceRoom = `room:${roomId}:voice`;
      socket.leave(voiceRoom);

      if (redis) {
        try {
          await redis.srem(`room:${roomId}:voice_users`, socket.data.userId);
          const count = await redis.scard(`room:${roomId}:voice_users`);
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
        } catch {}
      }
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

    socket.on("typing:start", ({ conversationId }) => {
      if (typeof conversationId !== "string") return;
      if (socket.rooms.has(`conversation:${conversationId}`)) {
        socket.to(`conversation:${conversationId}`).emit("typing:start", { userId, conversationId });
      }
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (typeof conversationId !== "string") return;
      if (socket.rooms.has(`conversation:${conversationId}`)) {
        socket.to(`conversation:${conversationId}`).emit("typing:stop", { userId, conversationId });
      }
    });

    // =========================================================================
    // WebRTC 1:1 Call Signaling Protocol Handlers (Secured & Rate Limited)
    // =========================================================================

    // Server-authoritative peer resolver
    async function getAuthorizedCallPeer(callId: string): Promise<string | null> {
      if (!callId || typeof callId !== "string" || callId.length > 36) return null;
      const { data: callRecord } = await admin
        .from("calls")
        .select("caller_id, callee_id, status")
        .eq("id", callId)
        .maybeSingle();

      if (!callRecord) return null;
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

      callSignalingBuffer.delete(callId);

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:reject", { callId, reason: safeReason });
    });

    // Call Hangup / End signal
    socket.on("call:end", async (payload: { callId?: string; durationSeconds?: number }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, durationSeconds = 0 } = payload || {};
      if (!callId) return;

      callSignalingBuffer.delete(callId);

      const peerId = await getAuthorizedCallPeer(callId);
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

      // Replay any buffered offer and ICE candidates directly to the ready peer (Bug 3)
      const buffered = callSignalingBuffer.get(callId);
      if (buffered) {
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
  });
}
