# Manual Actions Required for Production VPS Deployment

All automated preparation, code refactoring, Redis integration, rate limiting, and local test validations have passed cleanly.

The following items require your one-time manual setup or credentials on the Oracle VPS. **THE CURRENT DEPLOYMENT IS BLOCKED WAITING FOR THESE MANUAL ACTIONS:**

1. **SSH Key / Terminal Access**:
   - Please provide SSH credentials or configure SSH host access. The deployment process requires executing `docker exec` commands on the VPS to query the existing database, create backups, provision the new schema, and deploy the backend container.

2. **Deploy Redis Docker Container on VPS**:
   - Run the provided Redis Docker Compose block (from `docs/REDIS_PRODUCTION.md`) on the VPS to start Redis on `127.0.0.1:6379`.

3. **Production Database Timestamped Backup**:
   - Execute the pre-migration dump script (from `docs/PRODUCTION_BACKUP_REPORT.md`) on the VPS before applying `012_upgrade_corrections.sql` and `013_hardening.sql`.

4. **Set Production Environment Variables**:
   - Populate `backend/.env` with production `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `REDIS_URL`.

5. **Cloud/Domain Configuration** (Optional but Recommended):
   - Setup DNS records for `api.yourdomain.com` pointing to the VPS if not using the base domain.
