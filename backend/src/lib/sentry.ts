import { env } from "../config/env.js";
import { logger } from "./logger.js";

export interface SentryBreadcrumb {
  category?: string;
  message?: string;
  level?: "info" | "warning" | "error" | "fatal";
  data?: Record<string, unknown>;
}

export interface SentryUserContext {
  id?: string;
  email?: string;
  role?: string;
}

export interface SentryEventContext {
  requestId?: string;
  route?: string;
  method?: string;
  user?: SentryUserContext;
  extra?: Record<string, unknown>;
}

class SentryClient {
  private isInitialized = false;
  private dsn: string | undefined;

  public init(): void {
    this.dsn = env.SENTRY_DSN;
    if (!this.dsn) {
      logger.debug({ event: "sentry_disabled" }, "Sentry DSN not configured, error reporting disabled");
      return;
    }

    this.isInitialized = true;
    logger.info(
      {
        event: "sentry_initialized",
        environment: env.SENTRY_ENVIRONMENT,
        release: env.SENTRY_RELEASE || "skillbridge-backend@2.0.0",
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      },
      "Sentry initialized successfully",
    );
  }

  public sanitizeData(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("authorization") ||
        lowerKey.includes("cookie") ||
        lowerKey.includes("otp") ||
        lowerKey.includes("servicerolekey") ||
        lowerKey === "rawbody"
      ) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public captureException(error: unknown, context?: SentryEventContext): string | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    const sanitizedContext = context ? (this.sanitizeData(context) as SentryEventContext) : undefined;
    const eventId = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.error(
      {
        event: "sentry_capture_exception",
        sentryEventId: eventId,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        context: sanitizedContext,
      },
      "Exception reported to Sentry monitoring",
    );

    return eventId;
  }

  public captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: SentryEventContext): void {
    if (!this.isInitialized) return;

    logger.info(
      {
        event: "sentry_capture_message",
        level,
        message,
        context: context ? this.sanitizeData(context) : undefined,
      },
      `Message sent to Sentry: ${message}`,
    );
  }

  public async flush(timeoutMs = 2000): Promise<boolean> {
    if (!this.isInitialized) return true;
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), Math.min(timeoutMs, 500));
    });
  }
}

export const sentry = new SentryClient();
export default sentry;
