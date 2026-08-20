import type { Server as SocketServer } from "socket.io";
import { admin } from "./lib/db.js";

export const userConnections = new Map<string, number>();

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
  });
}
