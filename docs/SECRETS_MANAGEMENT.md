# SKILLBRIDGE Secrets Management & Key Rotation Policy

## 1. Scope & Classification
This document governs the secure lifecycle, storage, and zero-downtime rotation of all cryptographic keys, database credentials, and service tokens across SkillBridge environments.

| Secret Class | Purpose | Primary Storage | Access Roles | Rotation Cycle |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase Service Role Key** | Elevated backend database access | Render / Cloud Secret Manager | Backend API | 90 Days / Compromise |
| **Supabase Anon Key** | Public client gateway authentication | Frontend Config / Render | All clients | 180 Days |
| **LiveKit API Key & Secret** | Real-time audio/video room orchestration | Cloud Env Vars | Backend API | 90 Days |
| **Cloudflare TURN Token** | WebRTC relay STUN/TURN ephemeral creds | Cloud Env Vars | Backend API | 90 Days |
| **Expo Push Access Token** | Push notification dispatch | Cloud Env Vars | Push Worker | 180 Days |
| **AI Provider API Key** | AI assistant & semantic matching | Cloud Env Vars | Backend API | 90 Days |
| **Sentry DSN** | Error & crash monitoring | Cloud Env Vars | All Apps | 365 Days |

---

## 2. Zero-Downtime Rotation Procedure
For high-risk tokens (Supabase Service Role, LiveKit, Cloudflare TURN), rotation must follow a 4-step overlap procedure to ensure zero user disruption:

```
[Generate Secondary Key] -> [Deploy to Backend] -> [Verify Service Health] -> [Revoke Primary Key]
```

### Execution Steps
1. **Key Generation**: Generate a secondary API key in the upstream provider console (e.g., LiveKit Cloud or Cloudflare Dashboard).
2. **Staged Deployment**: Update staging environment variables and verify through automated test execution:
   ```bash
   npm run test
   ```
3. **Production Rollout**: Update production environment secrets in Render/Koyeb and trigger blue-green rolling restart.
4. **Health Verification**:
   - Query `/health/ready` to ensure database and real-time connectivity are active.
   - Run smoke tests against live endpoints.
5. **Decommission**: Revoke the deprecated primary key in the upstream provider console.

---

## 3. Compromise Response Procedure (P1 Incident)
If any secret is leaked or suspected of exposure:
1. **Immediate Revocation**: Generate replacement credentials within `< 15 minutes`.
2. **Emergency Redeployment**: Deploy new secrets to production using Render CLI or Dashboard.
3. **Session Invalidation**:
   - Invalidate active JWTs / Refresh tokens via Supabase Auth Admin.
   - Flush active Redis sessions.
4. **Audit Log Forensics**: Query `audit_logs` table for abnormal actor activity during the window of exposure.
5. **Post-Mortem**: Document root cause, affected scopes, and preventive measures.

---

## 4. Local Development Safeguards
- **Never commit `.env` or `.env.local` files**: `.gitignore` strictly prohibits credential files.
- Use `.env.example` as the sole canonical reference for variable names and safe placeholder values.
- In CI pipelines, never print or echo environment variables in script logs.
