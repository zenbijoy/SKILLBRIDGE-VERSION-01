# SkillBridge Development Deployment Checklist (Render Free Tier)

Follow this checklist to complete the deployment and verify zero-cost operation.

---

## 1. Supabase Migration Application (One-Time)

Apply the idempotent migration `026_health_check_and_grants_repair.sql` to your Supabase PostgreSQL database:

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard/project/wyqsoxkwmulhpcoslnoj).
2. Go to **SQL Editor** → **New Query**.
3. Copy and paste the contents of:
   [infra/supabase/migrations/026_health_check_and_grants_repair.sql](file:///c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/026_health_check_and_grants_repair.sql)
4. Click **Run**.
5. Verify success:
   ```sql
   SELECT public.health_check();
   ```
   Expected response: `{"status": "healthy", "timestamp": "...", "version": "2.0.1"}`.

---

## 2. Render Web Service Environment Configuration

In the [Render Dashboard](https://dashboard.render.com):

1. Navigate to: **Dashboard** → Click **skillbridge-api** → **Environment**
2. Update/verify the following variables:
   - `REDIS_URL`: Paste the Internal Redis URL of `skillbridge-redis-free` (e.g. `redis://red-...:6379`).
   - `REDIS_REQUIRED`: Set to `false`.
   - `KEEP_ALIVE_ENABLED`: Set to `false`.
3. Verify the existing credentials remain configured (never commit these to Git):
   - `SUPABASE_URL` (SECRET_PRESENT)
   - `SUPABASE_ANON_KEY` (SECRET_PRESENT)
   - `SUPABASE_SERVICE_ROLE_KEY` (SECRET_PRESENT)
   - `WEB_ORIGINS` (CONFIG_PRESENT)
4. Click **Save Changes**.

---

## 3. Git Push & Blueprint Deployment

1. Commit and push the repository changes:
   ```bash
   git add render.yaml .github/workflows/keep-render-alive.yml backend/src/ infra/supabase/migrations/ docs/
   git commit -m "fix(deploy): configure render free tier, disable keepalive, harden redis and add health check RPC"
   git push origin main
   ```
2. In Render, go to **skillbridge-api** → **Deploys** → Verify the latest commit deploys cleanly.
3. Confirm the service badge reflects **Free**.

---

## 4. Post-Deployment Verification

### A. Liveness Check
```bash
curl -i https://skillbridge-api-pd9c.onrender.com/api/v1/health
```
Expected: `HTTP 200` with `{"status": "ok", "service": "skillbridge-api", ...}`.

### B. Readiness Check
```bash
curl -i https://skillbridge-api-pd9c.onrender.com/api/v1/health/ready
```
Expected: `HTTP 200` with:
```json
{
  "status": "ready",
  "services": {
    "api": "healthy",
    "supabase": "healthy",
    "redis": "healthy"
  }
}
```

---

## 5. Deletion of Old Paid Redis

Once `skillbridge-api` is successfully connected to `skillbridge-redis-free`:
1. In Render Dashboard, select the old **skillbridge-redis**.
2. Confirm it has no other dependencies.
3. Go to **Settings** → Scroll to bottom → Click **Delete Key Value / Redis**.
4. Confirm deletion to permanently eliminate the old monthly fee.
