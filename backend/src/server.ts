import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env.js";
import { auth, requireRole } from "./middleware/auth.js";
import { errors, notFound } from "./middleware/error.js";
import { dashboard } from "./routes/dashboard.js";
import { profiles } from "./routes/profiles.js";
import { connections } from "./routes/connections.js";
import { rooms } from "./routes/rooms.js";
import { sessions } from "./routes/sessions.js";
import { search } from "./routes/search.js";
import { recommendations } from "./routes/recommendations.js";
import { events } from "./routes/events.js";
import { chat } from "./routes/chat.js";
import { resources } from "./routes/resources.js";
import { saved } from "./routes/saved.js";
import { gamification } from "./routes/gamification.js";
import { quiz } from "./routes/quiz.js";
import { notifications } from "./routes/notifications.js";
import { moderation } from "./routes/moderation.js";
import { live } from "./routes/live.js";
import { account } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { ai } from "./routes/ai.js";
import { catalog } from "./routes/catalog.js";
import { clubs } from "./routes/clubs.js";
import { research } from "./routes/research.js";
import { admin } from "./lib/db.js";
import { health } from "./routes/health.js";
const app = express();
const server = http.createServer(app);
const origins = env.WEB_ORIGINS.split(",").map((x) => x.trim());
const io = new SocketServer(server, {
  cors: { origin: origins, credentials: true },
});
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/health", health);
const api = express.Router();
api.use(auth);
api.use("/dashboard", dashboard);
api.use("/catalog", catalog);
api.use("/clubs", clubs);
api.use("/profiles", profiles);
api.use("/connections", connections);
api.use("/rooms", rooms);
api.use("/sessions", sessions);
api.use("/search", search);
api.use("/recommendations", recommendations);
api.use("/events", events);
api.use("/chat", chat(io));
api.use("/resources", resources);
api.use("/saved", saved);
api.use("/gamification", gamification);
api.use("/quiz", quiz);
api.use("/notifications", notifications);
api.use("/moderation", moderation);
api.use("/live", live);
api.use("/account", account);
api.use("/ai", ai);
api.use("/research", research);
api.use("/admin", requireRole("moderator", "admin"), adminRoutes);
app.use("/api/v1", api);
app.use(notFound);
app.use(errors);
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (typeof token !== "string") return next(new Error("unauthorized"));
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return next(new Error("unauthorized"));
    socket.data.userId = data.user.id;
    next();
  } catch (e) {
    next(e as Error);
  }
});
io.on("connection", (socket) => {
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
});
export { app };
if (process.argv[1] === new URL(import.meta.url).pathname || process.env.NODE_ENV !== "test") {
  server.listen(env.PORT, () =>
    console.log(`SkillBridge API listening on :${env.PORT}`),
  );
}
