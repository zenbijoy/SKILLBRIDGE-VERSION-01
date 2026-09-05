# SkillBridge Render Free Tier Deployment Audit

**Service Name**: `skillbridge-api`  
**Deployment Platform**: Render.com (Oregon Region)  
**Target Environment**: Development Deployment  
**Audit Scope**: Compute Plan, Docker Runtime, Memory Footprint, Cold-Start Tolerance, Keepalive Deactivation

---

## 1. Executive Summary

This audit confirms that the SkillBridge API service (`skillbridge-api`) is architecturally sound and fully compatible with the Render Free Tier. All billable configurations—including the previous `plan: starter` declaration and automatic keepalive self-pinging—have been systematically identified, neutralized, and transitioned to free-tier settings without breaking authentication, onboarding, database operations, or real-time connectivity.

---

## 2. Infrastructure Comparison: Starter vs. Free Tier

| Parameter | Previous Configuration (Starter) | Corrected Target (Free Tier) | Impact on SkillBridge API |
| :--- | :--- | :--- | :--- |
| **Monthly Cost** | **$7.00 / month** | **$0.00 / month** | Eliminates recurring compute bill |
| **Declared in `render.yaml`** | `plan: starter` | `plan: free` | Blueprint enforces free plan |
| **RAM (Memory Limit)** | 512 MB | 512 MB | Zero degradation; process uses ~36 MB |
| **vCPU** | 0.5 shared CPU | 0.1 shared CPU | Sufficient for I/O-bound async workloads |
| **Inactivity Sleep** | Always Awake | Spins down after 15 min idle | Enabled intentionally |
| **Cold Start Behavior** | None | 30–50s spin-up on inbound traffic | Handled via client-side retry & 60s timeout |
| **Internal KeepAlive Worker** | Active every 10 min | Disabled (`KEEP_ALIVE_ENABLED=false`)| Allows container to sleep naturally |
| **GitHub Action KeepAlive** | Cron `*/10 * * * *` | `workflow_dispatch` only | No external traffic prevents sleeping |
| **Redis Requirement** | `REDIS_REQUIRED=true` | `REDIS_REQUIRED=false` | Softened; prevents crash if cache is cold |

---

## 3. Memory & Resource Consumption Profile

Telemetry gathered from the active Node.js 22 runtime:
- **Active Working Set (RAM)**: **36,016,128 bytes (~36 MB)**
- **Free Tier Memory Cap**: **512 MB**
- **Safety Margin**: **> 90% headroom remaining**
- **Concurrency Support**: Lightweight event-loop architecture with Express 5, ioredis lazy connection, and non-blocking I/O.

---

## 4. Cold-Start Resilience Strategy

When Render Free Web Services sleep after 15 minutes of inactivity, the first incoming request triggers a container wake-up:
1. **Container Initialization**: Multi-stage Alpine image (~140 MB) decompresses and starts Node in < 2 seconds.
2. **Client-Side Graceful Retry**:
   - `frontend/src/lib/api.ts` implements a 60-second AbortController timeout budget.
   - If a transient 502/503 is returned during spin-up, the client automatically executes bounded exponential backoff retries (up to 2 retries) before showing any error.
3. **Database & Cache Connection**:
   - Supabase PostgREST uses stateless HTTPS pooling (no persistent connection pool to warm up).
   - Redis uses `lazyConnect: true` and `connectTimeout: 5000` with graceful cache-aside fallback.

---

## 5. Render Blueprint Security Validation

In [render.yaml](file:///c:/Users/24030/source/skillbridge-final/render.yaml):
- All sensitive keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `LIVEKIT_*`, etc.) maintain `sync: false`.
- Blueprint synchronization will **not** overwrite or erase credentials configured in the Render Dashboard.
- No paid add-ons (Persistent Disks, Render PostgreSQL, Background Workers, or Render Cron Jobs) are declared.
