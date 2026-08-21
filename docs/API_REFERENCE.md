# SkillBridge V3 API Reference

All REST endpoints are rooted at `/api/v1` (or direct backend routes) and require a Bearer JWT in the `Authorization` header unless explicitly noted.

---

## 1. Authentication & System Health

### `GET /health`
Returns basic health check status.
- **Auth**: None
- **Response**: `{ "status": "ok", "timestamp": string }`

### `GET /health/ready`
Returns capability readiness of connected services (PostgreSQL, LiveKit, Redis, Push).
- **Auth**: None
- **Response**: `{ "status": "ready", "database": true, "livekit": boolean, "redis": boolean }`

---

## 2. Study Rooms & Invitations

### `GET /rooms`
List study rooms with optional filtering and pagination.
- **Query Params**: `topic`, `mode` (`online|offline|hybrid`), `visibility`, `limit`, `offset`
- **Response**: `{ "rooms": Room[] }`

### `POST /rooms`
Create a new study room.
- **Body**: `{ "title": string, "topic": string, "description"?: string, "visibility": "public"|"private"|"invite_only", "capacity": number, "mode": "online"|"offline"|"hybrid", "campus_location"?: string, "tags"?: string[], "rules"?: string }`
- **Response**: `{ "room": Room }`

### `POST /rooms/:id/join`
Join a study room (uses atomic concurrency and capacity validation).
- **Response**: `{ "joined": true, "role": "member", "member_count": number }`

### `POST /rooms/:id/leave`
Leave a study room.
- **Response**: `{ "left": true, "member_count": number }`

### `POST /rooms/:id/invitations`
Send a room invitation to a peer.
- **Body**: `{ "username": string }` or `{ "user_id": string }`
- **Response**: `{ "invitation": InvitationItem }`

### `GET /rooms/invitations/received`
List pending invitations received by the current user.
- **Response**: `InvitationItem[]`

### `POST /rooms/invitations/:id/accept`
Accept a room invitation and join the room.
- **Response**: `{ "joined": true, "room_id": string }`

### `POST /rooms/invitations/:id/decline`
Decline a room invitation.
- **Response**: `{ "declined": true }`

### `POST /rooms/invitations/:id/revoke`
Revoke a pending room invitation sent by the current user or room moderator.
- **Response**: `{ "revoked": true }`

---

## 3. Global Search & Discovery

### `GET /search`
Global fuzzy and trigram search across 7 entity kinds.
- **Query Params**: `q` (query string), `kind` (`all|peers|rooms|events|research|clubs|skills|resources`), `page` (1-based), `limit` (default 20)
- **Response**: `{ "results": SearchResult[], "page": number, "hasMore": boolean }`

---

## 4. Leaderboard & Gamification

### `GET /gamification/leaderboard`
Server-authoritative category rankings.
- **Query Params**: `category` (`reputation|tutors|learners|research`), `window` (`weekly|monthly|all_time`), `campus` (optional)
- **Response**: `{ "leaders": LeaderProfile[] }`

---

## 5. Live Sessions & LiveKit Video

### `POST /sessions`
Schedule a classroom session.
- **Body**: `{ "room_id": string, "starts_at": string, "mode": "online"|"offline"|"hybrid", "campus_location"?: string }`
- **Response**: `{ "session": Session }`

### `POST /live/token/:sessionId`
Obtain a signed LiveKit connection token for classroom video/audio.
- **Response**: `{ "token": string, "url": string, "canPublish": boolean }`

---

## 6. Admin Control Plane

### `GET /admin/stats`
Platform KPIs and counts (admin/moderator only).
- **Response**: `{ "totalUsers": number, "activeUsers": number, "totalRooms": number, "activeSessions": number, "totalReports": number, "pendingReports": number, "recentActivity": object[] }`

### `PATCH /admin/users/:id/status`
Transactional user status mutation with audit logging.
- **Body**: `{ "status": "active"|"suspended"|"banned", "reason": string }`
- **Response**: `{ "success": true, "status": string }`

### `PUT /admin/users/:id/roles`
Replace a user's elevated role (administrator only). Base product roles are preserved.
- **Body**: `{ "elevatedRole": "moderator"|"admin"|null }`
- **Response**: `{ "success": true, "roles": string[] }`

### Product experience administration
- `GET /admin/dashboard-configs`; `PATCH /admin/dashboard-configs/:id`
- `GET|POST /admin/announcements`; `PATCH /admin/announcements/:id`
- `GET|POST /admin/feature-flags`; `PATCH /admin/feature-flags/:key`
- `GET /admin/experience-content?type=welcome|onboarding|tour&locale=en|bn`
- `POST /admin/experience-content/:type/:locale/publish`

Read operations require moderator or administrator access. Product mutations and content publishing require the `admin` role and write audit records.

---

## 7. Onboarding, Dashboard, Tour & Preferences

### `GET /experience/content`
Returns the active versioned welcome, onboarding, or guided-tour content set.
- **Auth**: None
- **Query Params**: `type` (`welcome|onboarding|tour`), `locale` (`en|bn`)
- **Response**: `{ "contentSets": [{ "content_type": string, "locale": string, "version": number, "content": object|object[], "updated_at": string }] }`

### `POST /profiles/me/onboarding/bulk`
Atomically saves onboarding profile fields and synchronizes known/wanted skills.
- **Body**: profile fields such as `full_name`, `username`, `onboarding_step`, and `onboarding_status`, plus optional `teachSkills: string[]` and `learnSkills: string[]`
- **Response**: persisted profile, completion percentage, missing fields, and canonical skill names

### `POST /profiles/me/tour/progress`
Persists a versioned tour chapter, skip, or completion. Completion rewards are idempotent.
- **Body**: `{ "step": string, "isLast"?: boolean, "skipped"?: boolean, "version": number }`

### `GET /dashboard`
Returns the server-resolved dashboard layout, eligible widget configuration, feature flags, active targeted announcements, and live widget data.
- **Query Params**: `mode` (`learn|teach|research`)
- **Client headers**: `X-App-Version`, `X-Locale`, and `X-Data-Saver` influence targeting and payload policy.

### `POST /dashboard/layout` / `POST /dashboard/layout/reset`
Atomically saves a validated user widget layout or resets it to a role preset.

### `POST /dashboard/announcements/:id/dismiss`
Persists dismissal of an eligible dismissible announcement for the current user.

### `GET|PATCH /notifications/preferences`
Reads or atomically patches category preferences, quiet hours, and push opt-in without overwriting unrelated preference fields.
