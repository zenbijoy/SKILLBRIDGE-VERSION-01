# SkillBridge V3 Testing & Verification Guide

SkillBridge V3 uses layered unit, API, real PostgreSQL-compatible, build, diagnostic, and optional Docker/Supabase verification gates.

---

## 1. Test Architecture

The testing suite consists of 4 specialized test engines:

1. **In-Process Real PostgreSQL Suite (`backend/src/db.real.test.ts`)**:
   - Uses `@electric-sql/pglite` (compiled PostgreSQL 15/16 WASM engine).
   - Installs fresh baseline (`001_skillbridge_baseline.sql`).
   - Installs the current fresh baseline and separately reconstructs 016 before applying migration 017.
   - Compares tables, columns, RPC signatures, and protected function privileges with strict assertions.
   - Tests row-lock capacity boundaries, invitation constraints, idempotent rewards, transactional moderation, atomic onboarding/preferences, guided-tour rewards, dashboard layouts, and versioned content publishing.
2. **Adversarial Security Matrix (`backend/src/routes/security.adversarial.test.ts`)**:
   - Tests cross-tenant isolation, unauthorized room access, privilege hierarchy violations, suspended account lockdowns, and path traversal protections.
3. **API & Endpoint Suite (`backend/src/app.test.ts`)**:
   - Tests health checks, auth middleware, and REST CRUD contracts.
4. **Static Typecheck & Linter Suites**:
   - Frontend: `npm run typecheck` in `frontend/`.
   - Backend: `npm run typecheck` in `backend/`.
   - Admin: `npm run typecheck` in `admin/`.
5. **Frontend Jest Suite (`frontend/src/**/*.test.ts`)**:
   - Verifies request contracts, locale key parity, persisted settings behavior, data-saver invariants, and feature logic.
6. **Preflight and artifact gates**:
   - Root typecheck/lint/build, Vite admin build, `scripts/doctor.mjs`, Expo Doctor, Expo dependency checks, and Expo web export.
   - Docker-backed `npm run db:test` and live `npm run db:verify` are environment-dependent release gates.

---

## 2. Running Verification

### Run Full Backend Test Suite
```bash
cd backend
npm test
```
*Current suite size:*
```text
tests 66
pass 66
fail 0
skipped 0
```

### Run Frontend Tests
```bash
cd frontend
npm test -- --runInBand
```
*Current suite size:*
```text
test suites 4
tests 15
pass 15
fail 0
skipped 0
```

### Run Frontend Typecheck
```bash
cd frontend
npm run typecheck
```
*Expected Output: Exit code 0 (zero type errors).*

### Run Admin Typecheck
```bash
cd admin
npm run typecheck
```
*Expected Output: Exit code 0 (zero type errors).*

### Run Repository Preflight
```bash
npm run typecheck
npm run lint
npm run build
node scripts/doctor.mjs
npm run audit
cd frontend
npx expo-doctor
npx expo install --check
npx expo export --platform web
```

Migration verification is complete only after the in-process fresh/upgrade suite passes. For release environments with Docker and Supabase credentials, also run the root `db:test` and `db:verify` scripts and report unavailable external services as blocked gates rather than silently skipping them.

### Current local verification snapshot

- Root Doctor: 7/7 checks passed.
- Expo Doctor: 20/20 enabled checks passed; the native app-config synchronization check is intentionally disabled for the documented hybrid native workflow.
- Expo dependency validation: all dependencies match the installed Expo SDK.
- Expo web export: 1,107 modules bundled and 61 static routes exported.
- Docker database verification: fresh install and historical upgrade paths each passed 8/8 schema/security checks.
- Live Supabase verification: skipped when `psql` or live credentials are unavailable; this is an external release gate.
- Runtime smoke test: requires the backend and its dependent services to be running; connection refusal is a blocked external gate, not a passing result.
