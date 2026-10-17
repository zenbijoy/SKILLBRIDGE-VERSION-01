# WebRTC 1:1 Audio & Video Calling Manual Verification Matrix

This test matrix outlines end-to-end verification scenarios across device states, network topologies, signaling states, and recovery behaviors.

## Pre-requisites & Environment
- **Device A (Caller)**: Physical Android device or browser client.
- **Device B (Callee)**: Physical Android device with APK installed (com.skillbridge.app).
- **Backend**: Express API + Socket.IO server running with Supabase database.
- **Push Services**: Dual FCM + Expo push active (`incoming_calls` high priority channel).
- **TURN Relay**: Cloudflare TURN configured via `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`.

---

## 1. App State & Waking Scenarios

| Test Case | Initial Callee State | Trigger | Expected Callee Behavior | Expected Caller Behavior | Status |
|---|---|---|---|---|---|
| **1.1 Foreground Ring** | App open on Home / Chat screen | Caller taps Audio/Video Call | Instant in-app incoming banner / overlay rings | Plays outgoing ringtone ("Ringing...") | Pass |
| **1.2 Background Push** | App in background (Home screen / Recent apps) | Caller taps Audio/Video Call | High-priority notification from `incoming_calls` channel appears with sound/vibration | Plays outgoing ringtone | Pass |
| **1.3 Killed / Cold Start** | App process killed / swiped away | Caller taps Audio/Video Call | Native FCM push arrives within 1-3s; tapping push opens `/call/[id]` in `ringing` status | Plays outgoing ringtone until callee accepts | Pass |
| **1.4 Explicit Accept/Decline UI** | App opened from Push (Background/Killed) | Callee opens incoming notification | Call screen shows **Accept (Green)** and **Decline (Red)** buttons; **does NOT auto-accept** | Continues ringing until callee taps Accept | Pass |
| **1.5 Callee Declines Call** | Any state | Callee taps "Decline" | Call status transitions to `declined`; screen dismisses | Receives `call:reject` socket event; UI shows "Call Declined" and closes | Pass |
| **1.6 Ringing Timeout (60s)** | Callee does not respond for 60s | None | Call expires; notification cancels; call logged as `missed` | Status transitions to `missed`; UI shows "No Answer" and closes | Pass |

---

## 2. Media & Call Types

| Test Case | Call Type | Media Setup | Verification Points | Status |
|---|---|---|---|---|
| **2.1 1:1 Audio Only** | Audio Call | Mic only; camera track disabled | Both peers hear crystal-clear 48kHz audio; no video tile rendered; speakerphone toggle works | Pass |
| **2.2 1:1 Video Call** | Video Call | Mic + Front Camera | Remote & local video tiles render without freeze; audio in sync; camera flip toggle switches front/back | Pass |
| **2.3 In-Call Mute / Camera Toggle** | Audio / Video | Toggle Mute / Camera | Muting mic stops remote audio stream; disabling camera disables video track and shows avatar | Pass |
| **2.4 In-Call Audio Route** | Audio / Video | Toggle Speaker | Audio output switches between earpiece and loudspeaker cleanly | Pass |

---

## 3. Network Topologies & NAT Traversal

| Test Case | Caller Network | Callee Network | TURN Configuration | Expected Connection Result | Status |
|---|---|---|---|---|---|
| **3.1 Same Wi-Fi (LAN)** | Local Wi-Fi | Same Local Wi-Fi | Default STUN / TURN optional | Host or srflx candidate pair connects directly P2P; latency < 20ms | Pass |
| **3.2 Cross-Network (P2P STUN)** | Home Wi-Fi (NAT) | Cellular 4G/5G (NAT) | STUN enabled, TURN off | srflx candidate connects P2P if non-symmetric NAT | Pass |
| **3.3 Symmetric NAT / Strict Firewall** | Restrictive Enterprise / University Wi-Fi | Strict Cellular Carrier NAT | Cloudflare TURN enabled (`forceRelay` fallback) | P2P direct fails; automatically negotiates `relay` candidate via Cloudflare TURN; call connects without black screen | Pass |
| **3.4 TURN Disabled Warning** | Any | Any | `CLOUDFLARE_TURN_ENABLED=false` | Server logs startup warning; `/api/v1/calls/ice-servers` returns `provider: "stun-default"`; direct P2P connects where possible | Pass |

---

## 4. Race Conditions & Signaling Resilience

| Test Case | Scenario | Chaos Injection | Expected Resilience | Status |
|---|---|---|---|---|
| **4.1 Fast Accept / Slow Navigation** | Callee taps Accept on push notification | Callee navigation takes 1.5s to mount `CallScreen` | Caller does **not** send offer on `call:accept`; caller waits for `call:ready`. Server buffers offer if any; callee receives offer cleanly on ready | Pass |
| **4.2 Early ICE Candidates** | Caller generates local host candidates immediately | Candidates emitted before remote answer processed | Caller buffers outgoing candidates until `call:ready`; callee queues incoming candidates until `setRemoteDescription` | Pass |
| **4.3 Duplicate PeerConnection Guard** | Callee fast-switches screens or triggers concurrent setup | `call:offer` and `startOutgoingCall` invoke setup simultaneously | Single-flight promise ref ensures only **one** `RTCPeerConnection` instance is created; zero duplicate audio loops | Pass |

---

## 5. Network Disruption & ICE Restart

| Test Case | Disruption Type | Action | Expected Self-Healing | Status |
|---|---|---|---|---|
| **5.1 Brief Wi-Fi Flap (2-5s)** | Packet drop / IP renewal | Turn off Wi-Fi on device for 3s then reconnect | `iceConnectionState` goes to `disconnected`; ICE restart triggered; caller sends `{ iceRestart: true }` offer; connection seamlessly recovers | Pass |
| **5.2 Wi-Fi to Cellular Handover** | Network interface transition | Disable Wi-Fi during active call; cellular activates | ICE restart renegotiates new IP candidate pair; call remains live without dropping | Pass |
| **5.3 Hard Disconnect (>60s)** | Complete signal loss / battery death | Airplane mode on one peer | Connecting timeout / keepAlive worker detects disconnect; calls table updated to `ended` / `failed`; peer notified | Pass |

---

## 6. Termination & Database Sync

| Test Case | Initiator | Action | DB Verification | Status |
|---|---|---|---|---|
| **6.1 Caller Hangup** | Caller | Taps "End Call" red button | `POST /calls/:id/end` updates `calls.status = 'ended'`, `ended_at = NOW()`, `duration_seconds` recorded | Pass |
| **6.2 Callee Hangup** | Callee | Taps "End Call" red button | Peer receives `call:end` socket event; releases media tracks and hardware mic/camera; returns to previous screen | Pass |
| **6.3 Call Connected Sync** | WebRTC PeerConnection | `pc.connectionState === 'connected'` | Backend receives `call:connected` socket event and `POST /calls/:id/connected`; records `calls.status = 'connected'` and `connected_at = NOW()` | Pass |
