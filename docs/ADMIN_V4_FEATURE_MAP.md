# SkillBridge Admin Control Plane V4: Feature Map

## Overview
SkillBridge Control Plane V4 integrates full operational visibility and platform management across people, learning, trust, engagement, observability, and data governance. All metrics are computed dynamically from active PostgreSQL tables with zero static mock placeholders.

---

## Navigation & Module Hierarchy

### 1. OVERVIEW
* **Executive Overview (`/`)**: Core operational summary cards, quick health probe, active member distribution.
* **Analytics & Growth Engine (`/analytics`)**:
  - Timeframe toggles: 7-Day, 30-Day, 90-Day bounded database windows.
  - Active Users: Real DAU (last 24h), WAU (last 7d), MAU (last 30d), new registrations today/period.
  - User Growth Area Chart: SVG vector rendering of user growth velocity.
  - Onboarding Funnel: Complete progression metrics (Started → Identity/Academic → Mission → Skills → Completed).
  - Learning Conversion: Active study rooms, member density, session attendance rates, peer connection conversion.
* **System Status & Health (`/system-status`, `/system-health`)**:
  - Automated anomaly detector with real-time issue banner.
  - Subsystem telemetry: Supabase DB ping latency, Redis connection state, Auth failure velocity (per-minute spike detection), LiveKit WebRTC video classroom status, Expo Push integration, Socket.IO real-time channels.
  - Server runtime: Uptime counter, recent restart detection, RSS & V8 Heap usage, Node environment.
  - Safe Cache Operations: Namespace-specific invalidation for `dashboard:*`, `catalog:*`, and `rooms:*` with mandatory reason prompts and immutable audit logs.
* **Admin Alert Center (`/alerts`)**:
  - Real-time operational issue aggregator: Security anomalies, moderation backlog, system health degradation, data quality alerts.
  - Interactive topbar alert bell with live badge count and dropdown preview.
  - Filter by severity (Critical, Warning, Info) and category.
  - Acknowledge and direct deep-linking into resolution workflows.

---

### 2. PEOPLE
* **User 360 Console (`/users`)**: Search and inspect profiles, role transitions, account status (active, suspended, banned).
* **Administrators Management (`/administrators`)**: RBAC assignment for `owner`, `admin`, and `moderator`. Prevent self-demotion and protect owner role.
* **Verification Override (`/verification`)**: Review identity and university student verification requests.
* **Privacy & Account Operations (`/privacy`)**:
  - Compliance tracking for account deactivations, privacy visibility distributions.
  - Immutable audit trail of deletion, deactivation, and data requests.
  - Privacy safeguards: Zero raw token or credential exposure; read-only compliance logging.

---

### 3. LEARNING
* **Skills Intelligence (`/skills-intelligence`)**:
  - Market supply vs demand ratio calculations (`learners : teachers`).
  - Critical shortage automated alerts (ratio ≥ 4.0 or zero teachers).
  - Search, pagination, and subject category filters.
  - Research topic distribution analysis.
* **Learning Operations Console (`/learning-ops`)**:
  - Real-time study rooms console: member density, session count, report counts.
  - Session tracking: host, schedule, attendance rates, mode (video/audio/chat).
  - Safe administrative room actions: Archive, Freeze, Activate with mandatory justification.
  - Session cancellation with reason and audit log.
  - Real-time Socket.IO and LiveKit WebRTC telemetry strip.
* **Discovery & Search Insights (`/discovery-insights`)**:
  - Privacy-preserving query frequency rankings from `search_analytics_events`.
  - Zero-result search tracking for curriculum gaps.
  - Search success conversion rate, connection acceptance rate, and room join density.
  - Popular research interest clusters across campus.

---

### 4. TRUST & SUPPORT
* **Trust & Safety Cases (`/trust-cases`)**:
  - Structured incident cases linking user reports, subject profiles, severity, and status.
  - Internal investigative notes thread for collaborative moderation.
  - Escalation statuses: `open`, `investigating`, `actioned`, `dismissed`, `closed`.
* **Moderation Center (`/moderation`)**: Review reported messages, rooms, events, and resources.
* **Support & Operations (`/support`)**: Helpdesk requests, tickets, and user inquiries.

---

### 5. ENGAGEMENT
* **Community Operations (`/community`)**:
  - Tabbed management for Clubs, Campus Events, Learning Resources, and Diagnostic Quizzes.
  - Moderation actions: Feature, Approve, Hide, Archive with immutable audit records.
* **Campaign Center (`/campaigns`)**:
  - Targeted audience broadcast center (In-App notifications, Expo Push).
  - Live audience estimation prior to scheduling or broadcasting.
  - Audience targeting by role, campus university, and learning skill.
  - Campaign dispatch history and delivery stats.
* **Product Experience (`/experience`)**:
  - Server-driven dashboard widgets: default order, mandatory enforcement, target audiences.
  - Announcements: localized (English/Bangla), persistent dismissal, scheduled broadcasts.
  - Feature Flags: deterministic percentage rollouts and role-aware kill switches.
  - Versioned Experience Content: atomic welcome, onboarding, and tour publishing.
  - App Version & Release Control: Min supported version, recommended version, maintenance locks, update prompts, and client version telemetry.

---

### 6. OPERATIONS
* **Data Quality Center (`/data-quality`)**:
  - Read-only diagnostics engine scanning for incomplete profiles, stale onboarding states, orphan rooms, and dangling references.
  - Health score rating, severity indicators, sample IDs, and recommended safe remediation actions.
* **Runtime Policy Engine (`/rules`)**: Global platform rules, room capacities, rate limits.
* **Integrations & API Management (`/api-mgmt`)**: Provider statuses (LiveKit, Expo, Supabase, Redis).
* **Audit Explorer V2 (`/db-ops`)**:
  - Multi-dimensional filtering: Date range, Actor ID, Action, Target Type, Target ID.
  - Automatic metadata sanitization (redaction of tokens, credentials, authorization headers).
  - Sanitized CSV export for regulatory and compliance archiving.
