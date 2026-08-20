# SkillBridge V3 LiveKit RTC Video Classroom Integration

SkillBridge V3 uses LiveKit SFU (Selective Forwarding Unit) for low-latency interactive video classrooms, audio discussions, and screen sharing.

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    actor Teacher as Teacher (Host)
    participant API as Express API
    participant LiveKit as LiveKit Cloud / SFU
    participant DB as PostgreSQL

    Teacher->>API: PATCH /sessions/:id (status: 'live')
    Teacher->>API: POST /live/token/:sessionId
    API->>API: Verify Role ('owner'/'teacher')
    API->>LiveKit: Generate Access Token (canPublish: true, canSubscribe: true, admin: true)
    API-->>Teacher: { token, url }
    Teacher->>LiveKit: Connect & Publish Camera / Screen

    Student->>API: POST /live/token/:sessionId
    API->>API: Verify Role ('member')
    API->>LiveKit: Generate Access Token (canPublish: false, canSubscribe: true)
    API-->>Student: { token, url, canPublish: false }
    Student->>LiveKit: Connect & Subscribe Stream

    Note over Student,LiveKit: Student raises hand via DataChannel packet
    Student->>LiveKit: sendData("RAISE_HAND")
    LiveKit->>Teacher: DataReceived ("RAISE_HAND" from Student)
    Teacher->>API: POST /live/sessions/:id/grant-speaker (student_id)
    API->>LiveKit: Update Participant Permissions (canPublish: true)
    Student->>LiveKit: Unmute & Speak
```

---

## 1. Classroom Token Generation & Permissions

- Endpoint: `POST /live/token/:sessionId`
- **Security Invariants**:
  - Requires valid JWT and active account status.
  - Verifies user is a confirmed participant or room member.
  - Requires session status to be strictly `'live'`.
  - Room teachers and owners receive publish + data permissions. Ordinary learners connect in subscribe-only mode by default.

---

## 2. Webhook Ingestion & Attendance Tracking

- Endpoint: `POST /webhooks/live`
- LiveKit sends cryptographically signed webhook events (`participant_joined`, `participant_left`, `room_finished`).
- The backend verifies the raw SHA256 signature using `LIVEKIT_API_SECRET`.
- On `participant_joined`, a new row in `livekit_attendance` is inserted with `joined_at = now()`.
- On `participant_left`, the open attendance row is closed with `left_at = now()` and `duration_seconds = EXTRACT(EPOCH FROM (left_at - joined_at))`.
