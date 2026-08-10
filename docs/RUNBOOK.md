# Operations runbook

## Health
- API: `GET /health`
- Postgres: Supabase dashboard/metrics
- Redis: `redis-cli ping`
- LiveKit: container health/logs and test room

## Incident priorities
P0: authentication bypass, data exposure, service-role key leak, destructive data issue.
P1: users cannot sign in, join rooms, message, or access scheduled/live classes.
P2: search/recommendations/push degraded.

## Secret leak
1. disable/revoke leaked secret;
2. rotate it at provider;
3. update backend secret store;
4. redeploy;
5. review audit logs;
6. invalidate sessions if identity secret exposure could affect them.

## Database release
Apply migrations to staging, test rollback/restore, snapshot production, then apply in a maintenance window for high-risk migrations.
