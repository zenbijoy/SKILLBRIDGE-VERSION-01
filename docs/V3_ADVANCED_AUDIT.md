# SkillBridge V3 Advanced — Engineering Audit

Audit date: 2026-08-17  
Scope: `frontend/app`, `frontend/src`, `admin/src`, `backend/src`, `scripts`, CI and database setup tooling.

## Verification scope

The V3 static audit scans 136 source files and 11,961 lines. All TypeScript/TSX source files were parser-checked, all JavaScript/MJS/CJS scripts were syntax-checked, and a static client/backend route comparison found 41 discoverable client API calls mapping to existing backend method/path routes.

Full dependency-based `npm run validate` could not be executed in the build sandbox because npm registry DNS access was unavailable. Docker database integration tests also could not run because the Docker daemon was unavailable. These checks are wired into the repository and should be run on a normal development machine or CI after extraction.

## Critical bugs corrected

1. **Broken user-report endpoint** — mobile called `/moderation`; backend exposes `/moderation/report`. The report reason also defaulted to `spam`, which was shorter than backend validation's minimum length.
2. **Admin/backend port mismatch** — admin defaulted to port 3001 while backend defaults to 4000.
3. **Moderation update contract mismatch** — admin status/action model did not match the report schema and could omit a required action.
4. **Dashboard response mismatch** — admin expected `totalUsers`, `activeSessions`, `pendingReports`, etc. but backend returned only compact counters.
5. **User 360 model mismatch** — admin expected `name/email/status/role`, while profile records use `full_name`, `username`, `account_status`, `roles`, etc.
6. **Invalid verification write** — old implementation attempted to update `profiles.is_verified`, a field not present in the current schema. V3 records an explicit audited verification override instead.
7. **Privilege-escalation boundary** — elevated role assignment is now admin-only and role values are allow-listed. Moderators cannot grant `admin` through these endpoints.
8. **Fake admin operations** — hard-coded API keys, support tickets, database migrations/backups and simulated runtime saving were removed from production-facing pages. The replacement views use live backend health, reports and audit logs.
9. **Smoke-test URL mismatch** — smoke test checked `/api/v1/health`; health router is mounted at `/health`.
10. **Push-health environment mismatch** — health code referenced a different Expo push variable than the validated backend environment schema.
11. **Boolean environment parsing bug** — `z.coerce.boolean()` can treat the string `"false"` as truthy. V3 explicitly parses `true/false`, `1/0`, `yes/no`, and `on/off`.
12. **Database migration source-of-truth bug** — fresh setup applied only the baseline while tests secretly applied later corrections. V3 fresh setup applies the baseline plus every migration newer than the baseline snapshot, and the verifier recognizes that chain correctly.
13. **CI coverage gap** — admin was absent from CI. V3 validates frontend, backend and admin independently and adds a repository contract audit job.

## V3 capabilities added

- Responsive admin control-plane shell with desktop/mobile navigation.
- Global user search routing to User 360.
- Real platform dashboard: user/session/room/report counts, runtime health and audit activity.
- User 360 with profile, skills, rooms, sessions and audit history.
- Audited account status actions and admin-only elevated-role management.
- Moderation queue with valid database statuses and audited transitions.
- Admin-only verification override audit trail.
- Integration/capability observability without exposing secrets.
- Runtime policy visibility: maintenance mode, global rate limit and max room capacity.
- Database health plus privileged audit-log viewer.
- Operations queue built from current reports/audit events rather than fake support tickets.
- Persistent mobile learn/teach mode using AsyncStorage-backed Zustand persistence.
- Hardened mobile API client with URL normalization, typed API errors, refresh coordination and explicit network errors.
- Configurable room-capacity limit, maintenance mode and global API rate limit.
- Cross-platform root validation scripts and expanded GitHub Actions CI.
- `scripts/project-audit.mjs` regression/contract audit.
- Corrected smoke test and database migration test behavior.

## Security and production notes

- Admin API still requires authenticated moderator/admin access globally; role escalation and verification overrides require `admin` specifically.
- The browser receives only capability presence/status, never server secrets.
- Production configuration changes remain deployment/environment operations rather than unaudited browser-local state.
- Existing `.env` files are not included in the V3 overlay and should never be committed.
- Before production release, run the complete validation commands, database tests against an isolated database, mobile device tests, load tests, and security review.

## Validation commands

```bash
npm run setup
npm run audit
npm run validate
npm run db:test
npm run smoke
```

`npm run db:test` requires Docker. `npm run smoke` requires the backend to already be running with working environment files.
