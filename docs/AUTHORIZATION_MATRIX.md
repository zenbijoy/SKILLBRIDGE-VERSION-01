# SkillBridge V3 Authorization & Role Matrix

SkillBridge V3 implements a strict zero-trust Role-Based Access Control (RBAC) model across Platform Roles and Room-Scoped Roles.

---

## 1. Platform Roles & Permissions

| Action | Anonymous | Student | Tutor | Moderator | Administrator |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Public Search / Discovery** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Join Public Rooms** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Create Study Rooms** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Take Skill Verification Quiz** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Schedule Teaching Sessions** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Apply for Research Collaboration** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Review Platform Reports Queue** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Suspend / Reactivate User Account** | ❌ | ❌ | ❌ | ✅ (non-admins) | ✅ |
| **Elevate User to Moderator** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **View Transactional Audit Logs** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Delete Account & Storage** | ❌ | Self Only | Self Only | Self Only | Self / Managed |

---

## 2. Room-Scoped Roles & Permissions

| Room Action | Room Owner | Room Teacher | Room Moderator | Room Member | Non-Member |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Room Details** | ✅ | ✅ | ✅ | ✅ | Public only |
| **Send Room Messages & Reactions** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Schedule Classroom Sessions** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Start / Conclude LiveKit Video** | ✅ | Assigned | ❌ | ❌ | ❌ |
| **Publish Audio / Video / Screen** | ✅ | ✅ | Hand Raised | ❌ (Listen only) | ❌ |
| **Upload Study Materials** | ✅ | ✅ | ✅ | Optional | ❌ |
| **Download Private Resources** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Issue Peer Room Invitations** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Manage / Kick Members** | ✅ | ❌ | Lower roles | ❌ | ❌ |
| **Transfer Room Ownership** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Archive / Delete Study Room** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Database Function (RPC) Execution Rights

| Stored Procedure | `PUBLIC` | `anon` | `authenticated` | `service_role` |
| :--- | :---: | :---: | :---: | :---: |
| `public.join_room_service_atomic` | ⛔ REVOKED | ⛔ REVOKED | ⛔ REVOKED | ✅ GRANTED |
| `public.leave_room_service_atomic` | ⛔ REVOKED | ⛔ REVOKED | ⛔ REVOKED | ✅ GRANTED |
| `public.award_reputation_atomic` | ⛔ REVOKED | ⛔ REVOKED | ⛔ REVOKED | ✅ GRANTED |
| `public.admin_mutate_user_status_atomic` | ⛔ REVOKED | ⛔ REVOKED | ⛔ REVOKED | ✅ GRANTED |
| `public.admin_decide_report_atomic` | ⛔ REVOKED | ⛔ REVOKED | ⛔ REVOKED | ✅ GRANTED |
