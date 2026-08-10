# SkillBridge Infrastructure

- Supabase: Postgres/Auth/Storage/RLS and persistent application data.
- Redis: short-lived cache/rate-limit support only; never source-of-truth.
- LiveKit: WebRTC live classrooms, calls and screen-share capable sessions.
- Caddy: TLS/reverse proxy example.

Replace all development secrets, domains and LiveKit keys before any public deployment.
