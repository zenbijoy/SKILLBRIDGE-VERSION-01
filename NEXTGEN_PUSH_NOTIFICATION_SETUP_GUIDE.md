# SkillBridge Next-Gen — Push Notification Subsystem Setup Guide

This guide details the architecture, payload contracts, quiet-hours filtering, and operational configuration of the **SkillBridge Push Notification & In-App Inbox System**.

---

## 1. System Architecture

SkillBridge uses a centralized, typed notification service with multi-channel dispatch:

```
[ Domain Trigger ] (e.g. Q&A Answer Accepted, Clash Proposal, Room Starting)
         │
         ▼
[ NotificationService.dispatch(...) ]
         │
         ├── 1. Database Notification Persistence (public.notifications)
         │       ├── User ID, title, body, priority, entity_type, entity_id
         │       └── Indexed composite query (idx_notifications_user_unread)
         │
         ├── 2. Quiet-Hours & Preference Verification
         │       ├── Checks user's quiet_hours_enabled, quiet_hours_start/end
         │       └── Urgent/Safety notifications bypass quiet hours
         │
         └── 3. Expo Push Notification Dispatch (PushService.sendNotification)
                 ├── Retrieves active Expo push tokens (public.device_tokens)
                 ├── Formats standard Expo push payload with Next-Gen deep links
                 └── Handles chunking, invalid token pruning, and domain telemetry
```

---

## 2. Notification Types & Priority Tiers

SkillBridge defines 20 typed event categories:

| Notification Type | Category | Default Priority | Deep-Link Destination |
|---|---|---|---|
| `QUESTION_ANSWERED` | Study Room Q&A | `normal` | `/room/[id]` (Q&A Tab) |
| `ANSWER_ACCEPTED` | Study Room Q&A | `high` | `/room/[id]` (Q&A Tab) |
| `NEW_ROOM_MATERIAL` | Room Materials | `normal` | `/room/[id]` (Materials Tab) |
| `RECORDING_READY` | Room Archives | `normal` | `/room/[id]` (Recordings Tab) |
| `ROOM_SESSION_STARTING`| Room LiveKit | `high` | `/room/[id]` |
| `ROOM_SESSION_LIVE` | Room LiveKit | `urgent` | `/room/[id]` |
| `CLASH_DETECTED` | Club OS Engine | `high` | `/club/[id]` (Clash Tab) |
| `NEGOTIATION_RECEIVED`| Club OS Engine | `high` | `/club/[id]` (Clash Tab) |
| `NEGOTIATION_ACCEPTED`| Club OS Engine | `high` | `/club/[id]` (Clash Tab) |
| `NEGOTIATION_COUNTERED`| Club OS Engine | `normal` | `/club/[id]` (Clash Tab) |
| `NEGOTIATION_REJECTED`| Club OS Engine | `normal` | `/club/[id]` (Clash Tab) |
| `POST_COMMENT` | Campus Feed | `normal` | `/feed` |
| `POST_REACTION` | Campus Feed | `low` | `/feed` |
| `SYSTEM_ANNOUNCEMENT` | Platform Ops | `urgent` | System Modal / Notice |

---

## 3. Deep-Link Payload Contract

Push notifications include a standardized JSON `data` dictionary that the mobile app consumes in `frontend/app/notifications.tsx`:

```json
{
  "route": "room",
  "roomId": "e302521f-801b-410e-8d5a-8ebfb61c02ab",
  "targetTab": "qa",
  "questionId": "c869ba01-705a-47df-bc62-c0cf47fca234",
  "answerId": "19b846e4-4fa9-43c3-92f7-ec827464e142"
}
```

### Route Resolvers
- `route: "room"`: Navigates to `/room/[id]` and focuses on specified sub-tab (`qa`, `recordings`, `materials`).
- `route: "club"`: Navigates to `/club/[id]`.
- `route: "feed"`: Navigates to `/feed` and scrolls to specified `postId`.
- `route: "chat"`: Navigates to `/chat/[conversationId]`.

---

## 4. Quiet-Hours & Filtering Logic

To respect university student schedules and prevent notification fatigue during nighttime:
1. **User Profile Settings**:
   - `quiet_hours_enabled` (boolean, default: false)
   - `quiet_hours_start` (string, format `"HH:mm"`, e.g. `"23:00"`)
   - `quiet_hours_end` (string, format `"HH:mm"`, e.g. `"07:00"`)
2. **Behavior**:
   - Notifications with priority `low` and `normal` are stored in the database inbox but **suppressed** from push dispatch during quiet hours.
   - Notifications with priority `urgent` (e.g. live classroom starting now, security alerts) **bypass** quiet hours.

---

## 5. Token Management & Production EAS Setup

### Device Token Registration
Clients register their Expo push token upon login:
```http
POST /api/v1/users/me/device-tokens
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios"
}
```

### Credentials Setup in Expo (EAS)
1. **Apple Push Notification Service (APNs)**:
   - Generate an Apple Push Notification Key (`.p8`) in your Apple Developer account.
   - Run `eas credentials` in the `frontend/` directory and configure the APNs key.
2. **Firebase Cloud Messaging (FCM v1)**:
   - Create a Firebase project and download `google-services.json` (Android).
   - Generate a service account private key with `Firebase Cloud Messaging API (V1)` enabled.
   - Upload via `eas credentials` or the Expo dashboard.

---

## 6. Testing Push Notifications

To test notification dispatch in development without physical device tokens:

```bash
# Run test push via curl
curl -X POST https://skillbridge-api.onrender.com/api/v1/test/push \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<TARGET_USER_UUID>",
    "title": "Test Study Room Q&A",
    "body": "Your question received a new verified solution!",
    "data": { "route": "room", "roomId": "<ROOM_UUID>", "targetTab": "qa" }
  }'
```
