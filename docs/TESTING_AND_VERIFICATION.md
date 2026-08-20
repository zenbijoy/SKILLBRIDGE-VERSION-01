# SkillBridge V3 Testing & Verification Guide

SkillBridge V3 features an automated multi-tier test suite designed for execution in local and CI/CD environments without external database dependencies.

---

## 1. Test Architecture

The testing suite consists of 4 specialized test engines:

1. **In-Process Real PostgreSQL Suite (`backend/src/db.real.test.ts`)**:
   - Uses `@electric-sql/pglite` (compiled PostgreSQL 15/16 WASM engine).
   - Installs fresh baseline (`001_skillbridge_baseline.sql`).
   - Runs incremental migration sequence (`001 → 015`).
   - Compares table schemas with strict assertions.
   - Tests row-lock capacity boundaries, invitation constraints, idempotent reputation rewards, transactional admin moderation, and leaderboard aggregation.
2. **Adversarial Security Matrix (`backend/src/routes/security.adversarial.test.ts`)**:
   - Tests cross-tenant isolation, unauthorized room access, privilege hierarchy violations, suspended account lockdowns, and path traversal protections.
3. **API & Endpoint Suite (`backend/src/app.test.ts`)**:
   - Tests health checks, auth middleware, and REST CRUD contracts.
4. **Static Typecheck & Linter Suites**:
   - Frontend: `npm run typecheck` in `frontend/`.
   - Backend: `npm run typecheck` in `backend/`.
   - Admin: `npm run typecheck` in `admin/`.

---

## 2. Running Verification

### Run Full Backend Test Suite
```bash
cd backend
npm test
```
*Expected Output:*
```text
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
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
