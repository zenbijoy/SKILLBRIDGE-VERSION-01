import http from "node:http";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { setupSocket, userConnections } from "./socket.js";
import { startPushWorker } from "./workers/pushWorker.js";
import { redis } from "./lib/redis.js";
import { runAdminBootstrap } from "./services/admin-bootstrap.js";
import { logger } from "./lib/logger.js";
import { sentry } from "./lib/sentry.js";

const origins = env.WEB_ORIGINS.split(",").map((x) => x.trim());

const server = http.createServer();
const io = new SocketServer(server, {
  cors: { origin: origins, credentials: true },
});

const app = createApp(io);
server.on("request", app);

setupSocket(io);

export { app, server, io, userConnections };

// Process-level crash handlers
process.on("uncaughtException", (error: Error) => {
  logger.fatal(
    {
      event: "uncaught_exception",
      err: { name: error.name, message: error.message, stack: error.stack },
    },
    "Uncaught exception encountered",
  );
  sentry.captureException(error, { extra: { type: "uncaughtException" } });
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.fatal(
    {
      event: "unhandled_rejection",
      err: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : reason,
    },
    "Unhandled promise rejection encountered",
  );
  sentry.captureException(reason, { extra: { type: "unhandledRejection" } });
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ event: "server_shutdown_started", signal }, `Received ${signal}, commencing graceful shutdown...`);

  // Set 10-second forced shutdown safety timer
  const forceExitTimer = setTimeout(() => {
    logger.error({ event: "server_shutdown_timeout" }, "Graceful shutdown timed out after 10s, forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    // 1. Stop receiving new HTTP requests
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info({ event: "server_http_closed" }, "HTTP server closed.");

    // 2. Close Socket.IO connections
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    logger.info({ event: "server_socketio_closed" }, "Socket.IO closed.");

    // 3. Disconnect Redis if connected
    if (redis && (redis.status === "ready" || redis.status === "connect")) {
      await redis.quit();
      logger.info({ event: "server_redis_closed" }, "Redis connection closed cleanly.");
    }

    // 4. Flush Sentry telemetry
    await sentry.flush(2000);

    logger.info({ event: "server_shutdown_complete" }, "Graceful shutdown complete. Exiting process.");
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        event: "server_shutdown_error",
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      "Error occurred during graceful shutdown",
    );
    process.exit(1);
  }
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

if (process.argv[1] === new URL(import.meta.url).pathname || process.env.NODE_ENV !== "test") {
  const startServer = async () => {
    sentry.init();

    if (redis && redis.status === "wait") {
      try {
        await redis.connect();
        logger.info({ event: "redis_connected" }, "Redis connected successfully.");
      } catch (err) {
        logger.error({ event: "redis_connection_failed", err }, "Failed to connect to Redis");
        if (env.REDIS_REQUIRED) process.exit(1);
      }
    } else if (!redis && env.REDIS_REQUIRED) {
      logger.error({ event: "redis_required_missing" }, "REDIS_URL is not set but REDIS_REQUIRED is true.");
      process.exit(1);
    }

    server.listen(env.PORT, "0.0.0.0", async () => {
      logger.info(
        {
          event: "server_started",
          port: env.PORT,
          environment: env.NODE_ENV,
          nodeVersion: process.version,
        },
        `SkillBridge API listening on http://0.0.0.0:${env.PORT}`,
      );
      await runAdminBootstrap();
    });

    startPushWorker();
  };

  startServer().catch((err) => {
    logger.fatal({ event: "server_bootstrap_failed", err }, "Server startup failed");
    process.exit(1);
  });
}
