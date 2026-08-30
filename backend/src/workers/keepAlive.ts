import { logger } from "../lib/logger.js";

/**
 * Render Free Tier Keep-Alive Worker
 * Automatically pings the server health endpoint every 10 minutes to prevent Render free instance sleep.
 */
export function startKeepAliveWorker(): () => void {
  const serviceUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.API_BASE_URL ||
    "https://skillbridge-api-pd9c.onrender.com";

  const targetUrl = `${serviceUrl.replace(/\/+$/, "")}/health`;
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (Render spins down after 15 mins)

  // Only run keepalive in production when deployed
  if (process.env.NODE_ENV === "test") {
    return () => {};
  }

  logger.info(
    { event: "keepalive_worker_started", targetUrl, intervalMs: PING_INTERVAL_MS },
    "Keep-alive worker initialized for Render free tier",
  );

  const timer = setInterval(async () => {
    try {
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "SkillBridge-KeepAlive/1.0" },
      });
      if (response.ok) {
        logger.debug({ event: "keepalive_ping_success", status: response.status }, "Keep-alive ping successful");
      } else {
        logger.warn({ event: "keepalive_ping_non_200", status: response.status }, "Keep-alive ping returned non-200");
      }
    } catch (err) {
      logger.warn({ event: "keepalive_ping_failed", err: (err as Error).message }, "Keep-alive ping error");
    }
  }, PING_INTERVAL_MS);

  // Allow process to terminate cleanly without holding the timer open
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return () => clearInterval(timer);
}
