# Backend API Inventory

This document details the registered Express API routes in `backend/src/`.

---

## Registered Endpoints

| Route Prefix | Method | Auth Required | Purpose |
| :--- | :--- | :---: | :--- |
| `/health` | `GET` | No | Basic server liveness check |
| `/health/ready` | `GET` | No | Dependency & readiness check (Redis, Supabase) |
| `/admin/stats` | `GET` | Yes (Admin) | Platform analytics & user counts |
| `/admin/users` | `GET` | Yes (Admin) | Paginated user management list |
| `/admin/users/:id/role` | `POST` | Yes (Admin) | Update user role (e.g. `admin`, `moderator`, `member`) |
| `/chat/conversations/:id/read` | `PATCH` | Yes | Update conversation last read pointer |
| `/chat/messages/:id/status` | `PATCH` | Yes | Update message delivery status |
| `/chat/messages/:id/reactions` | `POST` | Yes | Add emoji reaction to message |
| `/chat/messages/:id` | `DELETE` | Yes | Soft delete a message |
| `/live/token/:sessionId` | `POST` | Yes | Issue LiveKit WebRTC access token for session |
| `/webhooks/live` | `POST` | Webhook Signature | LiveKit room lifecycle event webhook receiver |

**Total Registered Endpoint Clusters**: 11 endpoints across Admin, Chat, LiveKit, and Health modules.
