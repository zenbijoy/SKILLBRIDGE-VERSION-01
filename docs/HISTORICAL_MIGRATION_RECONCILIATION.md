# Historical Migration Reconciliation

This document explains the reconciliation of inline modifications made to legacy migration scripts in the `master` branch.

## Context
During a critical repair and feature rollout, several legacy migration files (`001_schema.sql`, `005_rpc_security_hardening.sql`, `006_room_transactions.sql`, `007_phase12_final_fixes.sql`) were modified inline to fix database bugs. However, editing existing database migrations breaks migration history. 

This reconciliation process restores those legacy files to their original state and safely moves the required schema changes and function redefinitions into a new sequential migration script (`012_upgrade_corrections.sql`).

## Commit Hashes
*   **Original Hash (Legacy State)**: `c2ea78d78b6230e8b082ea027d769d547c90d7ab`
*   **Current Hash (Master Repair)**: `2b60e7da4970c31228493bf9189235a2d8b7561c`

## Semantic Changes Extracted to 012_upgrade_corrections.sql

### 1. `rooms.rules` Column
*   **Original Issue**: `rules` column was being referenced by `create_room_atomic` but was missing from the initial `001_schema.sql`.
*   **Master Repair**: Inlined the column addition into `001_schema.sql`.
*   **Resolution**: Restored `001_schema.sql` and used `ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rules text not null default '';` in 012.

### 2. `recompute_reputation(uuid)` RPC Security Grants
*   **Original Issue**: `005_rpc_security_hardening.sql` was trying to apply grants to `recompute_reputation()` (no arguments) when the function signature actually took a `uuid`.
*   **Master Repair**: Changed the function signature in `005_rpc_security_hardening.sql` to include `uuid`.
*   **Resolution**: Restored `005_rpc_security_hardening.sql` and added the proper `GRANT`/`REVOKE` statements for `recompute_reputation(uuid)` in 012. Grants for `block_user_atomic(uuid, uuid)` were also explicitly reaffirmed.

### 3. `create_room_atomic` Function Signature
*   **Original Issue**: The function was missing fields like `topic`, `mode`, and `campus_location`, which were required for the newer features. 
*   **Master Repair**: The function signature and inner logic were updated in both `006_room_transactions.sql` and `007_phase12_final_fixes.sql`.
*   **Resolution**: Restored both 006 and 007 migrations. We now redefine `create_room_atomic` completely in 012 using `CREATE OR REPLACE FUNCTION` and update the respective permissions, securing the function with proper data validation.
