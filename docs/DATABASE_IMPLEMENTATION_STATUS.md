# Database Implementation Status (Phase 1.1)

| Table | Migration | RLS Enabled | Frontend Direct Access | Backend Service-Role Access | Notes / Unique Constraints |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `profiles` | 001 | Yes | Yes (Limited) | Yes | Contains materialized `reputation` |
| `user_skills` | 001 | Yes | Yes | Yes | `UNIQUE(user_id, skill_id)` |
| `connections` | 001 | Yes | No | Yes | Severed atomically on block via `block_user_atomic` RPC |
| `connection_requests` | 001 | Yes | No | Yes | Cleared atomically on block |
| `rooms` | 001 | Yes | Yes (Public) | Yes | |
| `room_members` | 001 | Yes | No | Yes | `role` elevated via `accept_teaching_request` RPC |
| `teaching_requests` | 001 | Yes | No | Yes | Backend-only transitions |
| `sessions` | 002 | Yes | No | Yes | Backend-only state transitions enforced (`draft`, `scheduled`, `in_progress`, `completed`, `cancelled`) |
| `session_participants` | 002 | Yes | No | Yes | Attendance lock |
| `reviews` | 002 | Yes | No | Yes | `UNIQUE(session_id, reviewer_id)` |
| `points_ledger` | 002 | Yes | No | Yes | `UNIQUE(user_id, event_type, reference_type, reference_id)` (Added in 004) |
| `blocks` | 002 | Yes | No | Yes | `UNIQUE(blocker_id, blocked_id)` (Atomic via 004 RPC) |
| `reports` | 002 | Yes | No | Yes | Backend-only |
| `research_projects` | 003 | Yes | No | Yes | |
| `research_collaboration_requests` | 003 | Yes | No | Yes | |
| `resources` | 001 | Yes | No | Yes | Upload/Download uses signed URLs via storage bucket |
| `conversations` | 001 | Yes | No | Yes | Backend-only |
| `messages` | 001 | Yes | No | Yes | Backend-only |

## Applied Migrations
- `001_schema.sql`: Core tables, RLS, functions, triggers, trigram extension.
- `002_gamification.sql`: Points, blocks, reports, reviews.
- `003_research.sql`: Research projects, collaboration.
- `004_transactions.sql`: Atomic RPC functions (`accept_teaching_request`, `block_user_atomic`, `submit_review_atomic`) and idempotency constraints.
