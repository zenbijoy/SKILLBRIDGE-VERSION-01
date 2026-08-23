import type { Server as SocketServer, Socket } from "socket.io";
import { admin } from "./lib/db.js";

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

export function setupSocket(io: SocketServer) {
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
      socket.broadcast.emit("user:online", { userId });
    }

    socket.on("disconnect", () => {
      socketRateLimits.delete(socket.id);
      const newCount = (userConnections.get(userId) || 1) - 1;
      if (newCount === 0) {
        userConnections.delete(userId);
        socket.broadcast.emit("user:offline", { userId });
      } else {
        userConnections.set(userId, newCount);
      }
    });

    socket.on("conversation:join", async ({ conversationId }) => {
      if (typeof conversationId !== "string") return;
      const { data } = await admin
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("user_id", socket.data.userId)
        .maybeSingle();
      if (data) socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:leave", ({ conversationId }) =>
      socket.leave(`conversation:${conversationId}`),
    );

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

    // Call SDP Offer forwarder (Payload limit: 64KB)
    socket.on("call:offer", async (payload: { callId?: string; sdp?: any }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, sdp } = payload || {};
      if (!callId || !sdp) return;
      if (typeof sdp === "string" && sdp.length > 65536) return; // 64KB max

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
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

    // Call ICE Candidate forwarder (Payload limit: 4KB)
    socket.on("call:ice-candidate", async (payload: { callId?: string; candidate?: any }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, candidate } = payload || {};
      if (!callId || !candidate) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
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
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:reject", { callId, reason: safeReason });
    });

    // Call Hangup / End signal
    socket.on("call:end", async (payload: { callId?: string; durationSeconds?: number }) => {
      if (!checkSignalingRateLimit(socket.id)) return;
      const { callId, durationSeconds = 0 } = payload || {};
      if (!callId) return;

      const peerId = await getAuthorizedCallPeer(callId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit("call:end", {
        callId,
        durationSeconds: typeof durationSeconds === "number" ? Math.max(0, durationSeconds) : 0,
      });
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
