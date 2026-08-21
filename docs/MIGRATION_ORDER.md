# Migration Order

The following is the historical execution order of migrations in this repository. 
Due to some previous overlapping prefixes (e.g., `003_*` and `004_*`), this document serves as the absolute source of truth for the application order.

All future migrations **MUST** use a strictly increasing numerical prefix after `017`.

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
10. `008_phase_2_realtime.sql` - Phase 2 realtime schema (message idempotency, reactions, push tokens, attendance, notification preferences).
11. `009_phase_2_1_completion.sql` - Phase 2.1 schema additions (delivery status, device token enhancements, push receipts).
12. `010_critical_security_consistency.sql` - Critical security and consistency backstop.
13. `011_product_features.sql` - Product feature domain tables and supporting policies.
14. `012_upgrade_corrections.sql` - Forward-only product and schema corrections.
15. `013_hardening.sql` - Additional authorization, integrity, and operational hardening.
16. `014_atomic_room_service_and_membership.sql` - Atomic room service and membership consistency.
17. `015_complete_domain_hardening.sql` - Complete domain constraints, indexes, and transactional RPC hardening.
18. `016_experience_expansion.sql` - Progressive onboarding, dashboard layouts/configuration, announcements, guided tours, and feature flags.
19. `017_experience_integrity_and_admin_content.sql` - Atomic onboarding/preferences/tour contracts, announcement dismissal and targeting, versioned experience content, privilege correction, and baseline parity.

`001_skillbridge_baseline.sql` is the canonical fresh-install schema. It is not part of the numbered incremental chain; its current schema must remain equivalent to the forward-migrated schema. The real PostgreSQL suite verifies a fresh baseline against a reconstructed 016 schema upgraded through 017.
