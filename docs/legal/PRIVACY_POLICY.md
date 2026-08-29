# SkillBridge Privacy Policy

**Effective Date**: August 30, 2026  
**Last Updated**: August 30, 2026  
**Entity**: [LEGAL ENTITY NAME] ("SkillBridge", "we", "us", or "our")  
**Contact Email**: [CONTACT EMAIL]  
**Jurisdiction**: [JURISDICTION]  

---

## 1. Introduction
SkillBridge is committed to protecting your personal data and respecting your privacy. This Privacy Policy explains what personal data we collect, how we process and protect it, and your rights under applicable data protection laws (including GDPR and CCPA where applicable).

---

## 2. Personal Data We Collect
We collect only data necessary to operate our peer-to-peer learning, mentorship, real-time collaboration, and community platform:

1. **Account Information**: Email address, password hash (managed securely via Supabase Auth), full name, username, and role.
2. **Profile Data**: Headline, biography, profile avatar image, skills offered, and learning goals.
3. **Communication & Collaboration Data**:
   - In-app text messages and conversation history.
   - Real-time audio/video metadata (session duration, participant identifiers; we **do not** record raw audio/video streams without explicit prior consent).
4. **Learning & Gamification Records**: Quiz submissions, point balances, streak counters, badges earned, and milestone achievements.
5. **Technical & Diagnostic Telemetry**:
   - Device type, operating system version, and client application build version (`X-App-Version`).
   - Request correlation identifiers (`X-Request-ID`).
   - Crash telemetry and error logs (sanitized to remove passwords, tokens, and personal message text).

---

## 3. How We Use Your Data
- **Service Delivery**: Authenticating your account, matching you with tutors and learning rooms, routing real-time chat messages, and signaling WebRTC calls.
- **Safety & Moderation**: Detecting abuse, spam, harassment, and policy violations.
- **Platform Performance**: Monitoring API health, crash rates, and system latency.

---

## 4. Third-Party Service Providers (Subprocessors)
We engage trusted third-party providers under strict data processing agreements:
- **Supabase Inc.**: Managed PostgreSQL database, authentication, and encrypted object storage.
- **LiveKit Cloud**: Real-time WebRTC media routing and selective forwarding unit (SFU).
- **Cloudflare Inc.**: Content delivery network, DDoS mitigation, and TURN media relay.
- **Expo / Apple / Google**: Push notification transport.
- **Sentry (Functional Software Inc.)**: Application crash monitoring (sanitized telemetry only).

---

## 5. Data Retention & Account Deletion
You retain complete control over your personal information:
- You may export or update your profile data at any time via in-app Settings.
- You can permanently delete your account and associated personal data at any time via **Settings -> Security -> Delete Account** or via `DELETE /api/v1/account`.
- Deletion removes all uploaded avatar assets, storage attachments, device push tokens, and profile records.

---

## 6. Contact Us
For any privacy inquiries or to exercise your data subject rights, contact:
- **Data Protection Officer / Privacy Team**: [CONTACT EMAIL]
- **Mailing Address**: [LEGAL ENTITY ADDRESS], [JURISDICTION]
