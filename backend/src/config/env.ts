import "dotenv/config";
import { z } from "zod";

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^["']|["']$/g, "").trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalUrl = z.preprocess(
  (value) => {
    const s = sanitizeString(value);
    return s ? s.replace(/\/+$/, "") : undefined;
  },
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  sanitizeString,
  z.string().optional(),
);

const requiredString = (minLen = 1) =>
  z.preprocess(
    sanitizeString,
    z.string().min(minLen),
  );

const requiredUrl = z.preprocess(
  (value) => {
    const s = sanitizeString(value);
    return s ? s.replace(/\/+$/, "") : undefined;
  },
  z.string().url(),
);

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return false;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGINS: z.string().default("http://localhost:8081"),
  SUPABASE_URL: requiredUrl,
  SUPABASE_ANON_KEY: requiredString(10),
  SUPABASE_SERVICE_ROLE_KEY: requiredString(10),
  REDIS_URL: optionalString,
  REDIS_REQUIRED: booleanFromEnv.default(false),
  KEEP_ALIVE_ENABLED: booleanFromEnv.default(false),
  LIVEKIT_URL: optionalString,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
  EXPO_PUSH_ACCESS_TOKEN: optionalString,
  AI_PROVIDER_URL: optionalUrl,
  AI_PROVIDER_API_KEY: optionalString,
  MAX_ROOM_CAPACITY: z.coerce.number().int().min(2).max(250).default(250),
  MAINTENANCE_MODE: booleanFromEnv.default(false),
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(30).max(5000).default(120),
  // Logging & Observability
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString.default("development"),
  SENTRY_RELEASE: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  API_VERSION: z.string().default("v1"),
  // WebRTC & Cloudflare TURN Settings
  P2P_CALLS_ENABLED: booleanFromEnv.default(true),
  CLOUDFLARE_TURN_ENABLED: booleanFromEnv.default(false),
  CLOUDFLARE_TURN_KEY_ID: optionalString,
  CLOUDFLARE_TURN_API_TOKEN: optionalString,
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(120).default(40),
  CALL_MAX_RECONNECT_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  // Admin Bootstrap
  ADMIN_BOOTSTRAP_ENABLED: booleanFromEnv.default(false),
  ADMIN_BOOTSTRAP_EMAIL: optionalString,
  ADMIN_BOOTSTRAP_TEMP_PASSWORD: optionalString,
  ADMIN_BOOTSTRAP_EXPIRES_AT: optionalString,
  ADMIN_REQUIRE_MFA: booleanFromEnv.default(true),
  ADMIN_APP_URL: optionalUrl,
  // Cloudflare R2 Storage
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_PUBLIC_DOMAIN: optionalString,
  // Phase 4: YouTube OAuth & Media Automation
  YOUTUBE_CLIENT_ID: optionalString,
  YOUTUBE_CLIENT_SECRET: optionalString,
  YOUTUBE_REDIRECT_URI: optionalUrl,
  OAUTH_TOKEN_ENCRYPTION_KEY: optionalString,
  YOUTUBE_API_KEY: optionalString,
  YOUTUBE_OAUTH_ENABLED: booleanFromEnv.default(false),
  LIVEKIT_RECORDING_AUTOMATION: booleanFromEnv.default(false),
  RICH_FEED_MEDIA: booleanFromEnv.default(true),
});

export type AppEnv = z.infer<typeof schema>;

const parseResult = schema.safeParse(process.env);
if (!parseResult.success) {
  console.error("\n=================================================================");
  console.error("❌ CRITICAL ENVIRONMENT CONFIGURATION ERROR (SkillBridge Backend)");
  console.error("=================================================================");
  console.error("The backend failed to start because required environment variables are");
  console.error("missing or invalid in your Render Service Dashboard:\n");
  for (const issue of parseResult.error.issues) {
    const field = issue.path.join(".");
    console.error(`  👉 [${field}]: ${issue.message}`);
  }
  console.error("\nPlease add these in Render -> Your Service -> Environment tab.");
  console.error("=================================================================\n");
  process.exit(1);
}

export const env: AppEnv = parseResult.data;

export function getSupabaseProjectRef(url?: string): string {
  if (!url) return "unknown";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const parts = host.split(".");
    return (parts.length >= 3 && parts[0] ? parts[0] : host) || "unknown";
  } catch {
    return "unknown";
  }
}

export const SUPABASE_PROJECT_REF: string = getSupabaseProjectRef(env.SUPABASE_URL);

