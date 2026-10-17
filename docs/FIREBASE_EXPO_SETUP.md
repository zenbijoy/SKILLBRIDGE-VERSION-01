# Firebase + Expo + Calling Setup

SkillBridge uses Supabase as the primary application database. Do not mirror profiles/messages into Firestore unless there is a measured reason. Firebase is used exclusively for FCM high-priority push notifications (to wake up devices for incoming calls and notifications) and Expo Push.

## Required Secret Files (DO NOT COMMIT)

The repository `.gitignore` ignores these secret credential files:

1. **Android Client (`frontend/google-services.json`)**:
   - Download from the Firebase Console under Project Settings -> Your Apps -> Android (`com.skillbridge.app`).
   - Place into `frontend/google-services.json` (referenced by `frontend/app.json` under `expo.android.googleServicesFile`).
   - Required for native Android builds (EAS or local prebuild) to receive native FCM pushes.

2. **Backend Server (`backend/firebase-service-account.json`)**:
   - Download from Firebase Console under Project Settings -> Service accounts -> "Generate new private key".
   - Place into `backend/firebase-service-account.json` or configure the absolute path in `FIREBASE_SERVICE_ACCOUNT_PATH`.
   - Used by `backend/src/services/firebase.ts` to authenticate the `firebase-admin` SDK for high-priority FCM data pushes (`incoming_calls` channel, TTL 60s).
   - If missing, the backend safely continues with Expo push only and logs: `Firebase service account credentials file not found, FCM push provider inactive (Expo push provider active)`.

## Environment Variables

### Backend (`backend/.env`)
```bash
# Push & Firebase
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json

# WebRTC & Calling
P2P_CALLS_ENABLED=true
CLOUDFLARE_TURN_ENABLED=true
CLOUDFLARE_TURN_KEY_ID=<your-turn-key-id>
CLOUDFLARE_TURN_API_TOKEN=<your-turn-api-token>

# Fallback (LiveKit SFU)
LIVEKIT_URL=https://<your-project>.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```

## Android Push & Incoming Call Behavior
1. Create a Firebase project and add an Android app with package ID `com.skillbridge.app`.
2. Configure FCM credentials in EAS (`eas credentials`).
3. Build with EAS development/production build or `npx expo run:android` (calling and native FCM do NOT work in standard Expo Go).
4. High-priority channel `incoming_calls` wakes the device. Tapping the incoming notification opens the call screen in `ringing` mode with explicit **Accept** and **Decline** actions (not auto-accepted).

## Why No Firestore
Supabase/Postgres already owns transactions, search, rooms, sessions, profiles, calls, and messages. Keeping a second database copy creates sync/conflict/permission costs and consumes two quotas for the same records. All call signaling is routed via Socket.IO with a 30s server-side buffer and Supabase `calls` state machine.

