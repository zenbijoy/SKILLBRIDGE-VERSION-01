# SkillBridge Room Live & Voice Architecture Audit Report

**Date**: 2026-10-17  
**Branch**: `feature/room-live-sessions-redesign`  
**Scope**: Room Creation, Room Screen UI, Voice/Video Live Sessions, LiveKit Integration, Database Schema.

---

## Executive Summary

A comprehensive code-level and runtime audit was conducted across the backend (Node 22 + Express 5 + Socket.IO + Supabase Postgres + LiveKit Server SDK) and frontend (React Native / Expo 57 + `@livekit/react-native` + WebRTC). All 15 verified findings (V1–V10, U1–U5, C1–C5) were confirmed and reproduced. Additional critical flaws were discovered regarding LiveKit Cloud room lingering, mobile audio session routing, and migration folder reconciliation.

Failing reproduction test suites were authored and validated:
- Backend: `backend/src/services/room-live-repro.test.ts` (reproducing V5, V8, C2, C3).
- Frontend: `frontend/src/features/room/voice/useActiveRoomSession.repro.test.ts` (reproducing V2).

---

## 1. Voice & Video Calling (V1 — V10)

| ID | Issue Description | Status | Evidence in Code | Impact & Architectural Fix |
|---|---|---|---|---|
| **V1** | Disconnection on sheet minimize | **Confirmed** | `frontend/app/room/[id].tsx:593` (`onClose` calls `voiceSession.leaveVoiceSession()`) & `RoomVoiceSheet.tsx:55-61` (`VoiceAudioBridge` is mounted inside `<Modal>`). | Audio cuts off when user minimizes sheet to read chat/posts. **Fix**: Move connection to root `<LiveSessionHost />` in `_layout.tsx`. |
| **V2** | Premature active state & error swallowing | **Confirmed** | `useActiveRoomSession.ts:48-65` (`isVoiceActive=true` set before token fetch; empty `catch {}` swallows 503). | UI reports active voice while audio is never connected; no error recovery. **Fix**: Typed state machine (`idle` -> `requesting` -> `connecting` -> `connected` -> `ended/failed`). |
| **V3** | Fake voice participant roster | **Confirmed** | `RoomVoiceSheet.tsx:40-51` (queries `/rooms/:id/members`, slices first 30). `setParticipants` never called. | All room members appear in voice sheet even if absent. **Fix**: LiveKit `useParticipants` merged with profile metadata. |
| **V4** | Voice banner always visible with fake counts | **Confirmed** | `RoomVoiceBanner.tsx:23` (falls back to `memberCount`) & `[id].tsx:404` (rendered unconditionally). | Banner shows "50 people" when room is empty; members not notified when voice starts. **Fix**: Replace banner with unified dynamic **Live Strip**. |
| **V5** | Redis-only presence & 24h disconnect ghosting | **Confirmed** | `socket.ts:311-354` (`if (redis)` only, 24h TTL) & `socket.ts:162-179` (`disconnect` does not clear voice set). | If Redis is off, no voice events fire; disconnected users stay for 24h. **Fix**: Database-backed `room_open_sessions` + webhook reconciliation; Redis as optional cache. |
| **V6** | LiveKit webhook ignores voice sessions | **Confirmed** | `live.ts:89, 135` (`meta.sessionId` check and `skillbridge-session-` prefix check) vs `rooms.ts:3194-3207` (`skillbridge-voice-${roomId}`). | No DB joins/leaves recorded; `room_finished` never triggers for voice. **Fix**: Unify session metadata `{ kind: 'open'|'study', sessionId, roomId }`. |
| **V7** | Missing `registerGlobals()` | **Confirmed** | `grep -r "registerGlobals"` returns 0 results. | WebRTC APIs not registered at native startup on Android/iOS. **Fix**: Call `registerGlobals()` once in native-only entry imported in `_layout.tsx`. |
| **V8** | Regular members get 404; role check inconsistency | **Confirmed** | `live.ts:250` (only owner/teacher auto-creates; regular member receives 404). `live.ts:311` allows moderator as host, while `rooms.ts` does not. | Members cannot start open peer sessions. **Fix**: Implement Feature D (Open Sessions) with atomic RPC `start_open_session_atomic`. |
| **V9** | Uniform `canPublish=true` without permission model | **Confirmed** | `live.ts:313` & `rooms.ts:3213` grant all tracks to all participants. | No audio-only restriction, no host transfer, no distinction between open & study sessions. **Fix**: Strict track permissions (audio: mic only; video: camera/mic). |
| **V10** | Notifications capped at 50, zero for voice | **Confirmed** | `live.ts:273` (`.limit(50)` on `room_members`). | Most members never receive start notifications; voice has no notification dispatch. **Fix**: Paginated full-member notification dispatch with cooldown. |

---

## 2. Room Screen UI & UX (U1 — U5)

| ID | Issue Description | Status | Evidence in Code | Impact & Architectural Fix |
|---|---|---|---|---|
| **U1** | Header title is static string; duplicate buttons | **Confirmed** | `RoomOSHeader.tsx:116` (`{isEducator ? "Educator Dashboard" : "Learning Room"}`). Buttons duplicated in educator and learner bars. | Room title is hidden; confusion between educator and learner controls. **Fix**: Compact header with real room title and chips. |
| **U2** | Hard-coded attendance metric | **Confirmed** | `RoomOSHeader.tsx:50, 276` (`attendancePercent = 80`). | Fake mock data shown in production UI. **Fix**: Remove mock attendance; move real analytics into overflow/More tab. |
| **U3** | Header and banner vertical clutter | **Confirmed** | Header (140px) + Voice banner + Knock banner + Tab bar stack vertically. | Screen content area pushed down, leaving minimal space for posts/chat. **Fix**: One compact header + one Live Strip + clean tab bar. |
| **U4** | Banglish copy in preview card | **Confirmed** | `[id].tsx:335-355` ("Vit relevant preview", "Join korle full posts, chat, live class pabe"). | Unprofessional mixed-language copy. **Fix**: Move all strings to `src/i18n` with proper English and Bangla translations. |
| **U5** | Hard-coded theme-breaking colors | **Confirmed** | `RoomOSHeader.tsx:444-450` (`#FEF3C7`, `#92400E`, `#D97706`, `#0284C7`, `#059669`). | Broken visual contrast in Dark and OLED modes. **Fix**: Migrate all styles to theme tokens (`colors.surface`, `colors.primary`, etc.). |

---

## 3. Room Creation (C1 — C5)

| ID | Issue Description | Status | Evidence in Code | Impact & Architectural Fix |
|---|---|---|---|---|
| **C1** | Migration directory drift | **Confirmed** | `infra/supabase/migrations` (47 files) vs `supabase/migrations` (5 files). Columns `cover_image_url`, `is_teacher_mode` (041), `knock_mode_enabled` (046) absent in the latter. | Fresh setups missing room columns; room creation logs partial failure warnings. **Fix**: Establish `infra/supabase/migrations` as canonical; reconcile both directories. |
| **C2** | Non-atomic room creation & swallowed invitation errors | **Confirmed** | `rooms.ts:348-389` (RPC -> separate UPDATE -> fallback UPDATE) & `create.tsx:326-337` (client-side loop with empty catch). | Partial creation states; invitations fail silently while user sees "Space Created!". **Fix**: Create `create_room_full_atomic` RPC taking all metadata and invitees in one transaction. |
| **C3** | Inconsistent `knock_mode_enabled` default | **Confirmed** | DB default `false` (046), API schema default `true` (`rooms.ts:92`), `normalizeRoom` evaluates `null !== false` as `true`. | Unpredictable knock lobby behavior across rooms. **Fix**: Canonical API default (`true`); migrate existing `NULL` values to `true`. |
| **C4** | Discrepant capacity limits | **Confirmed** | `rooms.ts:86` uses `env.MAX_ROOM_CAPACITY`, RPC hard-codes `p_capacity > 250`, client hard-codes `250`. | Inability to adjust room capacity without breaking RPC or client validation. **Fix**: Make capacity limit server-authoritative; remove hardcoded 250 from RPC. |
| **C5** | Monolithic `create.tsx` with immutable rules | **Confirmed** | `create.tsx:110` (`const [rules] = useState("")` without setter); 1307 lines monolith; hardcoded "Cloudflare R2" copy. | Users cannot set room rules; false storage provider messages. **Fix**: Split `create.tsx` into clean section components and wire editable rules. |

---

## 4. Newly Discovered Findings (N1 — N5)

| ID | Issue Description | Severity | Impact & Fix |
|---|---|---|---|
| **N1** | Mobile Audio Session Routing | High | LiveKit native needs explicit `AudioSession.start()` and routing between earpiece/speakerphone/bluetooth. Missing audio routing leads to silent calls on native devices. |
| **N2** | LiveKit Cloud Room Lingering | Medium | Ending a session in DB did not call `RoomServiceClient.deleteRoom()`, causing rooms to remain active on LiveKit Cloud. **Fix**: Call `deleteRoom()` in end handlers and timeout workers. |
| **N3** | Missing Session Exclusivity Tables | High | No table existed to manage `room_open_sessions` or `room_study_permissions`, making atomic transition from open session to study session impossible. **Fix**: Add migration `048_room_live_sessions.sql`. |
| **N4** | Room Cache Invalidation Incompleteness | Medium | `cacheDelPattern("rooms:public:*")` did not invalidate active session flags or participant counts in room cards. **Fix**: Include live session state in room list cache tags and socket broadcasts. |
| **N5** | Platform-Specific LiveKit Imports | High | Web bundler errors when importing native-only LiveKit components. **Fix**: Strict `.native.tsx` and `.web.tsx` separation for the session engine. |

---

## 5. Phase 0 Sign-Off & Action Plan

With all findings verified and reproductions passing, the project proceeds to:
- **Phase 1**: Canonical migration `048_room_live_sessions.sql`, atomic RPCs, and reconciliation.
- **Phase 2**: Backend API `backend/src/routes/room-live.ts`, worker, and webhook reconciliation.
- **Phase 3**: Socket.IO events and paginated notifications with cooldown.
- **Phase 4**: Root-level `<LiveSessionHost />` in `_layout.tsx`, LiveKit store, and persistent audio.
- **Phase 5**: UI Redesign: compact header, dynamic Live Strip, and i18n copy.
- **Phase 6**: Atomic room creation, editable rules, and sectioned `create.tsx`.
- **Phase 7**: End-to-end test verification and manual matrix.
