# Cloudflare TURN & STUN Setup Guide

## 1. Cloudflare Calls TURN Integration

SkillBridge uses **STUN-first** peer connection negotiation (`stun:stun.cloudflare.com:3478`). When symmetric NAT or mobile carrier firewall blocks direct UDP hole-punching, the connection seamlessly relays through Cloudflare TURN.

### Environment Configuration (`backend/.env`)

```env
# Enable Cloudflare TURN Relay Fallback
CLOUDFLARE_TURN_ENABLED=true
CLOUDFLARE_TURN_KEY_ID="your_turn_key_id"
CLOUDFLARE_TURN_API_TOKEN="your_cloudflare_turn_api_token"
TURN_CREDENTIAL_TTL_SECONDS=3600

# Feature Flags
P2P_CALLS_ENABLED=true
CALL_RING_TIMEOUT_SECONDS=40
CALL_MAX_RECONNECT_ATTEMPTS=3
```

---

## 2. Generating Cloudflare TURN API Credentials

1. Log into your Cloudflare Dashboard.
2. Navigate to **Calls / Real-Time Communications**.
3. Create a **TURN Key** with `Credentials: Generate`.
4. Copy the `Key ID` and `API Token` into your backend environment secrets.
5. Clients receive only short-lived credentials via `GET /api/v1/calls/ice-servers`.
