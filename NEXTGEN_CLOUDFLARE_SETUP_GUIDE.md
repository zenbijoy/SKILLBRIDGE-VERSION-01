# SkillBridge Next-Gen — Cloudflare Edge Layer Setup & Runbook

This guide covers the deployment, configuration, operational management, and troubleshooting for the **SkillBridge Next-Gen Cloudflare Worker Edge Gateway**.

---

## 1. Architecture Overview

The Cloudflare Edge Gateway acts as a globally distributed reverse proxy and smart cache layer running across 300+ edge locations.

```
[ Client / Mobile App / Web ]
             │
             ▼
[ Cloudflare Worker Edge Gateway ]
      ├── 1. CORS Preflight (OPTIONS, 86400s max-age)
      ├── 2. Security Defense (Path traversal, control character rejection)
      ├── 3. Instant App Bootstrap (/api/bootstrap, <15ms response)
      ├── 4. SWR Edge Cache Lookup (Deterministic URI keys)
      │       ├── Cache HIT  ─► Return edge cached response
      │       └── Cache MISS ─► Forward to Render Backend
      └── 5. Origin Fault Tolerance (Serves stale cache on Origin 5xx/Network Drops)
             │
             ▼
    [ Render Node.js Backend ]
             │
      ┌──────┴──────┐
      ▼             ▼
[ Supabase ]   [ Redis / R2 ]
```

---

## 2. Edge Cache TTL & Stale-While-Revalidate Policies

Public catalog and read-heavy endpoints use **Stale-While-Revalidate (SWR)** caching:

| Endpoint Pattern | `max-age` | `stale-while-revalidate` | Description |
|---|---|---|---|
| `/api/v1/health/live` | 10s | 0s | Fast Edge Liveness Check |
| `/api/v1/rooms` | 60s | 120s | Public Study Rooms Directory |
| `/api/v1/rooms/:id/recordings` | 120s | 300s | Study Room YouTube Recordings Archive |
| `/api/v1/clubs` | 120s | 300s | Public Clubs Directory |
| `/api/v1/clubs/:id` | 120s | 300s | Public Club Profile & Meta |
| `/api/v1/calendar` | 60s | 180s | Public Campus Events & Schedules |
| `/api/v1/catalog` | 300s | 600s | Subject and Skills Catalog |
| `/api/v1/achievements/public` | 300s | 600s | Public Badges & Leaderboards |

### Strict Cache Bypass Rules

Requests matching ANY of the following criteria **IMMEDIATELY BYPASS** edge caching and are proxied directly to origin:
1. **HTTP Method**: Any mutation (`POST`, `PUT`, `PATCH`, `DELETE`).
2. **Authentication**: Any request presenting an `Authorization` or `Proxy-Authorization` header.
3. **Sensitive Routes**:
   - `/api/v1/auth/*`
   - `/api/v1/users/*`
   - `/api/v1/admin/*`
   - `/api/v1/moderation/*`
   - `/api/v1/bookings/*`
   - `/api/v1/notifications/*`
   - `/api/v1/feed/*` (contains personalized or user-scoped data)
   - `/api/v1/calls/*` (LiveKit WebRTC signaling)
   - `/api/v1/resources/upload-ticket` (Presigned R2 uploads)
   - `/socket.io/*` (Real-time WebSocket/polling)
4. **Client Cache-Control**: Request contains `Cache-Control: no-cache` or `no-store`.

---

## 3. Deployment & Setup

> **SAFETY NOTICE**: No deployment commands should be executed without explicit operator consent.

### Prerequisites
- Node.js 20+
- Cloudflare Account with Workers enabled (Free tier covers 100,000 req/day)
- Wrangler CLI installed (`npm i -g wrangler` or via local package)

### Step 1: Initialize Configuration
```bash
cd infra/cloudflare/worker
cp wrangler.toml.example wrangler.toml
```

### Step 2: Configure Environment Variables
In `wrangler.toml`:
```toml
name = "skillbridge-edge-gateway"
main = "src/index.ts"
compatibility_date = "2024-04-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"
ORIGIN_URL = "https://skillbridge-api.onrender.com"
APP_VERSION = "2.0.1"
CACHE_PURGE_ENABLED = "true"
```

Set secret variables securely:
```bash
wrangler secret put PURGE_SECRET
```

### Step 3: Local Simulation & Testing
```bash
npm run dev
```

### Step 4: Deploy to Edge
```bash
wrangler deploy
```

---

## 4. Cache Invalidation & Purge API

The Edge Gateway exposes an authenticated purge endpoint:

### Purge Specific Path
```bash
curl -X POST https://edge.skillbridge.app/api/edge/purge \
  -H "Content-Type: application/json" \
  -H "X-Purge-Key: <YOUR_PURGE_SECRET>" \
  -d '{"path": "/api/v1/rooms"}'
```

### Response
```json
{
  "success": true,
  "purgedPath": "/api/v1/rooms"
}
```

---

## 5. Header Verification & Telemetry

When verifying edge behavior, inspect the following response headers:

| Header | Possible Values | Meaning |
|---|---|---|
| `X-Edge-Cache` | `HIT` | Response served directly from Cloudflare edge cache (<20ms) |
| `X-Edge-Cache` | `MISS` | Fetched from Render origin, stored in edge cache |
| `X-Edge-Cache` | `BYPASS` | Authenticated request or mutation; bypassed edge cache |
| `X-Edge-Cache` | `PASS` | Non-cacheable public route |
| `X-Edge-Cache` | `STALE_ORIGIN_ERROR` | Origin failed with 5xx; served stale cache safely |
| `X-Edge-Cache` | `EDGE_LOCAL` | Handled entirely on edge worker (e.g. `/api/bootstrap`) |
| `X-Edge-Region` | Airport PoP code (e.g., `DAC`, `SIN`, `LHR`) | Edge datacenter handling the request |
| `X-Edge-Gateway` | `cloudflare-worker` | Forwarded to backend origin |

---

## 6. Troubleshooting

1. **Origin 502 Bad Gateway**:
   - Verify `ORIGIN_URL` in `wrangler.toml` is reachable directly: `curl -I https://skillbridge-api.onrender.com/health/live`
   - Check if Render service has completed cold-start.

2. **Cache Not Invalidation After Update**:
   - Authenticated mutations automatically hit origin. If public catalog has stale data, trigger the Purge API or verify client is not sending caching headers.

3. **CORS Errors**:
   - Edge Worker automatically handles OPTIONS preflights with 86400s max-age and passes origin CORS headers through.
