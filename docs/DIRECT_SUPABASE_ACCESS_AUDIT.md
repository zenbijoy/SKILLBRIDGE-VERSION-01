# Direct Supabase Access Audit

This document verifies compliance with the architecture directive: **The frontend must not directly access sensitive tables (like `conversations`, `messages`, `teaching_requests`) using the Supabase client (`supabase.from()`).** All database operations should be routed through the authenticated Node.js backend.

## Audit Findings
A comprehensive semantic search was executed across `frontend/src` and `frontend/app` for any instances of `supabase.from(`. 

**Result: PASS**
- Zero instances of `supabase.from()` were found in the frontend codebase.
- The frontend correctly delegates database queries and mutations to the Express API (`/api/v1/*`), utilizing React Query for state management.
- The Supabase client in the frontend (`src/lib/supabase.ts`) is strictly configured and utilized only for authentication (e.g., `supabase.auth.signInWithPassword()`).

## Table Access Classification
The database tables are classified according to their intended access pattern:

| Table | Access Classification | Notes |
| :--- | :--- | :--- |
| `profiles` | CLIENT READ WITH RLS | Backend handles updates to ensure schema integrity and validations. |
| `conversations` | BACKEND ONLY | Fully locked via RLS. Accessed via Express APIs to enforce participant logic. |
| `conversation_members`| BACKEND ONLY | Managed securely by the backend when users join or leave DMs/groups. |
| `messages` | BACKEND ONLY | Sent via `/api/v1/chat` and retrieved securely; backend manages Socket.io pushes. |
| `teaching_requests` | BACKEND ONLY | Creation and status updates (accept/reject) are guarded by backend room-member authorization rules. |
| `session_participants`| BACKEND ONLY | Regulated by backend when sessions are scheduled or attended. |
| `quiz_questions` | SERVER ONLY | Locked from clients to prevent `correct_answer` exposure. |
| `quizzes` | CLIENT READ WITH RLS | Safe for clients to read active quizzes. |
| `rooms` | CLIENT READ WITH RLS | Public rooms are visible; joining requires `join_room_atomic` or backend auth. |

No `service_role` keys are exposed to the frontend, and all direct Supabase queries originate from the backend's `admin` client.
