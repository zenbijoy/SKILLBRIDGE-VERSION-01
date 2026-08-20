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
- **Response**: `{ "total_users": number, "active_rooms": number, "total_sessions": number, "open_reports": number }`

### `PATCH /admin/users/:id/status`
Transactional user status mutation with audit logging.
- **Body**: `{ "status": "active"|"suspended"|"banned", "reason": string }`
- **Response**: `{ "success": true, "status": string }`

### `POST /admin/users/:id/role`
Update user permission roles.
- **Body**: `{ "roles": string[] }`
- **Response**: `{ "success": true, "roles": string[] }`
