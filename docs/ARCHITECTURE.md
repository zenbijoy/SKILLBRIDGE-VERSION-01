# Architecture

## Client
Expo Router provides route-driven Android/iOS/Web navigation. React Query owns server-state, Zustand holds small UI state, Supabase client handles the auth session, and all privileged writes go through Express.

## API
Node/Express validates the Supabase bearer session on every protected API request. The service-role key stays on the server. Zod validates request bodies. Socket.IO handles low-latency chat events. The API issues short-lived LiveKit tokens according to room role.

## Data ownership
1. Supabase PostgreSQL: profiles, skills, social graph, rooms, sessions, clubs/events, chat persistence, resources metadata, reputation, moderation.
2. Supabase Storage: avatars and room resources with path-scoped policies.
3. Redis: dashboard/search cache and future distributed rate limiting; no durable business data.
4. Firebase/FCM via Expo notifications: Android push delivery and optional Analytics/Crash reporting setup.
5. LiveKit: ephemeral media sessions. Store only room/session metadata in Postgres.

## Security boundaries
- Expo client sees only Supabase anon key and public API URL.
- Service-role, LiveKit secret and AI keys exist only in backend environment variables.
- RLS provides defense-in-depth for direct Supabase client access.
- Quizzes never expose `correct_answer` through a client policy.
- Reputation changes are produced by backend events/ledger, never arbitrary client balances.
- Room join capacity is enforced in a database transaction (`join_room_atomic`).
