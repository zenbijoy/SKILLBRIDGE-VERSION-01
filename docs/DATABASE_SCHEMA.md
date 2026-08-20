# SkillBridge V3 Database Schema & Migrations

The database is built on PostgreSQL 15/16 with strict foreign key referential integrity, check constraints, row-level security (RLS), and atomic stored procedures.

---

## 1. Entity-Relationship Overview

```
                      ┌──────────────────────┐
                      │      auth.users      │
                      └──────────┬───────────┘
                                 │ 1:1
                                 ▼
                      ┌──────────────────────┐
                      │   public.profiles    │
                      └──────────┬───────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     │ 1:N                       │ 1:N                       │ 1:N
     ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐           ┌───────────────┐
│     rooms     │         │ points_ledger │           │  audit_logs   │
└───────┬───────┘         └───────────────┘           └───────────────┘
        │
        ├───────────────────────────┬───────────────────────────┐
        │ 1:N                       │ 1:N                       │ 1:N
        ▼                           ▼                           ▼
┌───────────────┐         ┌──────────────────┐        ┌───────────────┐
│ room_members  │         │ room_invitations │        │   sessions    │
└───────────────┘         └──────────────────┘        └───────┬───────┘
                                                              │ 1:N
                                                              ▼
                                                      ┌───────────────────┐
                                                      │session_participant│
                                                      └───────────────────┘
```

---

## 2. Core Tables

### `public.profiles`
Stores user profile information linked directly to `auth.users(id)`.
- `id` (uuid, PK, references `auth.users(id) on delete cascade`)
- `username` (text, unique, not null)
- `full_name` (text, not null)
- `avatar_url` (text)
- `university` (text)
- `reputation` (integer, default 0, check `>= 0`)
- `account_status` (text, default `'active'`, check in `('active', 'suspended', 'banned')`)
- `profile_visibility` (text, default `'public'`, check in `('public', 'connections', 'private')`)
- `roles` (text[], default `ARRAY['student']`)

### `public.rooms`
Collaborative peer study rooms.
- `id` (uuid, PK)
- `title` (text, not null)
- `topic` (text, not null)
- `description` (text)
- `owner_id` (uuid, references `profiles(id) on delete cascade`)
- `visibility` (text, check in `('public', 'private', 'invite_only')`)
- `capacity` (integer, default 25, check `between 2 and 500`)
- `member_count` (integer, default 1, check `member_count <= capacity`)
- `mode` (text, default `'online'`, check in `('online', 'offline', 'hybrid')`)
- `campus_location` (text)
- `status` (text, default `'open'`, check in `('open', 'live', 'archived')`)

### `public.room_invitations`
Formal invitation lifecycle for private and invite-only rooms.
- `id` (uuid, PK)
- `room_id` (uuid, references `rooms(id) on delete cascade`)
- `inviter_id` (uuid, references `profiles(id) on delete cascade`)
- `invitee_id` (uuid, references `profiles(id) on delete cascade`)
- `status` (text, default `'pending'`, check in `('pending', 'accepted', 'declined', 'revoked', 'expired', 'consumed')`)
- `created_at` (timestamptz)
- `expires_at` (timestamptz, default `now() + interval '7 days'`)
- Unique constraint: `UNIQUE(room_id, invitee_id) WHERE status = 'pending'`

### `public.points_ledger`
Immutable ledger for gamification and reputation.
- `id` (uuid, PK)
- `user_id` (uuid, references `profiles(id) on delete cascade`)
- `event_type` (text, not null)
- `points` (integer, not null)
- `reference_type` (text)
- `reference_id` (uuid)
- `created_at` (timestamptz)
- Unique constraint: `UNIQUE(user_id, event_type, reference_type, reference_id)`

### `public.audit_logs`
Transactional audit log for administrative and moderation actions.
- `id` (uuid, PK)
- `actor_id` (uuid, references `profiles(id) on delete set null`)
- `action` (text, not null)
- `target_type` (text, not null)
- `target_id` (uuid)
- `metadata` (jsonb)
- `created_at` (timestamptz)

---

## 3. Atomic Stored Procedures (RPCs)

1. `join_room_service_atomic(p_room_id uuid, p_user_id uuid)`
   - Row-level lock on `rooms` (`SELECT ... FOR UPDATE`).
   - Checks capacity boundary (`member_count < capacity`).
   - Checks invitations if room is `invite_only`.
   - Inserts membership as role `'member'`.
   - Consumes invitation if applicable.
   - Syncs `member_count`.

2. `award_reputation_atomic(p_user_id uuid, p_event_type text, p_points integer, p_reference_type text, p_reference_id uuid)`
   - Checks idempotency against `points_ledger`.
   - Inserts ledger entry.
   - Sums all points and updates `profiles.reputation`.

3. `admin_mutate_user_status_atomic(p_admin_id uuid, p_target_id uuid, p_new_status text, p_reason text)`
   - Validates actor has `admin` or `moderator` role.
   - Prevents moderators from modifying administrator accounts.
   - Prevents self-suspension/banning by administrators.
   - Executes status mutation and inserts `audit_logs` entry in the same transaction.
