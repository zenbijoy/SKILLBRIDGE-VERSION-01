# Production Security Checklist

- [x] **PostgreSQL RLS Enabled**: All public tables (except backend-only `push_receipts` and `schema_migrations`) have Row-Level Security enabled.
- [x] **SECURITY DEFINER search_path**: All SECURITY DEFINER RPCs have explicit `SET search_path = public`.
- [x] **Private Ports**: PostgreSQL (5432) and Redis (6379) are bound to `127.0.0.1` and NOT exposed publicly.
- [x] **No Secrets in Git**: `.env` files and private keys are ignored in `.gitignore`.
- [x] **Client Separation**: Mobile app contains ONLY `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [x] **Rate Limiting**: Distributed rate limiting protects login, search, messaging, and admin APIs.
- [x] **Admin RBAC**: All admin routes `/api/v1/admin/*` require `requireAdminPermission` / `requireRole("moderator", "admin")`.
- [x] **Chat Security**: Message status patch verifies conversation membership and uses recipient-isolated `message_delivery_receipts`.
