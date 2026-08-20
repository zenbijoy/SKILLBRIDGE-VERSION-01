# SkillBridge V3 Domain Logic & Business Rules

SkillBridge V3 enforces server-authoritative business rules across all peer-learning and collaboration workflows.

---

## 1. Study Room Lifecycle & Capacity Rules

```mermaid
stateDiagram-v2
    [*] --> Open: Created by Owner
    Open --> Scheduled: Session Added
    Scheduled --> Live: LiveKit Started
    Live --> Completed: Session Concluded
    Open --> Archived: Owner Archived
    Scheduled --> Cancelled: Cancelled by Host
    Live --> Cancelled: Force Terminated
    Completed --> Archived
    Cancelled --> Archived
    Archived --> [*]
```

### Business Invariants:
1. **Capacity Boundaries**: Rooms strictly enforce a maximum member limit (`2 <= capacity <= 500`). When a room is full, concurrent join attempts are rejected via row-level locking (`SELECT ... FOR UPDATE`).
2. **Delivery Formats**:
   - `online`: Virtual video classroom using LiveKit.
   - `offline`: Physical campus study group requiring a valid `campus_location` (e.g. building and room).
   - `hybrid`: Simultaneous in-person gathering with LiveKit video broadcast.
3. **Owner Integrity**: The room owner cannot leave the room without explicitly transferring ownership to an active member or archiving the room.

---

## 2. Room Invitation State Machine

```mermaid
stateDiagram-v2
    [*] --> Pending: Host / Mod Issues Invite
    Pending --> Accepted: Invitee Accepts
    Pending --> Declined: Invitee Rejects
    Pending --> Revoked: Host / Mod Cancels
    Pending --> Expired: Expiration (7 Days)
    Accepted --> Consumed: Atomic Join Completed
    Consumed --> [*]
    Declined --> [*]
    Revoked --> [*]
    Expired --> [*]
```

- **Uniqueness**: Only one active `pending` invitation can exist per `(room_id, invitee_id)` pair.
- **Consumption**: When an invitee joins, the invite status atomically transitions to `consumed` in the same database transaction.

---

## 3. Session Scheduling & Attendance Logic

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher / Owner
    actor Learner as Room Member
    participant Backend as Express API
    participant LiveKit as LiveKit SFU
    participant DB as PostgreSQL

    Teacher->>Backend: Schedule Session (starts_at, mode, location)
    Backend->>DB: Insert Session & Notify Room Members
    Learner->>Backend: RSVP Session (confirmed)
    Teacher->>Backend: Start Live Class (status -> live)
    Learner->>Backend: Request Token (GET /live/token/:sessionId)
    Backend->>LiveKit: Generate Participant Token (subscribe-only or publisher)
    Backend-->>Learner: Return Token
    Learner->>LiveKit: Connect & Stream
    LiveKit->>Backend: Webhook (participant_joined / participant_left)
    Backend->>DB: Record livekit_attendance Segment (duration_seconds)
    Teacher->>Backend: End Session (status -> completed)
    Learner->>Backend: Submit Review (rating, comment)
    Backend->>DB: award_reputation_atomic (points_ledger)
```

- **RSVP vs. Attendance**: RSVP status (`invited`, `confirmed`, `declined`) is strictly decoupled from verified attendance (`attended`, `absent`, `duration_seconds`).
- **Review Eligibility**: Reviews are permitted only by verified attendees after the session is marked `completed`.
