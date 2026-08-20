# SkillBridge V3 System Architecture

SkillBridge V3 is an enterprise-grade peer-learning, study room, and collaborative research platform designed for scalability, zero-trust security, and resilience.

```mermaid
graph TD
    ClientApp["Expo / React Native / Web Client"]
    AdminPanel["React / Vite Admin Panel"]
    
    subgraph BackendGateway ["API Backend & Gateway (Node.js/Express)"]
        AuthMw["JWT Auth & Account Lock Middleware"]
        RateLimit["Rate Limiting & Correlation ID"]
        Controllers["Domain Controllers (Rooms, Chat, Research, etc.)"]
        SocketGateway["Socket.IO Realtime Gateway"]
        OutboxWorker["Durable Notification Outbox Worker"]
    end
    
    subgraph DataPlane ["Persistence & Storage Layer"]
        Postgres[("PostgreSQL 15 / Supabase DB (48 Tables, RLS, RPCs)")]
        PrivateBuckets[("Supabase Storage: attachments, resources, avatars")]
        RedisCache[("Redis (Optional Ephemeral Cache/Presence)")]
    end
    
    subgraph ExternalProviders ["Media & Push Services"]
        LiveKitCloud["LiveKit RTC Video / Audio Mesh"]
        ExpoPush["Expo Push Notification Service"]
    end
    
    ClientApp -->|HTTPS / REST| AuthMw
    ClientApp -->|WSS / Socket.IO| SocketGateway
    AdminPanel -->|HTTPS / REST| AuthMw
    
    AuthMw --> RateLimit
    RateLimit --> Controllers
    
    Controllers --> Postgres
    Controllers --> PrivateBuckets
    Controllers --> RedisCache
    Controllers --> LiveKitCloud
    
    SocketGateway --> Postgres
    OutboxWorker --> Postgres
    OutboxWorker --> ExpoPush
```

---

## 1. System Responsibility Boundaries

- **Client Layer (Expo / React Native / Web)**:
  - Cross-platform presentation layer for iOS, Android, and Web browsers.
  - Local state caching using TanStack React Query, AsyncStorage, and optimistic message queues.
  - Native media drivers (LiveKit React Native SDK, WebRTC, Expo Haptics, Expo Notifications).
- **Application Server (Node.js / Express)**:
  - JWT token verification and centralized account-lockdown enforcement.
  - Domain request validation with Zod schemas.
  - Server-authoritative business logic and atomic transactions.
  - Socket.IO gateway with connection authentication and room isolation.
  - Background outbox worker processing push notifications with exponential backoff.
- **Database & Storage Layer (PostgreSQL 15 / Supabase)**:
  - 48 domain tables with referential integrity constraints.
  - Row-Level Security (RLS) policies preventing unauthorized client queries.
  - `SECURITY DEFINER` atomic stored procedures with explicit `search_path = public` and execution restricted to `service_role`.
  - S3-compatible private object storage for chat attachments and learning materials with signed download claims.
- **Media Engine (LiveKit Cloud / Self-Hosted)**:
  - SFU (Selective Forwarding Unit) video/audio streams.
  - Screen sharing, hand-raising data packets, and active speaker detection.
  - Webhook ingestion for verified attendance tracking.

---

## 2. Zero-Trust Security Model

```mermaid
sequenceDiagram
    autonumber
    actor User as Client
    participant API as Express API
    participant DB as PostgreSQL (RLS / RPC)
    participant Storage as Private S3 Bucket

    User->>API: Request Download (e.g. GET /resources/:id/download)
    API->>API: Verify JWT & User Status (active)
    API->>DB: Check Room / Resource Authorization
    alt Not Authorized
        DB-->>API: Access Denied
        API-->>User: 403 Forbidden
    else Authorized
        DB-->>API: Authorized
        API->>Storage: Generate Short-Lived Signed URL (60s expiry)
        Storage-->>API: Signed URL
        API-->>User: 200 OK { url: "https://..." }
    end
```
