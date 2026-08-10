# SkillBridge Environment Variable Reference

This document classifies all environment variables required for the SkillBridge application. **NEVER** commit real secret values to the repository.

## Backend Service

The backend uses `backend/.env`.

| Variable | Status | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | OPTIONAL | Set to `development`, `test`, or `production`. Defaults to `development`. |
| `PORT` | OPTIONAL | The port for the backend server. Defaults to `4000`. |
| `WEB_ORIGINS` | OPTIONAL | Comma-separated list of allowed CORS origins. Defaults to `http://localhost:8081`. |
| `SUPABASE_URL` | REQUIRED_CORE | The URL of the Supabase project. |
| `SUPABASE_ANON_KEY` | REQUIRED_CORE | The anonymous client key for Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED_BACKEND | The highly privileged service-role key for backend operations. **DO NOT EXPOSE TO FRONTEND.** |
| `REDIS_URL` | OPTIONAL | Connection string for Redis cache. |
| `LIVEKIT_URL` | OPTIONAL | URL for the LiveKit WebRTC server. |
| `LIVEKIT_API_KEY` | OPTIONAL | LiveKit API Key. |
| `LIVEKIT_API_SECRET` | OPTIONAL | LiveKit API Secret. |
| `EXPO_PUSH_ACCESS_TOKEN` | OPTIONAL | Firebase/Expo access token for notifications. |
| `AI_PROVIDER_URL` | OPTIONAL | URL for external AI service. |
| `AI_PROVIDER_API_KEY` | OPTIONAL | API Key for external AI service. |

## Frontend Application

The frontend uses `frontend/.env`.

| Variable | Status | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | REQUIRED_FRONTEND | Supabase project URL (must match backend). |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | REQUIRED_FRONTEND | Supabase anonymous key. |
| `EXPO_PUBLIC_API_URL` | REQUIRED_FRONTEND | The URL pointing to the running backend (e.g., `http://localhost:4000/api/v1` or `http://<LAN_IP>:4000/api/v1`). |
