# SkillBridge Hybrid Realtime Communication Architecture

## 1. Overview & Strategy

SkillBridge implements a 3-tier hybrid communication system to deliver low-latency audio/video calls and broadcasts while eliminating unnecessary server compute and bandwidth costs:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        MEDIA ROUTING DECISION ENGINE                           │
├────────────────────────────────┬─────────────────────┬─────────────────────────┤
│ Session Type & Scale           │ Media Provider      │ Cost & Architecture     │
├────────────────────────────────┼─────────────────────┼─────────────────────────┤
│ 1-to-1 Audio & Video (2 peers) │ Raw WebRTC P2P      │ $0 Server Media Compute │
│                                │ Cloudflare TURN     │ Ephemeral Relay fallback│
│ 3+ Participants (CT / Groups)  │ LiveKit SFU Cloud   │ Selective Forward Unit  │
│ 100–10,000+ Viewers (Clubs)    │ YouTube Live        │ Direct Embedded Stream  │
│ Post-Broadcast Q&A Stage       │ LiveKit SFU         │ Picked on-stage speakers│
└────────────────────────────────┴─────────────────────┴─────────────────────────┘
```

---

## 2. Server-Authoritative Routing

Provider selection is governed directly by the backend in `POST /api/v1/calls`. The server inspects participant count, session mode, and the `P2P_CALLS_ENABLED` configuration flag, returning:
```json
{
  "call": { "id": "...", "status": "ringing" },
  "provider": "webrtc",
  "providerConfig": {}
}
```
If `P2P_CALLS_ENABLED=false`, the server automatically returns `provider: "livekit"` along with a signed LiveKit Access Token and room name. The client adheres strictly to the server's selected provider.

---

## 3. Security & Privacy Guarantees

1. **Zero Media via Node.js / Render**: Audio and video packets travel strictly peer-to-peer (or via Cloudflare TURN relay if NAT traversal fails).
2. **Ephemeral TURN Tokens**: The root Cloudflare API Token is stored only on the backend. Clients request short-lived credentials via `GET /api/v1/calls/ice-servers` (`ttl = 3600s`, Cache-Control: `private, no-store`).
3. **Strict Signaling Authorization**: Every Socket.IO signal verifies caller/callee membership in the database and rate-limits messaging. Client-supplied participant IDs are never trusted blindly.
4. **Instant Feature-Flag Rollback**: Set `P2P_CALLS_ENABLED=false` in backend environment to immediately fallback 1:1 calls to LiveKit with zero code redeployments.
