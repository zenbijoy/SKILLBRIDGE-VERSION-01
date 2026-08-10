# Migration Order

The following is the historical execution order of migrations in this repository. 
Due to some previous overlapping prefixes (e.g., `003_*` and `004_*`), this document serves as the absolute source of truth for the application order.

All future migrations **MUST** use a strictly increasing numerical prefix (e.g., `008_...`).

## Execution History

1. `001_schema.sql` - Base schema setup.
2. `002_functions_rls.sql` - Core RLS policies and utility functions.
3. `003_research.sql` - Research tables schema additions.
4. `003_seed.sql` - Initial seed data.
5. `004_hardening.sql` - Basic security hardening and triggers.
6. `004_transactions.sql` - Initial transactional RPCs (accept_teaching_request, block_user_atomic, submit_review_atomic).
7. `005_rpc_security_hardening.sql` - Added SECURITY DEFINER constraints and explicitly revoked execution privileges from anon/authenticated roles.
8. `006_room_transactions.sql` - Atomic room operations (create_room_atomic, join_room_atomic, leave_room_atomic).
9. `007_phase12_final_fixes.sql` - Final Phase 1.2 transaction and security fixes, idempotency constraint for points_ledger, and reputation aggregation updates.
