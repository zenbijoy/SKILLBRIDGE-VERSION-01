# SkillBridge V3 State Machines & Lifecycle Specifications

SkillBridge V3 governs all business entities via deterministic, validated finite state machines.

---

## 1. Account & Profile State Machine

```mermaid
stateDiagram-v2
    [*] --> Active: User Registered & Onboarded
    Active --> Suspended: Admin Moderation Action
    Active --> Banned: Severe Violation
    Active --> Deactivated: User Self-Deactivation
    Active --> DeletionPending: User Requested Delete
    Suspended --> Active: Admin Reinstatement
    Deactivated --> Active: User Logged In
    DeletionPending --> Deleted: Storage & DB Cleanup Finalized
    Banned --> [*]
    Deleted --> [*]
```

### Invariants:
- `suspended` / `banned`: HTTP middleware immediately rejects requests with `403 Forbidden`. Sockets and LiveKit tokens are revoked.
- `deletion_pending`: Paginated background cleanup sweeps all storage buckets (`avatars`, `attachments`, `resources`) before deleting the user row from `auth.users`.

---

## 2. Room State Machine

```mermaid
stateDiagram-v2
    [*] --> Open: Room Created
    Open --> Scheduled: Session Scheduled
    Scheduled --> Live: LiveKit Room Activated
    Live --> Completed: Session Ended
    Open --> Archived: Owner Archived
    Scheduled --> Cancelled: Cancelled by Host
    Completed --> Archived: Owner Archived
    Cancelled --> Archived: Owner Archived
    Archived --> [*]
```

---

## 3. Session State Machine

```mermaid
stateDiagram-v2
    [*] --> Scheduled: Created by Teacher/Owner
    Scheduled --> Live: Teacher Started Class
    Scheduled --> Cancelled: Cancelled Before Start
    Live --> Completed: Teacher Ended Class
    Live --> Cancelled: Force Terminated
    Completed --> [*]
    Cancelled --> [*]
```

---

## 4. Research Project & Collaboration State Machine

```mermaid
stateDiagram-v2
    [*] --> Draft: Project Created
    Draft --> Active: Published by PI
    Active --> Completed: Research Finalized
    Active --> Archived: Project Closed
    Completed --> Archived: Project Archived
    Archived --> [*]
```

### Collaboration Application State Machine
```mermaid
stateDiagram-v2
    [*] --> Pending: Student Applies
    Pending --> Accepted: PI Approves & Adds Member
    Pending --> Rejected: PI Declines
    Pending --> Cancelled: Student Withdraws
    Accepted --> [*]
    Rejected --> [*]
    Cancelled --> [*]
```

---

## 5. Chat Message Delivery State Machine

```mermaid
stateDiagram-v2
    [*] --> LocalQueued: Saved in Client Outbox
    LocalQueued --> Sending: Socket.IO Emitted
    Sending --> Sent: Server Persisted in DB
    Sending --> Failed: Network Timeout / Disconnect
    Failed --> LocalQueued: Client Retry
    Sent --> Delivered: Recipient Socket Receives
    Delivered --> Read: Recipient Opens Conversation
    Sent --> Deleted: Soft Delete (deleted_at set)
    Read --> Deleted: Soft Delete
    Deleted --> [*]
```
