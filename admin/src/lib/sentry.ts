export interface AdminSentryContext {
  userId?: string;
  route?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

class AdminSentry {
  private isInitialized = false;

  public init() {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) {
      return;
    }
    this.isInitialized = true;
  }

  private sanitize(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) return data.map((x) => this.sanitize(x));

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("authorization") ||
        lower.includes("cookie") ||
        lower.includes("servicerolekey") ||
        lower.includes("otp")
      ) {
        out[k] = "[REDACTED]";
      } else if (typeof v === "object" && v !== null) {
        out[k] = this.sanitize(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  public captureException(error: unknown, context?: AdminSentryContext): string {
    const eventId = `ADM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (this.isInitialized) {
      const sanitized = context ? this.sanitize(context) : undefined;
      console.error(`[Admin Sentry ${eventId}]`, error, sanitized);
    }

    return eventId;
  }

  public captureMessage(message: string, context?: AdminSentryContext) {
    if (!this.isInitialized) return;
    const sanitized = context ? this.sanitize(context) : undefined;
    console.log(`[Admin Sentry Message] ${message}`, sanitized);
  }
}

export const sentry = new AdminSentry();
export default sentry;
