# SkillBridge Admin Control Plane V4: Security Review

## 1. Authentication & Authorization
* **Dual-Layer RBAC**: Enforced by `requireRole` middleware at both the route mount point (`/api/v1/admin`) and individual sensitive mutation routes.
* **Privilege Separation**:
  - `moderator` cannot purge cache, alter version policies, change roles, or trigger notification campaigns.
  - `admin` cannot remove `owner` or demote themselves.
  - Normal users (`student`, etc.) receive 403 `Insufficient role` on every admin route.
  - Unauthenticated requests receive 401 `Authentication required`.

## 2. Secrets & Credential Protection
* No service-role key (`SUPABASE_SERVICE_ROLE_KEY`), database connection strings, JWT signing keys, or Redis URLs are exposed in API payloads or browser bundles.
* **Audit Explorer Metadata Sanitization**:
  - All keys containing `token`, `password`, `secret`, `authorization`, `auth`, `key`, `service_role`, `redis_url`, or `cookie` are automatically replaced with `[REDACTED]` prior to JSON serialization and CSV export.
* **Sanitized CSV Export**:
  - CSV export applies rigorous escaping to prevent CSV injection (formula injection).
  - Sensitive metadata fields remain redacted in downloadable reports.

## 3. Safe Cache Operations
* Arbitrary Redis commands (`FLUSHALL`, `FLUSHDB`, arbitrary key inputs) are strictly rejected by Zod schema validation.
* Only allowlisted prefix namespaces (`dashboard:*`, `catalog:*`, `rooms:*`) can be invalidated.
* Every cache clear operation requires an explicit administrative reason and generates an immutable audit log with caller ID, timestamp, pattern, and justification.

## 4. Privacy-Preserving Discovery Analytics
* Raw search queries are normalized (`trim().toLowerCase().slice(0, 100)`).
* Search analytics events table (`search_analytics_events`) stores only:
  - `search_query_normalized`
  - `result_count`
  - `category` (optional)
  - `created_at`
* No IP addresses, user identifiers, or sensitive payload bodies are stored in search event telemetry.

## 5. Input Validation & Defense-in-Depth
* All mutation payloads are validated with strict Zod schemas (`.strict()`), disallowing extraneous fields.
* Query parameters for pagination are bounded (`min(1)`, `max(100)` or `max(2000)` for CSV exports).
* Free text searches use ILIKE sanitization (`sanitizeIlike`) to prevent SQL injection or regex denial of service.

## 6. Database Safety & RLS
* All newly introduced tables (`moderation_cases`, `notification_campaigns`, `search_analytics_events`, `app_version_control`) have Row Level Security (`ENABLE ROW LEVEL SECURITY`) activated.
* Read/write access is constrained to authenticated service-role operations with bounded public read policies where required (e.g. `app_version_control`).
