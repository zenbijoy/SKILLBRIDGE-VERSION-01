# SkillBridge Redis Migration & Valkey Free Tier Audit

**Old Resource**: `skillbridge-redis` (Render Paid Starter Plan)  
**Target Resource**: `skillbridge-redis-free` (Render Free Key Value / Valkey 8.1.4)  
**Driver**: `ioredis` (Singleton Client)  
**Protocol**: `redis://` and `rediss://` TLS supported  
**Configuration Pattern**: `process.env.REDIS_URL`

---

## 1. Scope & Role of Redis in SkillBridge

Redis operates strictly as a **non-authoritative ephemeral acceleration layer**:
- **Source of Truth**: Supabase PostgreSQL.
- **Sessions**: Stored and validated as JWTs via Supabase Auth (`admin.auth.getUser(token)`). Redis is **not** used for session storage.
- **User Passwords / OTP**: Managed exclusively by Supabase Auth.
- **HTTP Rate Limiting**: Managed in-memory via `express-rate-limit` memory store.
- **Socket Signaling Rate Limiting**: Managed in-memory via JavaScript `Map`.

### Active Redis Key Families
| Key Pattern | Data Stored | TTL | Fallback if Redis Offline |
| :--- | :--- | :--- | :--- |
| `rooms:public:p*:l*` | Paginated room discovery list | 30s | Fetches from `admin.from("rooms")` |
| `catalog:skills:*` | Skill catalog search queries | 300s | Fetches from `admin.from("skills")` |
| `dashboard:*` | User dashboard layouts | 120s | Fetches from `dashboard_widget_configs` |
| `presence:<userId>` | Online presence heartbeat | 45s | Defaults to offline; non-blocking |
| `metrics:auth_failures`| Telemetry failure counter | 300s | Falls back to in-memory array |

---

## 2. Valkey / Key Value Free Tier Constraints & Compatibility

Render's Free Key Value instance provides:
- **Memory**: 25 MB RAM (SkillBridge active cache consumes < 2.5 MB).
- **Max Connections**: 50 concurrent connections (SkillBridge backend uses **1** persistent connection via `ioredis`).
- **Eviction Policy**: `allkeys-lru` (Least Recently Used). Evicts stale keys automatically when memory reaches 25 MB.
- **Persistence**: Disabled (`OFF`). Completely acceptable because all cached keys have short TTLs and re-fetch from Supabase upon cache misses.

---

## 3. Client Hardening Implementation

In [backend/src/lib/redis.ts](file:///c:/Users/24030/source/skillbridge-final/backend/src/lib/redis.ts):
1. **Timeouts**:
   - `connectTimeout: 5000` (5-second connection ceiling).
   - `commandTimeout: 3000` (prevents hanging operations).
2. **Fail-Fast**:
   - `enableOfflineQueue: false` (avoids memory accumulation during outages).
   - `maxRetriesPerRequest: 1`.
3. **Bounded Reconnection**:
   - Retry strategy halts after 3 consecutive attempts (`times > 3 ? null : delay`).
4. **Resilient Helpers**:
   - `cacheGet`, `cacheSet`, `cacheDel`, `cacheDelPattern` catch exceptions gracefully, log warnings without credentials, and return `null` or exit cleanly without failing user HTTP requests.
5. **Softened Requirement**:
   - `REDIS_REQUIRED=false` ensures the API boots even if Redis is slow to wake up or temporarily restarting.

---

## 4. Migration Verification Suite

Connectivity and functional correctness were validated using the isolated namespace `dev:test:*`:
```
Test 1: SET dev:test:connection { status: 'ok' } EX 60 -> PASS
Test 2: GET dev:test:connection -> Returned { status: 'ok' } -> PASS
Test 3: DEL dev:test:connection -> PASS
Test 4: Outage Simulation (REDIS_URL="") -> Returns null, zero crashes -> PASS
```

---

## 5. Deletion Recommendation for Old Paid Redis

- **Resource**: `skillbridge-redis` (Starter $7–$10/mo)
- **Status**: The application code has been transitioned to use whatever `REDIS_URL` is set in the Render Dashboard.
- **Criteria for Safe Manual Deletion**:
  1. Set `REDIS_URL` in Render Dashboard to `skillbridge-redis-free` internal URL.
  2. Verify `/api/v1/health/ready` reports `services.redis: "healthy"`.
  3. Once confirmed, delete the old `skillbridge-redis` from the Render Dashboard to immediately stop further charges.
