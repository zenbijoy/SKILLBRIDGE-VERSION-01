# SkillBridge True Monorepo Project Structure

This document represents the inspected and verified architecture of the **SkillBridge** project workspace.

---

## Workspace Directory Breakdown

### 1. `admin/`
- **Purpose**: Web-based Control Plane and Moderation Dashboard.
- **Entry Points**: `index.html`, `src/main.tsx`, `src/App.tsx`.
- **Key Configs**: `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`.
- **Runtime**: Vite 8 + React 19 SPA.
- **Deployment Role**: Static SPA hosted via Nginx / Oracle VPS.

### 2. `backend/`
- **Purpose**: Backend API gateway, WebRTC signaling relay, push notification service, and RBAC control server.
- **Entry Points**: `src/server.ts`, `src/index.ts`.
- **Key Configs**: `tsconfig.json`, `Dockerfile`, `.env.example`.
- **Runtime**: Node.js + Express.js + TypeScript (tsx test harness).
- **Deployment Role**: Containerized microservice running on Oracle VPS behind Caddy/Nginx reverse proxy.

### 3. `frontend/`
- **Purpose**: Cross-platform mobile application.
- **Entry Points**: `app/_layout.tsx`, `package.json`.
- **Key Configs**: `app.json`, `eas.json`, `android/build.gradle`.
- **Runtime**: Expo SDK 56 + React Native 0.85 + Custom Expo Development Client.
- **Deployment Role**: Native Android (APK/AAB) and iOS builds.

### 4. `infra/`
- **Purpose**: Infrastructure deployment definitions and database migrations.
- **Subdirectories**:
  - `infra/caddy/`: Caddyfile reverse proxy configurations.
  - `infra/livekit/`: LiveKit SFU server configuration files.
  - `infra/supabase/`: SQL migration files (`001_schema.sql` to `013_...`) and baseline dumps.
- **Deployment Role**: VPS orchestration & Supabase PostgreSQL database schemas.

### 5. `metadata/`
- **Purpose**: Store listings, assets, graphics, and release notes for app store submissions.

### 6. `scripts/`
- **Purpose**: Utility scripts for database seeding, E2E test runs, and migration verification.
- **Key Files**: `seed-production-system-data.mjs`, `setup-database.mjs`, `verify-database.mjs`.

### 7. `docs/`
- **Purpose**: Canonical project documentation, audit reports, and architecture guides.

### 8. `scratch/`
- **Purpose**: Temporary execution scripts, patch generation tools, and ephemeral log backups.
