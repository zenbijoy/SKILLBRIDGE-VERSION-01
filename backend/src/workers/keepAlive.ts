import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Render Free Tier Keep-Alive Worker
 * Only activates if KEEP_ALIVE_ENABLED is explicitly true.
 * By default on development Render Free Tier, this is disabled to allow natural sleep.
 */
export function startKeepAliveWorker(): () => void {
  // Only run keepalive if explicitly enabled in environment
  if (process.env.NODE_ENV === "test" || !env.KEEP_ALIVE_ENABLED) {
    logger.info(
      { event: "keepalive_worker_disabled", keepAliveEnabled: env.KEEP_ALIVE_ENABLED },
      "Keep-alive worker is disabled. Render free web service is allowed to sleep naturally.",
    );
    return () => {};
  }

  const serviceUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.API_BASE_URL ||
    "https://skillbridge-api-pd9c.onrender.com";

  const targetUrl = `${serviceUrl.replace(/\/+$/, "")}/health`;
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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
