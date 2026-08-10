# API Feature Coverage Map (Phase 1.1)

This document tracks the end-to-end implementation status of SkillBridge features across the stack, reconciled against the actual codebase implementation.

| Feature | Frontend UI | Frontend Data Layer | HTTP/Realtime API | Backend Route | Database Tables | Auth Required | Automated Tests | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth** | `(auth)/sign-in.tsx`, `(auth)/sign-up.tsx` | Supabase SDK + 401 Interceptor | N/A (Client-direct) | N/A | Auth triggers | No | N/A | IMPLEMENTED | 401 refresh deduplication active. |
| **Profile** | `(tabs)/profile.tsx`, `user/[id].tsx` | React Query | `GET /api/v1/profiles` | `profiles.ts` | `profiles` | Yes | N/A | IMPLEMENTED | |
| **Skills** | `settings/skills.tsx` | React Query | `GET /api/v1/profiles/skills` | `profiles.ts` | `user_skills` | Yes | N/A | IMPLEMENTED | |
| **Search** | `(tabs)/discover.tsx` | React Query | `GET /api/v1/search` | `search.ts` | `profiles`, `rooms` | Yes | N/A | IMPLEMENTED | Relies on standard relational ILIKE/Trigram queries. |
| **Recommendations**| `(tabs)/discover.tsx` | React Query | `GET /api/v1/recommendations` | `recommendations.ts`| `connections`, `profiles` | Yes | N/A | IMPLEMENTED | Uses weighted relational recommendation algorithm (NOT Vector Search). |
| **Connections** | `connections.tsx` | React Query | `GET /api/v1/connections` | `connections.ts`| `connections`, `connection_requests` | Yes | N/A | IMPLEMENTED | |
| **Rooms** | `(tabs)/rooms.tsx`, `room/[id].tsx` | React Query | `GET /api/v1/rooms` | `rooms.ts` | `rooms`, `room_members` | Yes | N/A | IMPLEMENTED | |
| **Teacher Volunteering** | `room/[id].tsx` | React Query | `POST /api/v1/rooms/:id/teach` | `rooms.ts` | `teaching_requests` | Yes | PASS | IMPLEMENTED | Uses `accept_teaching_request` RPC for transactional integrity. |
| **Sessions (Schedule)**| `room/[id].tsx` (Card list) | React Query | `POST/PATCH /api/v1/sessions` | `sessions.ts` | `sessions`, `session_participants`| Yes | PASS | IMPLEMENTED | Enforces valid status state machine transitions. |
| **Reviews / Reputation** | `room/[id].tsx`, profile pill | React Query / Alert | `POST /api/v1/sessions/:id/review`| `sessions.ts` | `reviews`, `points_ledger` | Yes | PASS | IMPLEMENTED | Submits atomically via `submit_review_atomic` RPC. Idempotent points. |
| **Blocking** | `user/[id].tsx`, `settings/privacy.tsx` | React Query | `POST /api/v1/account/blocks` | `account.ts` | `blocks`, `connections` | Yes | PASS | IMPLEMENTED | Severs connections atomically via `block_user_atomic` RPC. |
| **Moderation** | `user/[id].tsx` (ReportSheet) | React Query | `POST /api/v1/moderation` | `moderation.ts` | `reports` | Yes | N/A | IMPLEMENTED | Target types are dynamically mapped. |
| **Research** | `research.tsx` | React Query | `GET /api/v1/research` | `research.ts` | `research_projects`, `research_collaboration_requests` | Yes | N/A | IMPLEMENTED | |
| **Resources** | `room/[id].tsx` (Resources UI) | React Query | `GET /api/v1/resources/:id/download` | `resources.ts` | `resources` | Yes | PASS | IMPLEMENTED | Protected by signed URLs. |
| **Chat** | `chat/[id].tsx`, `(tabs)/inbox.tsx`| `socket.io-client` | `GET /api/v1/chat` | `chat.ts` | `conversations`, `messages` | Yes | N/A | IMPLEMENTED | |
| **Live (WebRTC)** | `live/[roomId].tsx` | LiveKit Client | `GET /api/v1/live/token` | `live.ts` | N/A | Yes | N/A | BLOCKED BY CREDENTIAL | Depends on LiveKit external server configuration. |

*Note: Automated tests were executed using a deterministic database mock adapter targeting API business rules and RPC boundaries.*
