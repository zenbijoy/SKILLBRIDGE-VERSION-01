# SkillBridge Admin Control Plane V4: API & RBAC Matrix

## Endpoint Matrix

| Endpoint | Method | Allowed Roles | Description | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/admin/analytics` | GET | `owner`, `admin`, `moderator` | Timeframe analytics (DAU, WAU, MAU, funnel, conversion) | — |
| `/api/v1/admin/skills-intelligence` | GET | `owner`, `admin`, `moderator` | Supply/demand ratios, shortage detection, pagination | — |
| `/api/v1/admin/learning-ops/rooms` | GET | `owner`, `admin`, `moderator` | Rooms list with members, sessions, and report metrics | — |
| `/api/v1/admin/learning-ops/rooms/:id/status` | PATCH | `owner`, `admin` | Room status transitions (archive, freeze, activate) | `admin.learning.room.update_status` |
| `/api/v1/admin/learning-ops/sessions` | GET | `owner`, `admin`, `moderator` | Study sessions list with attendance statistics | — |
| `/api/v1/admin/learning-ops/sessions/:id/cancel` | POST | `owner`, `admin` | Cancel session with required reason | `admin.learning.session.cancel` |
| `/api/v1/admin/learning-ops/realtime` | GET | `owner`, `admin`, `moderator` | Real-time Socket.IO and LiveKit WebRTC state | — |
| `/api/v1/admin/community/items` | GET | `owner`, `admin`, `moderator` | Tabbed items: clubs, events, resources, quizzes | — |
| `/api/v1/admin/community/moderate` | POST | `owner`, `admin` | Feature, approve, hide, archive community items | `admin.community.moderate` |
| `/api/v1/admin/campaigns` | GET | `owner`, `admin` | List notification campaigns and delivery stats | — |
| `/api/v1/admin/campaigns/estimate` | GET | `owner`, `admin` | Live target audience estimation query | — |
| `/api/v1/admin/campaigns` | POST | `owner`, `admin` | Create and dispatch/schedule notification campaign | `admin.campaign.create` |
| `/api/v1/admin/campaigns/:id/cancel` | POST | `owner`, `admin` | Cancel scheduled campaign | `admin.campaign.cancel` |
| `/api/v1/admin/trust-cases` | GET | `owner`, `admin`, `moderator` | List structured escalation cases with reports | — |
| `/api/v1/admin/trust-cases/:id` | GET | `owner`, `admin`, `moderator` | Detailed case view with internal notes log | — |
| `/api/v1/admin/trust-cases` | POST | `owner`, `admin`, `moderator` | Create new Trust & Safety case | `admin.trust_case.create` |
| `/api/v1/admin/trust-cases/:id/action` | POST | `owner`, `admin`, `moderator` | Update status, assign operator, or resolve case | `admin.trust_case.action` |
| `/api/v1/admin/trust-cases/:id/note` | POST | `owner`, `admin`, `moderator` | Append internal investigator note | `admin.trust_case.note` |
| `/api/v1/admin/alerts` | GET | `owner`, `admin`, `moderator` | Aggregated operational alerts feed | — |
| `/api/v1/admin/alerts/:id/acknowledge` | POST | `owner`, `admin`, `moderator` | Acknowledge alert | `admin.alert.acknowledge` |
| `/api/v1/admin/discovery-insights` | GET | `owner`, `admin`, `moderator` | Search frequency, zero-result terms, conversion | — |
| `/api/v1/admin/data-quality` | GET | `owner`, `admin` | Read-only relational diagnostics and findings | — |
| `/api/v1/admin/privacy` | GET | `owner`, `admin` | Deactivated accounts and privacy audit trail | — |
| `/api/v1/admin/cache/clear` | POST | `owner`, `admin` | Safe namespace invalidation (`dashboard`, `catalog`, `rooms`) | `admin.cache.clear` |
| `/api/v1/admin/version-control` | GET | `owner`, `admin`, `moderator` | App release versions and client version telemetry | — |
| `/api/v1/admin/version-control` | PATCH | `owner`, `admin` | Mutate min/recommended version and maintenance mode | `admin.version_control.update` |
| `/api/v1/admin/audit-logs` | GET | `owner`, `admin` | Multi-filter audit query and sanitized CSV export | — |
| `/api/v1/admin/system/status` | GET | `owner`, `admin` | Subsystem diagnostics and latency probes | — |
| `/api/v1/admin/users/:id/roles` | PUT | `owner`, `admin` | Replace elevated role for administrator | `admin.user.roles.replace` |

---

## Role Permissions Summary

* **Owner**: Full control over all system domains, administrator assignment, system policies, and infrastructure operations.
* **Admin**: User lifecycle management, room moderation, community operations, campaigns, analytics, version policies, and safe cache management. Cannot demote Owner.
* **Moderator**: Read access to analytics and community items; full access to reports, trust cases, and moderation actions. Strictly prohibited from clearing cache, changing app version policies, administering roles, or viewing infrastructure secrets.
* **Student / Public**: Fully denied (401/403) from all `/api/v1/admin/*` endpoints.
