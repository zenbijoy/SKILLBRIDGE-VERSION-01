# Phase 2 Baseline Audit

## Socket.IO
- Backend: Configured in `server.ts` with basic auth via `io.use` and token validation. Responds to `conversation:join` events.
- Frontend: Instantiated directly inside `app/chat/[id].tsx` lazily upon mounting the chat screen. Disconnects on unmount. No centralized socket manager exists. No reconnection logic beyond `socket.io-client` defaults.

## Chat Routes
- Located in `backend/src/routes/chat.ts`.
- `GET /conversations` fetches recent conversations with unread counts.
- `GET /conversations/:id/messages` fetches message history (50 limit pagination).
- `POST /conversations/:id/messages` inserts message and emits `message:new` over Socket.IO.
- Missing reliable send semantics (no `client_message_id`). No typing indicators or advanced read receipt cursors on backend (only `last_read_at`).

## Notifications
- Backend (`backend/src/routes/notifications.ts`) allows fetching paginated notifications, and saving push tokens into a `device_tokens` table. 
- Frontend (`src/lib/notifications.native.ts` and `.web.ts`) has basic `expo-notifications` setup for iOS/Android which gets the Expo Push Token and POSTs it to the backend.
- No push sending service actually exists on the backend yet.

## LiveKit
- Token endpoint `POST /live/token/:roomId` in `backend/src/routes/live.ts` uses LiveKit SDK to generate tokens granting `roomJoin`. Room name mapped as `skillbridge-${roomId}`.
- Web UI is currently a stub `LiveRoomScreen.web.tsx` created in Phase 1.3.1.
- Native UI `LiveRoomScreen.native.tsx` uses `@livekit/react-native` with basic VideoTrack grids and local media toggles. Doesn't support screen sharing on web or detailed moderation.

## Messages Table
- Existing schema contains `conversation_id`, `sender_id`, `body`, `edited_at`, `created_at`.
- Missing `client_message_id` for idempotency and `reply_to_message_id` for references. Needs DB migrations.
