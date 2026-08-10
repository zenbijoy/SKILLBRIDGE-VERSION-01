# Phase 2 Tasks

- [x] Phase 2 Baseline Audit
- [x] Implementation Plan Approval
- [x] Database Schema Migration (`008_phase_2_realtime.sql`)
- [x] Backend Socket & Push Service (Delegated to Subagent)
  - [x] Update `server.ts` for socket.io rooms
  - [x] Implement `PushService.ts`
  - [x] Update `chat.ts` for message idempotency
  - [x] Update `live.ts` for token mapping and role grants
- [x] Frontend Realtime & LiveKit UI (Delegated to Subagent)
  - [x] Create centralized `socket.ts`
  - [x] Update `app/chat/[id].tsx` (outbox, idempotency)
  - [x] Update `LiveRoomScreen.web.tsx`
  - [x] Update `LiveRoomScreen.native.tsx`
- [x] E2E Testing & Validation
- [x] Commit & Push
