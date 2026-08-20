# SkillBridge V3 Realtime Chat & Messaging Architecture

SkillBridge V3 combines Socket.IO for low-latency delivery with PostgreSQL as the immutable, authoritative source of truth.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Sender (Alice)
    participant ClientA as Alice Client Outbox
    participant SocketServer as Socket.IO Server
    participant DB as PostgreSQL
    participant Bob as Recipient (Bob)

    Alice->>ClientA: Type & Send Message
    ClientA->>ClientA: Generate client_message_id & Store in AsyncStorage Outbox
    ClientA->>SocketServer: emit('send_message', { body, client_message_id, conversation_id })
    SocketServer->>DB: Authorize Member & INSERT INTO messages
    DB-->>SocketServer: Saved (id, created_at)
    SocketServer->>ClientA: Ack / emit('message_sent', savedMessage)
    ClientA->>ClientA: Remove from AsyncStorage Outbox (Mark 'sent')
    SocketServer->>Bob: emit('new_message', savedMessage)
    Bob->>SocketServer: emit('message_read', { conversation_id, message_id })
    SocketServer->>DB: UPDATE conversation_members (last_read_message_id)
    SocketServer->>ClientA: emit('message_status_updated', { message_id, status: 'read' })
```

---

## 1. Offline Outbox & Idempotency

1. **Client Generation**:
   - Every outgoing message is assigned a client-side UUID (`client_message_id`).
   - The message is persisted to `@chat_outbox_{conversationId}` before network transmission.
2. **Optimistic Rendering**:
   - The UI immediately renders the message with a `pending` status icon.
3. **Idempotent Ingestion**:
   - The backend checks `client_message_id` on insert. If already received, the existing message record is returned without creating duplicates.
4. **Offline Drain**:
   - Upon network reconnection or app resumption, the client iterates over the local outbox queue and replays unsent items.

---

## 2. Private Attachments Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Client
    participant API as Express API
    participant S3 as Private Storage (attachments)
    participant Socket as Socket.IO

    User->>API: POST /chat/conversations/:id/upload (base64, metadata)
    API->>API: Authorize Conversation Membership & Validate MIME/Size
    API->>S3: Upload to /attachments/conv_{id}/{uuid}.ext
    S3-->>API: Stored
    API-->>User: Return Attachment ID & Metadata
    User->>Socket: Send Message with Attachment Reference
    Socket->>User: Message Broadcasted with Signed Thumbnail URL
```
