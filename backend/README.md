# SkillBridge Node/Express API

Server-authoritative API for Supabase/PostgreSQL, realtime Socket.IO chat, LiveKit access tokens, Expo push notifications, moderation, account deletion and optional AI gateway.

## Run
`cp .env.example .env && npm install && npm run dev`

Never expose `SUPABASE_SERVICE_ROLE_KEY`, LiveKit secret or AI provider keys in the Expo client.
