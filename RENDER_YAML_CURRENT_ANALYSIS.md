# Detailed Field-by-Field Analysis: `render.yaml`

This document provides a line-by-line and field-by-field audit of the current Blueprint configuration file [render.yaml](file:///c:/Users/24030/source/skillbridge-final/render.yaml) located at the root of the SkillBridge repository.

---

## 1. Specification Overview

| Field | Current Value | Evaluation | Cost / Risk Impact |
| :--- | :--- | :--- | :--- |
| `version` | `"1"` | Standard Render Blueprint schema specification version. | Safe |
| `services` | List (1 Web Service) | Defines `skillbridge-api`. Does not declare Redis, Databases, Disks, or Workers. | Safe |

---

## 2. Web Service: `skillbridge-api`

### 2.1 Service Definition & Compute Plan

#### `type: web`
- **Purpose**: Deploys an HTTP/WebSocket internet-facing application.
- **Evaluation**: Correct for Express 5 + Socket.IO API server.

#### `name: skillbridge-api`
- **Purpose**: Defines the resource slug and default URL: `https://skillbridge-api-pd9c.onrender.com`.
- **Evaluation**: Matches the live production deployment. Must NOT be changed to avoid breaking DNS and mobile/web clients.

#### `runtime: docker`
- **Purpose**: Instructs Render to build and execute the service using a Docker container rather than a native buildpack.
- **Evaluation**: Backed by [backend/Dockerfile](file:///c:/Users/24030/source/skillbridge-final/backend/Dockerfile). Uses lightweight `node:22-alpine` multi-stage build.

#### `plan: starter`  🚨 **CRITICAL BILLING ROOT CAUSE**
- **Purpose**: Declares the compute instance tier.
- **Current Behavior**: **Hardcodes the paid "Starter" tier ($7.00/month)**.
- **Impact**: Render Blueprints enforce the plan declared in `render.yaml`. Even if manually changed in the UI, a Blueprint synchronization will force it back to `starter`. This is the primary driver of the unpaid balance / payment failure notification on Render.
- **Remediation**: Must be changed to `plan: free`.

#### `region: oregon`
- **Purpose**: Specifies AWS US-West datacenter (`us-west-2`).
- **Evaluation**: Standard Render region supporting Free Tier compute.

#### `healthCheckPath: /api/v1/health`
- **Purpose**: Zero-downtime deployment gate and liveness probe.
- **Evaluation**: Resolves to `backend/src/routes/health.ts` which returns `{ success: true, status: "UP", version: "2.0.1", service: "skillbridge-api" }` with HTTP 200 immediately. Non-blocking. Compatible with Free Tier.

#### `dockerContext: ./backend` and `dockerfilePath: ./backend/Dockerfile`
- **Purpose**: Builds the isolated backend directory.
- **Evaluation**: Prevents large root files (`node_modules`, frontend assets, admin build) from bloating the Docker context.

#### `autoDeployTrigger: commit`
- **Purpose**: Deploys automatically when new commits are pushed to the tracking branch.
- **Evaluation**: Standard GitOps behavior.

---

### 2.2 Environment Variables Audit

| Variable Name | Value / Sync Setting | Classification | Safety on Free Tier |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `value: production` | Static Config | Safe |
| `PORT` | `value: "4000"` | Static Config | Safe (matches Dockerfile `EXPOSE 4000`) |
| `SUPABASE_URL` | `sync: false` | Secret / External Managed | Safe (retained in Render Dashboard) |
| `SUPABASE_ANON_KEY` | `sync: false` | Secret / External Managed | Safe (retained in Render Dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY` | `sync: false` | Secret / External Managed | Safe (retained in Render Dashboard) |
| `REDIS_URL` | `sync: false` | Secret / External Managed | Safe (retained in Render Dashboard) |
| `REDIS_REQUIRED` | `value: "true"` | Runtime Switch | ⚠️ **Risk on Free Tier** (see below) |
| `WEB_ORIGINS` | `sync: false` | External Managed | Safe |
| `LIVEKIT_URL` | `sync: false` | External Managed | Safe |
| `LIVEKIT_API_KEY` | `sync: false` | Secret / External Managed | Safe |
| `LIVEKIT_API_SECRET` | `sync: false` | Secret / External Managed | Safe |
| `EXPO_PUSH_ACCESS_TOKEN` | `sync: false` | Secret / External Managed | Safe |
| `CLOUDFLARE_TURN_ENABLED` | `sync: false` | External Managed | Safe |
| `CLOUDFLARE_TURN_KEY_ID` | `sync: false` | Secret / External Managed | Safe |
| `CLOUDFLARE_TURN_API_TOKEN` | `sync: false` | Secret / External Managed | Safe |
| `MAX_ROOM_CAPACITY` | `value: "250"` | Static Config | Safe |
| `MAINTENANCE_MODE` | `value: "false"` | Static Config | Safe |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `value: "120"` | Static Config | Safe |

#### Critical Finding on `REDIS_REQUIRED: "true"`:
In [backend/src/server.ts](file:///c:/Users/24030/source/skillbridge-final/backend/src/server.ts#L123-L129):
```typescript
if (!redis && env.REDIS_REQUIRED) {
  logger.error({ event: "redis_required_missing" }, "REDIS_URL is not set but REDIS_REQUIRED is true.");
  process.exit(1);
}
```
If `REDIS_REQUIRED` is `"true"`, any temporary connection failure or delay during a Render Free Tier cold start or Redis restart will crash the API container immediately. Setting `REDIS_REQUIRED` to `"false"` enables graceful fallback where the API stays operational even if Redis is momentarily unreachable.

---

## 3. Missing Resources in `render.yaml`

The following resources are currently NOT defined in `render.yaml`:
1. **`skillbridge-redis`**:
   - Absent from the Blueprint file.
   - Was created manually via the Render Dashboard according to instructions in `docs/PRODUCTION_DEPLOYMENT_GUIDE.md` (which explicitly advised choosing the **Starter** plan!).
   - Render's manual Starter Redis costs **$7.00 - $10.00/month**.
2. **Databases (`databases:`)**:
   - None declared. All database persistence is handled by external Supabase PostgreSQL.
3. **Disks (`disks:`)**:
   - None declared. No persistent disk charges.
4. **Workers / Cron Jobs**:
   - None declared. Background jobs run in-process via Node.js timers.
