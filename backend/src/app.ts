import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import type { Server as SocketServer } from "socket.io";
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
import { live, liveWebhooks } from "./routes/live.js";
import { account } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { ai } from "./routes/ai.js";
import { catalog } from "./routes/catalog.js";
import { clubs } from "./routes/clubs.js";
import { research } from "./routes/research.js";
import { health } from "./routes/health.js";
import { experience } from "./routes/experience.js";
import { goals } from "./routes/goals.js";
import { planner } from "./routes/planner.js";
import { calendar } from "./routes/calendar.js";
import { bookings } from "./routes/bookings.js";
import { challenges } from "./routes/challenges.js";
import { achievements, achievementsPublic } from "./routes/achievements.js";
import { activity } from "./routes/activity.js";
import { progress } from "./routes/progress.js";
import { ct } from "./routes/ct.js";
import { calls } from "./routes/calls.js";

export function createApp(io?: SocketServer) {
  const app = express();
  const origins = env.WEB_ORIGINS.split(",").map((x) => x.trim());

  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    }
  }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.GLOBAL_RATE_LIMIT_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  // Stricter rate limit for sensitive/write-heavy endpoints (10 req/min per IP)
  const sensitiveLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });

  app.use("/health", health);
  app.use("/api/v1/health", health);
  app.use("/webhooks/live", liveWebhooks);
  app.use("/api/v1/experience", experience);
  app.use("/api/v1/achievements/verify", achievementsPublic);

  const api = express.Router();
  api.use(auth);
  api.use((req, res, next) => {
    if (!env.MAINTENANCE_MODE) return next();
    const canOperate = req.userRoles?.some((role) => role === "admin" || role === "moderator");
    if (canOperate) return next();
    return res.status(503).json({ error: "SkillBridge is temporarily in maintenance mode" });
  });

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
  if (io) {
    api.use("/chat", chat(io));
  } else {
    // For test environments without an explicit SocketServer instance
    api.use("/chat", chat({ to: () => ({ emit: () => {} }), in: () => ({ fetchSockets: async () => [] }) } as unknown as SocketServer));
  }
  api.use("/resources", resources);
  api.use("/saved", saved);
  api.use("/gamification", gamification);
  api.use("/quiz", quiz);
  api.use("/notifications", notifications);
  api.use("/moderation", sensitiveLimit, moderation);
  api.use("/live", live);
  api.use("/account", sensitiveLimit, account);
  api.use("/ai", ai);
  api.use("/research", research);
  api.use("/goals", goals);
  api.use("/planner", planner);
  api.use("/calendar", calendar);
  api.use("/bookings", bookings);
  api.use("/challenges", challenges);
  api.use("/achievements", achievements);
  api.use("/activity", activity);
  api.use("/progress", progress);
  api.use("/ct", ct);
  api.use("/calls", calls);
  api.use("/admin", requireRole("moderator", "admin"), adminRoutes);

  app.use("/api/v1", api);
  app.use(notFound);
  app.use(errors);

  return app;
}
