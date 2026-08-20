# SkillBridge V3 Admin Operations & Moderation Guide

The SkillBridge Control Plane enables authorized moderators and administrators to govern platform safety, resolve user reports, and manage accounts with transactional audit logging.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Moderator / Admin
    participant Frontend as Admin UI / Mobile App
    participant Backend as Express API
    participant RPC as admin_mutate_user_status_atomic
    participant DB as PostgreSQL

    Admin->>Frontend: Select User -> Action: Suspend (reason: "Spam")
    Frontend->>Backend: PATCH /admin/users/:id/status { status: "suspended", reason: "Spam" }
    Backend->>RPC: CALL admin_mutate_user_status_atomic(admin_id, target_id, 'suspended', 'Spam')
    rect rgb(240, 248, 255)
        Note over RPC,DB: Single Transaction
        RPC->>DB: Check Role Hierarchy (Moderator cannot modify Admin)
        RPC->>DB: UPDATE profiles SET account_status = 'suspended'
        RPC->>DB: INSERT INTO audit_logs (actor_id, action, target_id, metadata)
    end
    DB-->>RPC: Success
    RPC-->>Backend: { success: true, status: "suspended" }
    Backend-->>Frontend: 200 OK
```

---

## 1. Moderation Workflows

### Reports Queue Management
- **View Reports**: Filter by `open`, `investigating`, `resolved`, or `dismissed`.
- **Review Content**: Inspect context (reported messages, room description, or user profile).
- **Take Action**:
  - **Resolve & Dismiss**: Mark report as reviewed with no punitive action.
  - **Resolve & Suspend**: Atomically update user status to `suspended` and record audit log.
  - **Resolve & Ban**: Terminate access permanently.

### User Role Elevation
- Administrators can elevate active users to `moderator` or `tutor`.
- Moderators cannot elevate accounts or alter Administrator privileges.

---

## 2. Audit Trail Guarantees

Every administrative action persists to `public.audit_logs`:
- `actor_id`: UUID of acting moderator/admin.
- `action`: E.g. `moderation.user.status`, `moderation.report.decision`, `moderation.role.update`.
- `target_id`: UUID of target entity.
- `metadata`: JSON payload recording reason, previous state, new state, and client metadata.
