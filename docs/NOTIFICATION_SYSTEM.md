# SkillBridge V3 Durable Notification & Outbox System

SkillBridge guarantees reliable mobile push delivery by combining transactional outbox pattern persistence with an asynchronous worker.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Room Owner
    participant API as Express API
    participant DB as PostgreSQL (Outbox Table)
    participant Worker as Outbox Queue Worker
    participant Expo as Expo Push Service
    actor Bob as Room Member

    Alice->>API: Schedule Session (POST /sessions)
    rect rgb(240, 248, 255)
        Note over API,DB: Transactional Boundary
        API->>DB: INSERT INTO sessions
        API->>DB: INSERT INTO notification_outbox (user_id: Bob, type: 'session_created', status: 'pending')
    end
    API-->>Alice: 201 Created

    loop Every 5 Seconds
        Worker->>DB: SELECT FOR UPDATE SKIP LOCKED FROM notification_outbox WHERE status = 'pending' LIMIT 50
        Worker->>DB: Check Bob's quiet_hours & push_devices
        Worker->>Expo: POST /v2/push/send (Batch of Expo push tickets)
        Expo-->>Worker: Return Ticket Receipts
        Worker->>DB: UPDATE notification_outbox SET status = 'delivered', attempts = attempts + 1
    end
    Expo->>Bob: Deliver Push Notification
```

---

## 1. Outbox Worker Architecture

1. **Transactional Insertion**: Business events (room invitations, session alerts, connection requests) insert the business entity and the notification payload in the **same database transaction**.
2. **Safe Concurrent Claims**: The worker claims unhandled items using `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate delivery across multiple API server instances.
3. **Quiet Hours Enforcement**: Before dispatching, the worker checks the user's notification preferences:
   - If current time is within `quiet_hours_start` and `quiet_hours_end`, the notification is deferred or downgraded to in-app only.
4. **Exponential Backoff**: If Expo push returns a transient error (e.g. rate limit, 503), `next_retry_at` is scheduled with exponential jitter (`attempts^2 * 10 seconds`).
