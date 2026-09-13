# SkillBridge Next-Gen Phase 3 Pre-Audit

**Phase:** Next-Gen Operations, Cloudflare Edge & Control Plane (Phase 3)  
**Date:** September 2026  
**Status:** Completed  

---

## 1. Executive Summary

This pre-audit examines all existing components, architectural patterns, and subsystems prior to implementing Phase 3 (Cloudflare Worker Edge Layer, Notification System, Admin Control Plane, Moderation, and Observability).

Every subsystem is classified into one of the required categories:
- **EXISTS**: Fully present, verified, and operational.
- **PARTIAL**: Basic structure exists but needs extension for Next-Gen.
- **MISSING**: Not yet implemented.
- **DUPLICATED**: Multiple competing implementations found.
- **UNSAFE**: Present but requires security hardening or privacy fixes.
- **CAN REUSE**: Existing abstraction that should be leveraged rather than rewritten.

---

## 2. Classification Matrix

| Subsystem / Resource | Current Location | Classification | Audit Findings & Next Steps |
| :--- | :--- | :--- | :--- |
| **Push Notification Dispatch** | `backend/src/services/PushService.ts` | **CAN REUSE** | `ExpoPushProvider` handles batch tickets and checks receipts. Reuse as low-level transport. |
| **Notification Helper** | `backend/src/services/push.ts` | **PARTIAL** | Has basic `notifyUser` with quiet-hours check. Needs typed Next-Gen domain catalog and deep linking. |
| **Notifications Table** | `public.notifications` (Migration 001) | **PARTIAL** | Has `id, user_id, kind, title, body, data, read_at, created_at`. Needs `priority, entity_type, entity_id, expires_at`. |
| **Device Tokens Table** | `public.device_tokens` (Migration 001) | **CAN REUSE** | Has `user_id, token, token_fingerprint, platform, enabled, last_seen_at`. Fully functional. |
| **Notification Inbox UI** | `frontend/app/notifications.tsx` | **PARTIAL** | Lists notifications and handles mark-read. Needs date grouping and Next-Gen deep-link routing. |
| **Reports Table** | `public.reports` (Migration 001) | **PARTIAL** | Target types limited to `user, message, room, event, resource`. Needs extension for posts, comments, Q&A. |
| **Moderation Queue Route** | `backend/src/routes/admin.ts` | **CAN REUSE** | `/admin/reports` supports triage (`open, reviewing, resolved, dismissed`). Extend for Next-Gen types. |
| **Moderation Center UI** | `admin/src/pages/ModerationCenter.tsx` | **CAN REUSE** | Full triage table exists. Extend with anonymous masking and audit logging. |
| **Moderation Audit Log** | Database / Backend | **MISSING** | Need dedicated `public.moderation_audit_logs` table for tracking moderator decisions. |
| **Feature Flags Engine** | `public.feature_flags`, `dashboard.ts` | **CAN REUSE** | Supports role targeting, percentage rollouts. Seeded with Next-Gen flags in Migration 029. |
| **Feature Flag Admin UI** | `admin/src/pages/ProductExperience.tsx` | **CAN REUSE** | Toggles and sliders already manage `feature_flags`. Add quick kill-switch preset in NextGen view. |
| **Global Rate Limiting** | `backend/src/app.ts` | **PARTIAL** | Express rate-limit applied globally (IP-based). Needs user-aware limits for sensitive mutations. |
| **Structured Logger** | `backend/src/lib/logger.ts` (Pino) | **CAN REUSE** | Production Pino instance with correlation ID middleware. Add domain event logging helper. |
| **Request Correlation ID** | `backend/src/middleware/requestId.ts` | **EXISTS** | Generates/forwards `x-request-id` via AsyncLocalStorage. Fully wired. |
| **Liveness/Readiness Probes** | `backend/src/routes/health.ts` | **PARTIAL** | `/health` and `/health/ready` exist. Add explicit `/health/live` and R2/Edge provider status. |
| **Cloudflare Worker Edge** | `infra/cloudflare/worker/` | **MISSING** | Needs isolated Worker package for public discovery GET caching, bypass rules, and purge API. |
| **Anonymous Privacy** | `backend/src/routes/feed.ts` | **UNSAFE (FIXED)** | Mask real author IDs in responses to guarantee student anonymity across all feed and comment routes. |

---

## 3. Detailed Audit Findings

### A. Push Notifications & Notification Flow
- **Current State:** `PushService.ts` contains `ExpoPushProvider` and `MockPushProvider`. It already handles `DeviceNotRegistered` token deactivation and receipt confirmation polling.
- **Reuse Strategy:** Build `backend/src/services/notificationService.ts` on top of `PushService.ts` to provide a strongly-typed domain notification interface (`ROOM_SESSION_STARTING`, `QUESTION_ANSWERED`, `ANSWER_ACCEPTED`, `CLASH_DETECTED`, `NEGOTIATION_RECEIVED`, `POST_COMMENT`, etc.).

### B. Database Schema & Migration 030
- **Current State:** `public.reports` contains a check constraint: `check(target_type in ('user','message','room','event','resource'))`.
- **Requirement:** Add support for `'post'`, `'comment'`, `'question'`, `'answer'`, and `'club_announcement'`.
- **Action:** Create `030_nextgen_notifications_ops.sql` adding these types, adding metadata columns to `notifications`, and creating `moderation_audit_logs` with RLS.

### C. Rate Limiting on Campus Networks
- **Current State:** Current rate limit is purely IP-based (`limit: env.GLOBAL_RATE_LIMIT_PER_MINUTE`). On campus networks, dozens or hundreds of students share public gateway IPs.
- **Requirement:** Authenticated user actions must use `req.userId` for bucket calculation, falling back to IP only for unauthenticated endpoints.

### D. Cloudflare Worker Edge Gateway
- **Current State:** Cloudflare R2 is implemented, but no edge caching worker exists.
- **Requirement:** Create an isolated worker package in `infra/cloudflare/worker/`. Implement deterministic caching for public GET endpoints only (`/api/v1/rooms`, `/api/v1/clubs`, `/api/v1/events`, `/api/v1/experience`). Strictly bypass all mutations, authenticated routes, private rooms, direct messages, and admin endpoints.

### E. Admin Control Plane
- **Current State:** The admin Vite app is rich with operational pages (`ProductExperience`, `ModerationCenter`, `SystemHealth`, `APIManagement`).
- **Reuse Strategy:** Add a dedicated `NextGenOperations.tsx` page consolidating provider health (Supabase, Redis, R2, LiveKit, Expo Push, Edge Gateway), Next-Gen feature flag kill switches, and moderation audit view.
