# SkillBridge Next-Gen — Phase 4 Media Architecture Audit

**Audit Date:** 2026-09-13T23:40:00Z  
**Phase:** Next-Gen Phase 4 (YouTube OAuth + Recording Automation + Rich Media Pipeline + Media Metadata Sync + Failure Recovery)  
**Evaluator:** Antigravity Autonomous Pair Programmer  

---

## 1. Executive Summary

This comprehensive audit inspects the current concrete codebase across `backend`, `frontend`, `admin`, `infra`, and deployment configurations (`render.yaml`) to establish the ground truth for media handling before implementing Phase 4.

SkillBridge currently possesses a rock-solid manual YouTube recording flow, a resilient SigV4 Cloudflare R2 / Supabase Storage provider abstraction, and an indexed `media_objects` table. However, it lacks OAuth channel linking, automated metadata synchronization, background job queueing, rich feed media attachments, and failure recovery state machines.

---

## 2. Classification of Current Media Flows

| Media Flow / Subsystem | Location | Current State | Detailed Technical Assessment |
|---|---|---|---|
| **Manual Room Recordings** | `backend/src/routes/rooms.ts:782`<br>`frontend/src/features/room/RoomRecordings.tsx` | **MANUAL ONLY** | Host pastes YouTube URL. Backend regex extracts 11-char video ID, detects duplicates in room, generates static `https://img.youtube.com/vi/${id}/hqdefault.jpg`. No automated title/duration metadata fetch from YouTube Data API; requires host to manually type title. |
| **Recording Status & Lifecycle** | `infra/supabase/migrations/028_nextgen_foundations.sql:50`<br>`backend/src/routes/rooms.ts` | **PARTIAL** | Table `public.room_recordings` has no `status` column (assumed always ready once inserted). No support for `processing`, `failed`, `unavailable`, or `deleted` states. |
| **YouTube OAuth Channel Connection** | N/A | **MISSING** | No Google/YouTube OAuth endpoints exist for linking a teacher's YouTube channel. No encrypted token storage exists. |
| **OAuth Token Storage & Encryption** | N/A | **MISSING** | No database table exists for storing OAuth refresh/access tokens. `createCipheriv` / AES-256-GCM encryption is absent from `backend/src/lib/`. |
| **YouTube Data API Metadata Sync** | N/A | **MISSING** | No service exists to query Google YouTube v3 API for video duration, canonical title, high-res thumbnails, or privacy state. |
| **Object Storage Provider (R2 / Supabase)** | `backend/src/services/storage.ts` | **FULLY WORKING** | Hardened AWS SigV4 presigner for Cloudflare R2 with zero npm dependencies; transparent fallback to Supabase Storage; media registry helper functions (`registerMediaObject`, `finalizeMediaObject`). |
| **Direct Upload Tickets** | `backend/src/routes/resources.ts:19` | **FULLY WORKING** | Generates presigned PUT ticket for direct client-to-storage upload, bypassing Express/Render binary proxying. Registers pending entry in `media_objects`. |
| **Campus Feed Media Attachments** | `backend/src/routes/feed.ts:98`<br>`frontend/app/feed.tsx:30` | **PARTIAL** | `campus_posts` schema has `media_urls TEXT[]`, but frontend composer only inputs text (`body`) and boolean (`is_anonymous`). No client-side upload ticket flow or attachment picker exists for feed posts. |
| **Post Attachment Media Table** | N/A | **MISSING** | No relational `campus_post_media` table exists with foreign keys to `media_objects` or structured media types (images, YouTube embeds, documents). |
| **LiveKit Classroom Sessions** | `backend/src/routes/live.ts`<br>`frontend/app/room/[id].tsx` | **FULLY WORKING** | LiveKit WebRTC token generation, classroom presence, room layout, and Data Packet protocol (Q&A, chat, reactions) are fully wired. |
| **LiveKit Egress / RTMP Recording** | N/A | **PROVIDER-CONFIG REQUIRED** | LiveKit server is active for WebRTC, but Egress service (Docker container / LiveKit Cloud Egress) is not provisioned or configured in `render.yaml`. Egress costs money and requires dedicated compute. Must remain behind a feature flag (`livekit_recording_automation: false`). |
| **Background Job Processing** | N/A | **MISSING** | No queue or worker table (`background_jobs`) exists. All operations currently execute synchronously in HTTP request cycles or un-awaited async promises. |
| **Retry & Failure Recovery** | N/A | **MISSING** | No exponential backoff queue exists for failed API requests, quota exhaustion (429), or transient 5xx origin network drops. |
| **Admin Media Observability** | `admin/src/pages/NextGenOperations.tsx` | **PARTIAL** | Shows storage provider status (`R2` vs `Supabase`), but has no visibility into YouTube channel connections, recording sync states, failed background jobs, or orphan media objects. |
| **Orphan Media Cleanup** | N/A | **MISSING** | Upload tickets that are abandoned (client never finishes upload) remain in `media_objects` with status `pending_upload` indefinitely. No automated pruning exists. |
| **YouTube Quota Tracking** | N/A | **MISSING** | No caching layer or request minimization strategy for YouTube API calls. |

---

## 3. High-Risk Findings & Architectural Vulnerabilities

1. **Token Storage Vulnerability**:
   - Storing OAuth tokens in plaintext in PostgreSQL is a severe security risk. Tokens must be encrypted using AES-256-GCM with an initialization vector (IV), authenticated tag, and a 32-byte secret key (`OAUTH_TOKEN_ENCRYPTION_KEY`).
   - Logging tokens or credentials to Pino or Sentry must be prohibited by extending `REDACTED_KEYS` in `backend/src/lib/logger.ts`.

2. **Render Free Tier Worker Constraints**:
   - `render.yaml` declares a single web service on the `free` tier.
   - An infinite polling loop (e.g. `setInterval` every 5 seconds) will exhaust resources and prevent process sleep. Background job execution must be lightweight, opportunistic, batch-limited, and safe for free-tier memory and CPU boundaries.

3. **Render Memory & Express Upload Safety**:
   - Large video or image uploads must NEVER pass through the Node.js Express server. Direct presigned uploads via Cloudflare R2 / Supabase Storage must be strictly enforced.

4. **SSRF Risks in Media Embedding**:
   - Arbitrary URLs passed by users must be validated against strict whitelists (e.g. `youtube.com`, `youtu.be`). The server must never issue outbound HTTP requests to user-controlled URLs.

---

## 4. Required Next-Gen Phase 4 Roadmap

1. **Database Migration `031_nextgen_media_automation.sql`**:
   - Create `public.youtube_connections` table (encrypted tokens, channel metadata).
   - Harden `public.room_recordings` with `source_type`, `status`, `youtube_channel_id`, `published_at`, `provider_metadata`, `sync_error`.
   - Create `public.campus_post_media` table for typed feed attachments.
   - Create `public.background_jobs` table for lightweight, resilient job execution.
2. **Backend Encryption Module (`backend/src/lib/encryption.ts`)**:
   - AES-256-GCM cipher/decipher utility with IV and auth tag.
3. **Google & YouTube OAuth Integration (`backend/src/routes/integrations.ts`)**:
   - CSRF-protected state with expiration.
   - Channel metadata retrieval (`id`, `title`, `thumbnail`).
   - Disconnect and token revocation.
4. **YouTube Metadata & Quota Service (`backend/src/services/youtubeService.ts`)**:
   - Public/OAuth video info fetcher with ISO-8601 duration parser and resilient fallback.
5. **Background Job Queue Service (`backend/src/services/jobQueue.ts`)**:
   - Idempotent enqueue, retry with exponential backoff, dead-letter state.
6. **LiveKit Egress Recording Abstraction (`backend/src/services/recordingProvider.ts`)**:
   - Interface supporting `ManualYouTubeProvider`, `YouTubeOAuthProvider`, and `LiveKitEgressProvider` (behind feature flag `livekit_recording_automation: false`).
7. **Feed Rich Media Upload Pipeline (`backend/src/routes/feed.ts` & `frontend/app/feed.tsx`)**:
   - Presigned upload ticket -> attachment creation -> render in multi-image grid and YouTube preview cards.
8. **Admin Media Cockpit (`admin/src/pages/NextGenOperations.tsx`)**:
   - YouTube connections list, recording status manager, failed jobs retry panel, and orphan media cleanup trigger.
9. **Frontend Integrations & Recordings Upgrade**:
   - `frontend/app/settings/integrations.tsx`: YouTube channel connection UI.
   - `frontend/src/features/room/RoomRecordings.tsx`: Status badges, metadata sync, search & filter, single active player management.
