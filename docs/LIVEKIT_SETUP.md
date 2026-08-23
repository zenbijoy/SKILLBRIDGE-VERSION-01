# LiveKit Cloud Configuration & Setup Guide

SkillBridge uses **LiveKit Cloud** (`https://cloud.livekit.io`) for high-performance WebRTC real-time video classrooms, screen sharing, audio rooms, and attendance recording.

---

## 1. Retrieve Credentials from LiveKit Cloud

From your **LiveKit Cloud Dashboard** (`https://cloud.livekit.io`):

1. **Project URL (`LIVEKIT_URL`)**:
   - Navigate to **Project Settings** (or **General** in the left sidebar).
   - Find your **Websocket URL** (e.g., `wss://skillbridge-xxxxxx.livekit.cloud`).

2. **API Key & Secret (`LIVEKIT_API_KEY` & `LIVEKIT_API_SECRET`)**:
   - Navigate to **API Keys** in the left sidebar (as shown in the console).
   - Copy your **API Key** (starts with `API...`, e.g., `APIdBF...`).
   - If you have your **API Secret**, copy it. If you don't have the secret, click **"Create key"** in the top right corner to generate a new Key + Secret pair.

---

## 2. Configure Backend Environment

Open `backend/.env` (or copy from `backend/.env.example`) and add your LiveKit credentials:

```env
# --- LIVEKIT WEBRTC REAL-TIME CLASSROOMS ---
LIVEKIT_URL="wss://your-project-subdomain.livekit.cloud"
LIVEKIT_API_KEY="APIdBFxxxxxxxxx"
LIVEKIT_API_SECRET="your_livekit_api_secret_here"
```

> **Note:** The backend automatically verifies these credentials when generating access tokens. If they are missing, the backend returns a clear `LIVEKIT_NOT_CONFIGURED` response so clients can display a helpful notification instead of crashing.

---

## 3. (Optional) Set Up Webhooks for Attendance Tracking

SkillBridge automatically logs participant join/leave timestamps to the database (`livekit_attendance` table) and transitions sessions to `completed` when a room ends.

To enable webhooks:
1. Go to **LiveKit Cloud** -> **Webhooks** in the left sidebar.
2. Click **"Add Webhook"**.
3. Set **URL** to: `https://your-backend-api-domain.com/webhooks/live` (or your ngrok / local tunnel URL during development: e.g., `https://xxxx.ngrok-free.app/webhooks/live`).
4. Select the following events:
   - `Participant Joined` (`participant_joined`)
   - `Participant Left` (`participant_left`)
   - `Room Finished` (`room_finished`)
5. Save the webhook.

---

## 4. How It Works in SkillBridge

- **Starting a Class**: Room owners and teachers can schedule or immediately launch a live session by tapping **"Start Live Class 🔴"** inside any room screen.
- **Joining a Class**: Members tap **"Join Live Class 🔴"** to enter the real-time audio/video stream.
- **Role Permissions**:
  - **Teachers & Hosts**: Full broadcasting rights (Camera, Microphone, Camera Flip, Screen Share).
  - **Students & Members**: Real-time viewing, listening, hand raising (✋), and data messaging.
- **Low-Data Mode**: Mobile users in low-bandwidth areas can toggle **"Audio Only 📶"** to conserve data while maintaining crisp audio.
