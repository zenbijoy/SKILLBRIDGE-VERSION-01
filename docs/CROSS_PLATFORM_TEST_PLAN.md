# SkillBridge Cross-Platform Test Plan

This document defines the comprehensive test suite and validation procedures for verifying **Android** and **Web** feature parity across all product domains.

---

## 1. Test Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │    SkillBridge Universal Test Suite    │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                      ┌────────────────────────┐
     │  Android Native Suite  │                      │   Web Browser Suite    │
     │  - Jest / React Native │                      │  - Vitest / Playwright │
     │  - Dev Client E2E      │                      │  - Chrome / Safari / FF│
     │  - Hardware RTC & Audio│                      │  - Responsive Viewport │
     └────────────────────────┘                      └────────────────────────┘
```

---

## 2. Shared Domain Tests (Core Business Logic)

| Test Suite | Domain | Scope | Target Pass Rate |
| :--- | :--- | :--- | :--- |
| `api.test.ts` | Backend REST Client | Token refresh on 401, error parsing, header injection | 100% |
| `providerRouter.test.ts` | Realtime Provider Routing | 1:1 P2P routing vs LiveKit 3+ SFU routing | 100% |
| `callStore.test.ts` | Call State Machine | Initiating -> Ringing -> Connected -> Ended transitions | 100% |
| `syncEngine.test.ts` | Offline Outbox Engine | Task queuing, deduplication, retry with exponential backoff | 100% |
| `i18n.test.ts` | Localization | English & Bangla string keys match 100% across all screens | 100% |

---

## 3. Android Platform Validation Checklist

Execute on Android Physical Device or Emulator (`npx expo run:android` / `npx expo start --dev-client`):

1. **Authentication**:
   - [x] Email/password registration and login.
   - [x] Session restoration from AsyncStorage / SecureStore after app kill.
   - [x] Google OAuth redirect through `skillbridge://` scheme.
2. **1:1 WebRTC Call**:
   - [x] Outgoing audio/video call initialization via `@livekit/react-native-webrtc`.
   - [x] Native `RTCView` local PIP preview and remote fullscreen rendering.
   - [x] Camera flip (front/back), microphone mute toggle, speakerphone toggle.
   - [x] Network quality meter updating via getStats().
3. **LiveKit Group Classroom (3+ peers)**:
   - [x] Connect to room via `/live/token/:roomId`.
   - [x] Multi-participant video grid with spotlight on screen share / active speaker.
   - [x] AudioSession management and hand-raising data messages.
4. **Push Notifications**:
   - [x] Expo push token registration with backend `/notifications/devices`.
   - [x] Incoming call modal displayed on socket trigger.
5. **Storage & Outbox**:
   - [x] Offline feed caching and sub-50ms instant display.
   - [x] Outbox task queue creation when network is disconnected; automatic flush when reconnected.
6. **Files & Images**:
   - [x] Native gallery picker (`expo-image-picker`) avatar upload.

---

## 4. Web Platform Validation Checklist

Execute on Chrome, Firefox, Safari, and Edge (`npx expo start --web` / Vercel preview):

1. **Authentication**:
   - [x] Email/password login and signup.
   - [x] WebStorage session persistence across browser reloads.
   - [x] OAuth redirect flow and callback state cleanup.
2. **1:1 WebRTC Call**:
   - [x] Outgoing audio/video call using browser `RTCPeerConnection` and `getUserMedia`.
   - [x] Local PIP `<video>` (with front-facing mirror) and remote fullscreen `<video>`.
   - [x] Mute audio track, toggle camera track, Cloudflare TURN relay fallback.
   - [x] Call history recorded in IndexedDB.
3. **LiveKit Group Classroom (3+ peers)**:
   - [x] `@livekit/components-react` conference room rendered inside responsive layout.
   - [x] In-browser HD local screen recording (`MediaRecorder`) and save to session.
   - [x] YouTube video attachment and replay linking.
4. **Web Notifications**:
   - [x] Notification permission prompt and registration with `/notifications/devices`.
   - [x] Background tab browser notification on incoming call or message with direct deep link.
5. **Storage & IndexedDB**:
   - [x] `SkillBridgeDB` object store verification in browser DevTools.
   - [x] Feed, messages, quiz cache, and draft persistence.
6. **Dynamic Routing & SPA Fallbacks**:
   - [x] Direct URL navigation to `/call/[id]`, `/broadcast/[id]`, `/room/[id]`, `/user/[id]`.
   - [x] Direct browser page refresh without 404s (handled via `vercel.json` rewrites).
7. **Responsive Breakpoints**:
   - [x] **360px / 390px**: Mobile layout with bottom navigation.
   - [x] **768px**: Tablet view with 2-column cards.
   - [x] **1024px / 1440px**: Centered max-width desktop layout with clean whitespace.

---

## 5. Automated Build Verification Commands

```bash
# 1. Typecheck the entire cross-platform codebase
cd frontend && npm run typecheck

# 2. Build the production Web bundle
cd frontend && npx expo export --platform web

# 3. Build the production Admin dashboard
cd ../admin && npm run build

# 4. Verify Root Monorepo Quality Guard
cd .. && npm run validate
```
