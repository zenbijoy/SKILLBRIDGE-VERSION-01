# SkillBridge V3 Architecture & System Design

SkillBridge V3 is a peer-learning and research platform built for performance, reliability, and security.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SkillBridge Clients                              │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │ Expo / React Native / Web App │     │     React / Vite Admin Panel    │  │
│  └──────────────┬────────────────┘     └────────────────┬────────────────┘  │
└─────────────────┼───────────────────────────────────────┼───────────────────┘
                  │ HTTPS (REST) / WSS (Socket.IO)        │ HTTPS (REST API)
                  ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Node.js / Express API Backend                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Middlewares: Auth (JWT), Rate Limiter, Correlation ID, Error Handler │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐  │
│  │ Domain Controllers   │ │ Socket.IO Gateway    │ │ Push Outbox Worker  │  │
│  │ (Rooms, Chat, etc.)  │ │ (Typing, Messaging)  │ │ (Expo Notifications)│  │
│  └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬──────────┘  │
└─────────────┼────────────────────────┼────────────────────────┼─────────────┘
              │                        │                        │
     Postgres │ Connection Pool        │ LiveKit Webhooks       │ Cloud Storage
              ▼                        ▼                        ▼
┌──────────────────────────┐ ┌──────────────────────┐ ┌───────────────────────┐
│   PostgreSQL 15 / RLS    │ │     LiveKit Cloud    │ │   Supabase Storage    │
│  • 48 Domain Tables      │ │  • SFU Video Mesh    │ │  • avatars (public)   │
│  • Atomic Stored Proc    │ │  • Screen Sharing    │ │  • attachments (priv) │
│  • Points Ledger Trigger │ │  • Quality Adapters  │ │  • resources (priv)   │
└──────────────────────────┘ └──────────────────────┘ └───────────────────────┘
```

---

## 1. Core Architectural Pillars

### 1.1 Server-Authoritative State & Security
All business mutations (room joining, session scheduling, reputation rewards, role elevation, moderation actions, and account deletion) execute through strict server-authoritative routes and transactional PostgreSQL functions (`SECURITY DEFINER` with explicit `search_path = public`). Direct unrestricted database writes from public clients are blocked via PostgreSQL Row-Level Security (RLS).

### 1.2 Multi-Format Study Spaces
Rooms support three distinct formats:
- **Online**: Integrated LiveKit video classroom, real-time screen sharing, hand raising, and attendance recording.
- **Offline**: Physical campus study groups with building and room number verification.
- **Hybrid**: Combined in-person meetup with simultaneous LiveKit stream.

### 1.3 Offline-First Chat & Outbox
Chat messages are generated with client-side UUIDs (`client_message_id`), immediately stored in local outbox queues (`@chat_outbox_{conversationId}`), and synchronized with optimistic UI state. Upon reconnection, pending outbox items are drained with automatic retry and idempotency protection.

### 1.4 Verifiable Reputation Ledger
Reputation points cannot be arbitrarily incremented. All reputation changes require inserting an immutable record into `points_ledger` with unique reference constraints `(user_id, event_type, reference_type, reference_id)`. Triggers and atomic stored procedures recalculate and sync profile scores idempotently.

---

## 2. Component Topology

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Mobile & Web App** | Expo 51, React Native, TypeScript | Unified cross-platform frontend for iOS, Android, and Web |
| **Admin Control Plane** | React 18, Vite, TypeScript | Backoffice moderation, KPI monitoring, and user management |
| **API Backend** | Express, TypeScript, Node.js 20+ | REST API, validation, auth middleware, and business services |
| **Database** | PostgreSQL 15/16, Supabase | Relational data, foreign keys, RLS policies, and atomic RPCs |
| **Realtime Engine** | Socket.IO, LiveKit | Low-latency messaging, typing indicators, and video conferencing |
| **Storage Engine** | Supabase Storage (S3-compatible) | Avatars, private attachments, and course resources |
| **Testing Engine** | PGlite (WASM Postgres), Node Test | In-process real PostgreSQL test suite executing full migrations |
