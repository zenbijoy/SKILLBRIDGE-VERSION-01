# SkillBridge Data Retention Policy

## 1. Purpose
This policy defines the retention schedules and automated purging criteria for user data, communication records, telemetry, and system audit logs across SkillBridge infrastructure.

---

## 2. Retention Schedules by Category

| Category | Description | Active Period | Post-Deletion / Retention Action |
| :--- | :--- | :--- | :--- |
| **User Profile & Credentials** | Username, email, bio, avatars | Life of account | Purged within 24 hours upon account deletion |
| **Chat Messages** | Direct and room text conversations | Active account | Cascade deleted or anonymized upon user request |
| **Call & RTC Telemetry** | Session duration, provider, ICE candidate counts | 90 days | Aggregated into daily metrics; raw records purged |
| **Moderation Reports** | Flagged content, report reasons, reviewer actions | 1 year | Retained for safety compliance and appeals |
| **Audit Logs** | Administrative actions, privilege escalations | 2 years | Immutable ledger for forensic compliance |
| **Push Notification Tokens** | Device Expo push tokens | Active session | Deactivated upon logout; purged after 180 days inactive |

---

## 3. Automated Purge Mechanisms
- **Inactive Device Tokens**: Disabled automatically upon `DeviceNotRegistered` push receipt errors.
- **Temporary Uploads**: Incomplete multipart uploads purged after 48 hours.
- **Audit Ledger**: Partitioned PostgreSQL tables with automated archival for compliance.
