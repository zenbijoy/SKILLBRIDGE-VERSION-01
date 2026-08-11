# Mobile Production Configuration & Environment Template

## React Native / Expo Environment Rules

1. **Only Public Values**: The mobile application bundle (iOS / Android) MUST ONLY contain public configuration keys.
2. **Never Included in Mobile Bundle**:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
   - `REDIS_URL`
   - JWT Signing Secrets
   - LiveKit API Secrets

## Environment Template

```env
# EXPO PUBLIC ENVIRONMENT CONFIGURATION
EXPO_PUBLIC_API_URL=https://swapno.duckdns.org/api/v1
EXPO_PUBLIC_SUPABASE_URL=https://swapno.duckdns.org
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Mobile Bearer Authentication Flow

```
Mobile App (React Native)
      │
      │ 1. User Logs in via Supabase Auth
      ▼
Supabase Auth (https://swapno.duckdns.org)
      │
      │ 2. Returns Session Token (access_token)
      ▼
SkillBridge Express API
      │
      │ 3. Header: Authorization: Bearer <access_token>
      │ 4. Express Auth Middleware verifies token via supabase.auth.getUser(token)
      │ 5. Express API executes request under authenticated user context
```
