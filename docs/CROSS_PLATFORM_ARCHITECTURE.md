# SkillBridge Cross-Platform Architecture

SkillBridge is built as a **True Cross-Platform Production Product** where **Android** and **Web** are equal, first-class deployment targets. The web experience is not a demo, preview, or restricted variant; both platforms expose identical core capabilities and communicate with the unified backend services.

---

## 1. Core Architectural Principles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SkillBridge Application Core                      │
│   (Auth, Feed, Social, Rooms, Clubs, Chat, CT Prep, Quizzes, AI Guide) │
├──────────────────────────────────┬──────────────────────────────────────┤
│      Shared State & Caching      │       Unified API & Data Models      │
│  (Zustand, React Query, Sync)    │   (Supabase, Express REST, Socket)   │
├──────────────────────────────────┴──────────────────────────────────────┤
│                   Cross-Platform Adapters (.web / .native)              │
├──────────────────────────────────┬──────────────────────────────────────┤
│       Android / Native Subsystem │ Web Browser Subsystem                │
│  - LiveKit React Native SDK      │ - LiveKit React Web Components       │
│  - @livekit/react-native-webrtc  │ - W3C WebRTC (RTCPeerConnection)     │
│  - Native RTCView Renderer       │ - HTML5 VideoView (<video>)          │
│  - Expo Notifications / FCM      │ - Web Notifications API / Web Push   │
│  - SQLite / Native AsyncStorage  │ - IndexedDB (SkillBridgeDB)          │
│  - ImagePicker (Native Gallery)  │ - HTML5 File Input / Drag & Drop     │
│  - Deep Link (skillbridge://)    │ - Browser URL Navigation / SPA State │
└──────────────────────────────────┴──────────────────────────────────────┘
```

1. **Shared Application Core**: Business logic, state stores (Zustand), API queries (React Query), data validation (Zod), and UI component templates are completely platform-agnostic.
2. **Clean Platform Adapters**: Low-level device features use TypeScript file extensions (`.web.ts` / `.native.ts` / `.d.ts`) to provide native performance on Android while avoiding web bundler crashes and stubbing.
3. **No Fallback to Localhost**: All production builds communicate through environment-configured production endpoints or the canonical Render backend (`https://skillbridge-api.onrender.com/api/v1`).

---

## 2. Platform Adapter Implementations

### A. WebRTC (1:1 Peer-to-Peer Calling)
Both platforms share the same authenticated signaling protocol, call state machine (`useCallStore`), Cloudflare STUN/TURN credential negotiation, network quality monitoring, and automatic ICE restart mechanisms.

* **Native (`webrtc.native.ts` + `VideoView.native.tsx`)**:
  * Leverages `@livekit/react-native-webrtc` bindings for native hardware encoding/decoding.
  * Renders video streams via native `RTCView` with camera flip support.
* **Web (`webrtc.web.ts` + `VideoView.web.tsx`)**:
  * Leverages browser-native `window.RTCPeerConnection`, `window.RTCSessionDescription`, and `navigator.mediaDevices.getUserMedia`.
  * Renders video via HTML5 `<video>` element with `srcObject`, inline playback, and front-camera mirror transformations.

### B. LiveKit (3+ Multi-Peer Classroom & SFU Stages)
Both platforms connect to the same LiveKit SFU instance, use the same `/live/token/:roomId` backend endpoint, and enforce identical classroom permissions (host/speaker/attendee).

* **Native (`LiveRoomScreen.native.tsx`)**:
  * Uses `@livekit/react-native` with `AudioSession` hardware integration and native tracks.
* **Web (`LiveRoomScreen.web.tsx`)**:
  * Uses `@livekit/components-react` (`<LiveKitRoom>`, `<VideoConference>`, `<RoomAudioRenderer>`) with local HD screen recording and direct YouTube replay linking.

### C. Universal Local Storage & Offline Engine
Both platforms support sub-50ms instant rendering, offline draft preservation, and background outbox queue processing with exponential backoff.

* **Shared Interface (`database.ts`)**:
  * `getCachedFeed()` / `setCachedFeed()`
  * `getCachedMessages()` / `appendCachedMessage()`
  * `getCachedCTPlans()` / `setCachedCTPlans()`
  * `getCachedQuizzes()` / `setCachedQuizzes()`
  * `getDraft()` / `setDraft()`
  * `getCachedCallHistory()` / `appendCallHistory()`
  * `queueOutboxTask()` / `getOutbox()` / `updateOutboxTask()`
* **Platform Drivers**:
  * **Android**: Backed by SQLite and native AsyncStorage.
  * **Web**: Backed by **IndexedDB** (`SkillBridgeDB`, `kv_store`) with fallback to browser localStorage for high-capacity offline caching without 5MB storage caps.

### D. Push & Notification System
Both platforms notify users of incoming calls, new messages, session reminders, and club broadcasts.

* **Android (`notifications.native.ts`)**:
  * Registers Expo push / FCM device tokens with backend `/notifications/devices`.
  * Handles deep link intents when notifications are tapped.
* **Web (`notifications.web.ts`)**:
  * Prompts for browser notification permissions via `Notification.requestPermission()`.
  * Registers browser client fingerprint with `/notifications/devices`.
  * Displays rich browser notifications when calls or messages arrive while the tab is blurred/backgrounded.
  * Routes click actions directly to `/call/:id`, `/chat/:id`, or `/broadcast/:id`.

### E. YouTube Live Broadcasts & Q&A Stages
Club seminars and large live lectures are broadcast via YouTube with SkillBridge's interactive live Q&A queue and stage promotion system.

* **Android (`YouTubePlayer.tsx`)**:
  * Uses native player intent / container.
* **Web (`YouTubePlayer.tsx`)**:
  * Uses HTML5 YouTube IFrame player with live mode enabled (`&live=1`).
* **Shared Logic**:
  * Realtime upvoting queue, question submission, and speaker promotion to LiveKit stage.

---

## 3. Responsive Web Layout System

SkillBridge UI components are styled using React Native Web with responsive constraints to ensure a natural experience across all device form factors:

* **Mobile Screens (360px – 390px)**: Full-width touch layout with bottom tab navigation.
* **Tablets & Phablets (768px)**: Balanced card grids and comfortable touch targets.
* **Desktop & Laptops (1024px – 1440px+)**: Screen content is responsively constrained to `maxWidth: 1200px` and centered on the viewport, preventing stretched UI and matching modern desktop web standards.

---

## 4. Fast Dual-Platform Development Workflow

To develop and test Android and Web simultaneously with instant hot reloading:

```bash
# Terminal 1: External/Local Backend API
npm run dev:backend

# Terminal 2: Android Development Client
cd frontend
npx expo start --dev-client

# Terminal 3: Web Application Dev Server
cd frontend
npx expo start --web

# Terminal 4: Admin Dashboard Dev Server
npm run dev:admin
```

Any code changes in `frontend/src/` will immediately hot-reload across both the Android device/emulator and the browser window.

---

## 5. Production Deployment Architecture

### Frontend Vercel Deployment (Expo Web SPA)
* **Root Directory**: `frontend`
* **Framework Preset**: Other
* **Build Command**: `npx expo export --platform web`
* **Output Directory**: `dist`
* **Rewrites**: All non-asset routes fallback to `/index.html` for client-side Expo Router routing.
* **Environment Variables**:
  * `EXPO_PUBLIC_SUPABASE_URL`: Production Supabase URL
  * `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Production Supabase Anon Key
  * `EXPO_PUBLIC_API_URL`: `https://skillbridge-api.onrender.com/api/v1`

### Admin Dashboard Vercel Deployment (Vite React)
* **Root Directory**: `admin`
* **Framework Preset**: Vite
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Environment Variables**:
  * `VITE_SUPABASE_URL`: Production Supabase URL
  * `VITE_SUPABASE_ANON_KEY`: Production Supabase Anon Key
  * `VITE_API_URL`: `https://skillbridge-api.onrender.com/api/v1`

### Backend Render Service (CORS Configuration)
* Set `WEB_ORIGINS` to include both Vercel domains:
  ```
  WEB_ORIGINS="https://<frontend-project>.vercel.app,https://<admin-project>.vercel.app,http://localhost:8081"
  ```
