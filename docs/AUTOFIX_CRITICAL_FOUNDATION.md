# SkillBridge Critical Autofix

Generated: 2026-08-11T21:24:57.132291

This script applies deterministic critical fixes only. It does NOT implement the full admin dashboard, RBAC, receipt worker, event transactions, complete LiveKit attendance wiring, or product expansion. Continue with SKILLBRIDGE_MASTER_FIX_ANTIGRAVITY.txt.

## Changed

- infra/supabase/migrations/001_schema.sql
- infra/supabase/migrations/005_rpc_security_hardening.sql
- infra/supabase/migrations/006_room_transactions.sql
- infra/supabase/migrations/007_phase12_final_fixes.sql
- backend/src/routes/rooms.ts
- backend/src/routes/sessions.ts
- backend/src/routes/account.ts
- backend/src/services/push.ts
- frontend/app/(tabs)/discover.tsx
- infra\supabase\migrations\010_critical_security_consistency.sql
- docs/MIGRATION_ORDER.md
- scripts/setup-database.ps1
- frontend/lint_out.txt (removed)
