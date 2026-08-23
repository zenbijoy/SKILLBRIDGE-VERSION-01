// Global test environment bootstrap for CI and local test execution
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.WEB_ORIGINS ??= "http://localhost:8081,http://localhost:5173";

process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "test_anon_key_1234567890";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test_service_role_key_1234567890";

process.env.P2P_CALLS_ENABLED ??= "true";
process.env.CLOUDFLARE_TURN_ENABLED ??= "false";
process.env.TURN_CREDENTIAL_TTL_SECONDS ??= "3600";
process.env.CALL_RING_TIMEOUT_SECONDS ??= "40";
process.env.CALL_MAX_RECONNECT_ATTEMPTS ??= "3";

process.env.LIVEKIT_URL ??= "wss://test.livekit.cloud";
process.env.LIVEKIT_API_KEY ??= "test_livekit_api_key";
process.env.LIVEKIT_API_SECRET ??= "test_livekit_secret_1234567890123456789012345678901234567890";

process.env.REDIS_URL = "";
process.env.ENABLE_PUSH_WORKER = "false";

