import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return false;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGINS: z.string().default("http://localhost:8081"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  REDIS_URL: optionalString,
  LIVEKIT_URL: optionalString,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
  EXPO_PUSH_ACCESS_TOKEN: optionalString,
  AI_PROVIDER_URL: optionalUrl,
  AI_PROVIDER_API_KEY: optionalString,
  MAX_ROOM_CAPACITY: z.coerce.number().int().min(2).max(250).default(250),
  MAINTENANCE_MODE: booleanFromEnv.default(false),
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(30).max(5000).default(120),
  // WebRTC & Cloudflare TURN Settings
  P2P_CALLS_ENABLED: booleanFromEnv.default(true),
  CLOUDFLARE_TURN_ENABLED: booleanFromEnv.default(false),
  CLOUDFLARE_TURN_KEY_ID: optionalString,
  CLOUDFLARE_TURN_API_TOKEN: optionalString,
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(120).default(40),
  CALL_MAX_RECONNECT_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
});

export type AppEnv = z.infer<typeof schema>;
export const env: AppEnv = schema.parse(process.env);

