# SkillBridge Next-Gen — Admin Operations & Moderation Guide

This guide covers operational procedures for platform administrators using the **SkillBridge Next-Gen Operations Control Plane** (`/nextgen`).

---

## 1. Accessing the Next-Gen Control Plane

1. Navigate to the Admin Web Portal: `https://admin.skillbridge.app/nextgen` (or local port `http://localhost:5173/nextgen`).
2. Log in with an account having the `admin` role.
3. Select **Next-Gen Operations** under the **Operations** section in the sidebar.

---

## 2. Provider Health & Telemetry

The Control Plane provides real-time status across 6 foundational infrastructure providers:

| Subsystem | Indicator | Healthy Condition | Action if Degraded / Unhealthy |
|---|---|---|---|
| **Cloudflare Edge Gateway** | `active` | Worker proxying requests; SWR caching enabled | Check Cloudflare Workers dashboard; verify `ORIGIN_URL`. |
| **Object Storage (R2)** | `R2` or `Supabase` | SigV4 presigner active; zero upload errors | Check `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Automatic fallback to Supabase Storage protects uploads. |
| **Supabase Database** | `healthy` | RPC `health_check` responds 200/healthy; RLS active | Check Supabase project compute usage and connection pooler. |
| **Redis Cache** | `UP` / `healthy` | Hit ratio > 60%; memory utilization stable | Check Redis instance URL; API operates in safe degraded cache mode if Redis is down. |
| **LiveKit WebRTC** | `configured` | API keys and LiveKit server URL verified | Inspect LiveKit Cloud or self-hosted ingress container. |
| **Push Notifications** | `configured` | Expo Push service token active; device tokens valid | Verify Expo Access Token and APNs/FCM credentials. |

---

## 3. Emergency Kill-Switches & Feature Flags

If an abusive event, security flaw, or infrastructure degradation occurs, specific Next-Gen modules can be disabled campus-wide with zero redeployment:

| Kill-Switch Flag | Protected Feature | Impact When Disabled |
|---|---|---|
| `nextgen_feed` | Campus Feed & Anonymous Posts | Disables feed publication and browsing; prevents anonymous spam attacks. |
| `nextgen_qna` | Study Room Q&A Board | Disables new questions/answers; existing sessions continue. |
| `nextgen_recordings` | Room YouTube Archives | Hides recordings section; prevents malicious video URL linking. |
| `nextgen_materials` | Room Materials Hub & Storage | Disables presigned upload tickets; prevents storage quota flooding. |
| `nextgen_clash_engine` | Club OS Clash Engine | Pauses automated schedule clash detection and negotiation proposals. |

---

## 4. Moderation Queue & Content Actions

Moderators can review reports submitted against Next-Gen entities (`post`, `comment`, `question`, `answer`, `club_announcement`):

### Available Moderation Actions
1. **Resolve**: Confirms the report has been reviewed and requires no further intervention.
2. **Delete Content**: Atomically purges the offending post, comment, or Q&A item from the database.
3. **Dismiss**: Marks report as frivolous or invalid without altering content.

---

## 5. Anonymous Content & Protected Deanonymization

To balance student free expression with safety against harassment and threats:
1. **Default Presentation**:
   - Posts and comments authored anonymously display ONLY the scoped handle (e.g. `Anonymous Student #E4B2`) to moderators and clients.
   - The database author ID is explicitly masked (`author_id: null`).
2. **Identity Reveal Protocol (Deanonymization)**:
   - Available **ONLY** to verified users with the `admin` role.
   - Requires clicking **"Masked (Inspect)"** in the moderation queue.
   - Requires entering a mandatory justification (minimum 10 characters) explaining the safety/legal necessity.
   - The action executes `POST /api/v1/admin/moderation/reveal-identity`.
   - **Immutable Audit Logging**: An entry is automatically recorded in `public.moderation_audit_logs` containing the administrator's ID, the target entity, the justification, and the timestamp.

---

## 6. Inspecting the Moderation Audit Trail

Administrators can inspect all historical moderation and deanonymization events either via the **Moderation Audit Log** tab in the UI or via direct SQL:

```sql
-- View recent deanonymization events
SELECT
  l.created_at,
  p.full_name AS administrator,
  p.email AS admin_email,
  l.action,
  l.entity_type,
  l.entity_id,
  l.reason AS justification,
  l.details
FROM public.moderation_audit_logs l
JOIN public.profiles p ON p.id = l.admin_id
WHERE l.action = 'identity_revealed'
ORDER BY l.created_at DESC
LIMIT 20;
```
