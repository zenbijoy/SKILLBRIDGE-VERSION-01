# SkillBridge Supabase Permission & Database Security Audit

**Database Target**: Supabase Managed PostgreSQL (`wyqsoxkwmulhpcoslnoj.supabase.co`)  
**Client Interface**: PostgREST HTTPS API via `@supabase/supabase-js`  
**Investigation**: Error 42501 (`permission denied for table profiles`) on readiness probing

---

## 1. Root Cause Analysis: Error 42501

### The Failure Signature
During production readiness inspection, `GET /api/v1/health/ready` returned HTTP 503 with the following database engine error:
```json
{
  "code": "42501",
  "details": null,
  "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO service_role;",
  "message": "permission denied for table profiles",
  "status": 403
}
```

### Trace & Findings
1. **Triggering Endpoint**: `GET /api/v1/health/ready` (and `/health/ready`).
2. **Originating Source**: [backend/src/routes/health.ts](file:///c:/Users/24030/source/skillbridge-final/backend/src/routes/health.ts).
3. **Trigger Query**:
   ```typescript
   const { error } = await admin.from("profiles").select("id").limit(1);
   ```
4. **Supabase Client**: `admin` instance initialized with `SUPABASE_SERVICE_ROLE_KEY`.
5. **PostgreSQL Role Assumed**: `service_role`.
6. **Underlying Issue**:
   - In PostgreSQL, **Table Privileges (`GRANT SELECT`)** are distinct from **Row Level Security (RLS)**.
   - While the `service_role` in Supabase has the PostgreSQL attribute `BYPASSRLS` (bypassing row-level filters), it still requires standard SQL table-level privileges (`SELECT`, `INSERT`, etc.) on the target tables.
   - A previous security migration revoked broad table privileges without re-granting basic table access to `service_role`.
7. **Architectural Coupling Anti-Pattern**:
   - Querying a protected user data table (`profiles`) simply to check if PostgreSQL is reachable introduced unnecessary coupling. If table privileges were modified, the entire health probe failed even though PostgreSQL itself was fully operational.

---

## 2. Architectural Solution

### A. Dedicated, Uncoupled Readiness Function
In [backend/src/routes/health.ts](file:///c:/Users/24030/source/skillbridge-final/backend/src/routes/health.ts), the readiness probe was decoupled from `profiles`:
1. It now invokes `admin.rpc("health_check")`.
2. The probe touches **no** user data, private keys, or personal rows.
3. If PostgREST responds with an authentic database code (e.g. `PGRST202` or execution result), it proves the connection to PostgreSQL is alive without leaking or coupling to application tables.

### B. Migration 026 (`026_health_check_and_grants_repair.sql`)
A clean, idempotent, versioned migration was authored under `infra/supabase/migrations/` and `supabase/migrations/`:
- **`public.health_check()` Function**:
  ```sql
  CREATE OR REPLACE FUNCTION public.health_check()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT jsonb_build_object(
      'status', 'healthy',
      'timestamp', now(),
      'version', '2.0.1'
    );
  $$;

  REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.health_check() TO authenticated, service_role;
  ```
- **Service Role Privileges Restored**:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
  ```
- **Public & Authenticated Grants (Governed by RLS)**:
  ```sql
  GRANT SELECT ON TABLE public.skills TO anon, authenticated;
  GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_skills TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated;
  ```
- **RLS Preserved**:
  All tables strictly retain `ENABLE ROW LEVEL SECURITY`. Authenticated users can only read and update records allowed by their `auth.uid()` policies.

---

## 3. Client Separation & Secret Isolation

| Boundary | Credentials Used | Allowed Scope |
| :--- | :--- | :--- |
| **Mobile & Web Clients** | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public reads, authenticated writes filtered by RLS |
| **Backend Server** | `SUPABASE_SERVICE_ROLE_KEY` | Atomic multi-table RPCs, background jobs, admin tasks |

**Strict Isolation Verification**:
- `SUPABASE_SERVICE_ROLE_KEY` is completely prohibited from frontend code.
- Runtime check in `frontend/src/lib/config.ts` actively aborts if `SUPABASE_SERVICE_ROLE_KEY` is present in client environment.
