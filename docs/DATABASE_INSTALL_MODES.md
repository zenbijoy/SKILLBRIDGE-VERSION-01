# Database Install Modes

This document outlines the database deployment execution paths for SkillBridge across different environment states.

## Database States
- **EMPTY**: No tables exist in the database.
- **BASELINE_V1**: The `skillbridge_meta.schema_migrations` table exists, and some migrations are applied (but not all).
- **LEGACY**: The application tables (e.g., `profiles`) exist, but the `skillbridge_meta.schema_migrations` table is missing. This indicates a database created before the migration tracking system was implemented.
- **CURRENT**: All migrations in the `infra/supabase/migrations` folder have been applied successfully and their checksums match.
- **UNKNOWN**: The database is in an inconsistent state (e.g., modified migrations, checksum mismatches, or unrecognized tables).

## Execution Paths

### 1. NEW Database (State: EMPTY)
- **Mode Used**: `-Fresh` (or `--fresh`)
- **Action**: 
  1. Creates the `skillbridge_meta.schema_migrations` table.
  2. Applies all available migrations sequentially.
  3. Records each migration in `schema_migrations` with `migration_type = 'BASELINE'`.
- **Result**: State becomes `CURRENT`.

### 2. EXISTING Database (State: BASELINE_V1 or LEGACY)
- **Mode Used**: `-Upgrade` (or `--upgrade`)
- **Action for BASELINE_V1**:
  1. Identifies which migrations have already been applied.
  2. Applies any pending migrations sequentially.
  3. Records each new migration with `migration_type = 'UPGRADE'`.
- **Action for LEGACY**:
  1. Creates the `skillbridge_meta.schema_migrations` table.
  2. Backfills initial migrations (if their exact footprint can be safely determined) or alerts the user to backfill tracking manually if complex. (Currently, upgrading from LEGACY without tracking may require setting a baseline entry for legacy scripts, then applying new ones as UPGRADE).
- **Result**: State becomes `CURRENT`.

### 3. CURRENT Database
- **Mode Used**: `-Upgrade` (or `--upgrade`)
- **Action**: 
  1. Validates all applied migrations.
  2. Detects no pending migrations.
  3. Skips execution.
- **Result**: State remains `CURRENT`.

### 4. UNKNOWN Database
- **Mode Used**: `-Fresh` or `-Upgrade`
- **Action**:
  - The tooling MUST STOP immediately.
  - Outputs: `DATABASE STATE UNKNOWN. MANUAL RECONCILIATION REQUIRED.`
  - No automated changes are made to prevent data corruption.
