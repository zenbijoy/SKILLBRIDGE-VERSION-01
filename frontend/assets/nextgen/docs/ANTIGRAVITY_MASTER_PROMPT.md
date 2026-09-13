# MASTER IMPLEMENTATION PROMPT FOR ANTIGRAVITY — SKILLBRIDGE NEXT‑GEN

You are working inside the existing repository `zenbijoy/SKILLBRIDGE-VERSION-01`. This is **not a greenfield rewrite**. Your job is to evolve the current working product into the Next-Gen architecture while preserving all existing working behavior, navigation, auth, RLS, tests, offline chat semantics, admin capabilities, and visual identity.

## Non-negotiable rules

1. **Inspect first. Do not code from this prompt blindly.** Read the current package manifests, route registry, frontend router, types, migrations, RLS policies, RPCs, storage service, Socket.IO gateway, LiveKit routes/webhooks, dashboard/feature flags, clubs, resources, chat, admin routes and current visual asset maps.
2. Before modifying anything, run and record baseline results for install/doctor/typecheck/lint/tests/build using the repo's existing scripts. Do not hide pre-existing failures.
3. Do not mass-rewrite files that are already working. Prefer additive modules, small refactors, and adapter interfaces.
4. Keep strict TypeScript. Do not introduce `any` unless an existing external type forces it and the usage is isolated/commented.
5. Every database change must be a new migration. Never edit old applied migrations.
6. Every new table must have indexes, RLS/policy decisions, ownership/audience rules, timestamps and cleanup/retention logic where needed.
7. Every new API route must have Zod validation, authorization, consistent errors, OpenAPI coverage, tests and observability.
8. Preserve server-authoritative sensitive mutations. Do not expose Supabase service-role credentials or R2 secrets to clients.
9. Do not add a paid dependency/service when the current stack can do the job. Do not claim that any free tier is unlimited or production-grade.
10. Do not implement YouTube uploads with an API key. Uploading must use OAuth. Provider refresh tokens must be encrypted at rest.
11. Do not manually compress normal post text with Brotli/Zstd in PostgreSQL. Keep searchable/moderatable text as `text`.
12. Do not model social reactions as one global bitmask. Keep per-user reaction rows with a compact reaction code and aggregate counters.
13. Never shared-cache private/personalized authenticated responses at Cloudflare.
14. Respect the existing `reduceMotion` preference and Light/Dark/OLED themes.
15. Keep the current official brand palette and components. This is a **visual enrichment**, not a wholesale redesign.

---

# A. FIRST: CURRENT-STATE AUDIT

Produce `docs/NEXTGEN_CURRENT_STATE_AUDIT.md` before implementation. It must contain:

- current exact package versions and runtime versions,
- route/module inventory,
- current database tables/RPCs/policies relevant to rooms/chat/resources/clubs/events/dashboard/notifications,
- current Socket.IO lifecycle and events,
- current LiveKit token/webhook flow,
- current storage buckets and signed-upload/download flow,
- current dashboard feature-flag/config system,
- current club roles and event/broadcast flow,
- current admin abilities,
- existing visual asset inventory,
- tests that protect these areas,
- pre-existing bugs/risks.

Explicitly verify these known areas:

- club broadcast currently has a hardcoded fallback YouTube video ID — remove it safely and render an empty media state instead;
- chat has a legacy Base64 upload path that writes to the avatars bucket — deprecate it and standardize private chat attachments on signed upload tickets;
- frontend currently opens a global Socket.IO connection after auth — measure and prepare a lazy connection strategy;
- current docs contain older platform version text — update documentation to match package manifests;
- review the custom Express `/socket.io` bypass middleware with a regression test before changing it;
- global IP rate limiting may unfairly throttle users behind university NAT — design authenticated-user + IP endpoint budgets.

Do not proceed to destructive migrations until this audit is complete.

---

# B. FEATURE FLAGS

Use the existing feature-flag system. Add flags (names can be adjusted to project conventions after inspection):

- `room_modular_dashboard_v2`
- `room_qna_v1`
- `room_recordings_v1`
- `materials_hub_v2`
- `r2_storage_v1`
- `campus_feed_v1`
- `anonymous_posts_v1`
- `club_os_v2`
- `schedule_clash_engine_v1`
- `schedule_negotiation_v1`
- `edge_public_cache_v1`
- `lazy_socket_v1`
- `youtube_connected_archive_v1`
- `youtube_auto_recording_v1`

Default high-risk infrastructure flags to OFF in production until tested.

---

# C. VISUAL ASSET PACK INTEGRATION

A separate source pack is provided: `skillbridge-nextgen-visual-assets-v1.zip`.

The current project already has `spotIllustrations`, `onboardingIllustrations`, and `growthIllustrations`. Do NOT duplicate or delete those automatically.

## Integration procedure

1. Inspect current asset usage and identify only missing visual states.
2. Copy selected PNG/GIF assets to `frontend/assets/nextgen/`.
3. Create `frontend/src/assets/nextgen.ts` with typed static `require()` mappings.
4. Use PNG for native compatibility by default. SVG source remains design/source material, not necessarily runtime assets.
5. Use GIF only for short moments: global loader, LIVE beacon, typing indicator, success feedback. Do not use looping GIFs in feeds/lists.
6. Prefer existing Reanimated for repeated UI motion.
7. When `reduceMotion` is true, render static artwork and disable nonessential transitions.
8. Keep large illustrations lazy/below-fold and avoid adding them to every card.
9. Ensure all meaningful images have accessibility labels; purely decorative backgrounds should be hidden from accessibility.
10. Build a simple dev-only Asset Gallery screen behind a debug flag so designers can visually inspect all integrated assets in Light/Dark/OLED.

## Motion rules

- press feedback: 100–160 ms
- card enter: 180–260 ms
- sheet/modal: 220–320 ms
- ambient hero float: 2.8–4.0 s, subtle
- success burst: <=1.5 s
- no more than one major looping animation in a viewport

---

# D. ROOM MODULAR DASHBOARD V2

Do not create a second room entity. Upgrade the existing `app/room/[id]` flow.

The room landing should expose five cards:

1. General Chat
2. Live Session
3. Q&A Board
4. Materials Hub
5. Recordings

Each card shows a useful status/count, e.g. unread chat, live/upcoming, open question count, new resources, latest recording.

Reuse current routes initially:

- General Chat → current conversation route
- Live Session → current LiveKit route
- Materials → current resources domain upgraded incrementally

Add new typed routes for Q&A and Recordings.

Do not make a user leave the room context just to see basic status; room header and membership state should remain stable.

### Q&A data model

Create normalized tables similar to:

- `room_questions`
- `room_question_votes`
- `room_answers`

Requirements:

- unique vote per user/question,
- accepted answer,
- statuses `open`, `answered`, `resolved`, `locked`,
- mentor/teacher visual marker derived from room role, not client input,
- edit/delete policy,
- report/moderation hooks,
- optional anonymous question support through the same secure pseudonym subsystem used by the feed,
- cursor pagination,
- room-scoped realtime updates only if they materially improve UX.

### Live-session chat

Keep General Chat persistent. For transient live-room chat/reactions/presence, first evaluate LiveKit data packets because every participant is already connected to LiveKit. Persist only data that needs durable history/moderation. Avoid opening a second unnecessary realtime channel for the same live participant.

---

# E. MATERIALS HUB V2

Upgrade the current resource model; do not break existing URLs.

Add:

- categories: syllabus, slides, handnote, assignment, past_exam, lab, code, link, other
- tags
- file metadata (mime, bytes, extension)
- provider/media-object reference
- visibility
- versioning / superseded_by
- optional pinned/recommended state
- uploader role badge

Features:

- filter/search/sort,
- preview metadata,
- safe signed download,
- copy/share link only when visibility permits,
- per-room upload limits,
- admin/teacher delete and audit trail.

---

# F. STORAGE PROVIDER ABSTRACTION + R2

The current system uses Supabase Storage. Do not flip everything to R2 in one commit.

Create a provider interface in backend services:

- create upload ticket
- create download URL
- head metadata
- delete object

Implement adapters:

- current Supabase provider
- R2 provider

Add a `media_objects` table with provider/bucket/object_key/owner/scope/mime/size/status/checksum metadata.

## Direct-upload protocol

1. authenticated client requests ticket with scope + expected MIME + bytes;
2. backend validates membership/permission/quota;
3. backend generates object key — client may never choose an unrestricted key;
4. client uploads directly;
5. client calls commit;
6. backend HEADs the object and validates expected size/content metadata;
7. database object becomes `ready` and can be attached to a domain row.

Never relay normal files through Render.

## R2 buckets

Use logical names:

- public media: avatars, club headers, event posters, public post media
- private academic: room docs, private attachments, voice notes

Do not embed “R2 account #1/#2” into domain tables. Deployment credentials may point these providers to one or multiple legitimate accounts, but the app logic must not depend on quota multiplication.

---

# G. CAMPUS SOCIAL FEED

Build this as a new domain; do not overload `user_activity_events`.

Suggested tables:

- `posts`
- `post_media`
- `post_reactions`
- `post_comments`
- `comment_reactions`
- `post_reports`
- restricted `anonymous_author_map`

### Required design

- post/comment content remains PostgreSQL `text`;
- media is object storage only;
- reaction type is compact enum/smallint but one row per user + target;
- aggregate counts are transactionally maintained;
- keyset/cursor pagination (`created_at`, `id`), not deep OFFSET;
- visibility: university_public, club_members, room_members, connections/other scopes only if product needs them;
- verified club posts can be highlighted;
- report/block/moderation integrated with existing moderation system;
- optimistic UI with rollback;
- avoid N+1 profile/media queries;
- anonymous UI never receives the real author identity.

### Anonymous identity

Implement explicit anonymity scope. Do not use a random daily-only identity unless product chooses that behavior.

Generate a public pseudonym with backend HMAC using user + scope + stable secret. Store true-author mapping only in a restricted/service-level table or schema. Moderator reveal must be permission-gated and create an audit log with actor, reason, target and timestamp.

### Feed cache

Never cache an Authorization-bearing personalized feed under a shared key.

Split if useful:

- cache audience-safe public/campus base post page,
- load user overlay (`myReaction`, saved state, personalized hide state) separately.

Add versioned cache keys and stale-while-revalidate only after correctness tests.

---

# H. CLUB OS V2

Preserve current clubs and member rows, then extend role capability.

Authorization roles:

- owner
- admin
- executive
- contributor
- member
- optional advisor/alumni

Display titles (President, General Secretary, etc.) must be separate from authorization capability.

Features:

- verified member workflows
- internal team/subcommittee support
- draft/publish event workflow
- tasks/volunteer assignment only if schema can be kept bounded
- internal and campus-wide announcements
- member analytics
- event registrations
- resource hub integration
- session/broadcast integration

Public club announcements should project into the existing dashboard announcement system and, when campus feed is enabled, into a trusted feed post. Do not build two unrelated announcement systems.

---

# I. SCHEDULE CLASH ENGINE

When an admin proposes or edits an event, check candidates that overlap in time.

Conflict classes:

1. mutual club/member overlap
2. registered-attendee overlap
3. venue/room collision
4. optional academic timetable/exam collision

Use both absolute and relative overlap, not a fixed 50-person threshold.

Example configurable severity policy:

- warning when overlap >=10 and at least one relevant club loses >=25%
- high when overlap >=30 or >=50% of a club
- critical for exact venue collision or exam block

Do not expose the names of all overlapping users to another club admin unless privacy policy permits it. Show aggregate counts by default; a user-level list is only for authorized internal planning.

### SQL/performance

- filter time-overlapping events first;
- index `(club_id, user_id)` and reverse member lookup;
- index event schedule;
- if beneficial use `tstzrange` + GiST;
- final publish must re-check conflicts inside database transaction;
- Redis may cache display results but cannot be source of truth.

---

# J. NEGOTIATION ENGINE

Use a proper state machine:

`open -> countered -> accepted`\n`open/countered -> rejected | expired | cancelled`

Proposal must carry explicit changes:

- event(s)
- start/end
- venue if changed
- initiator/target clubs
- initiator/target authorized admins
- version/optimistic lock
- expiry

Acceptance transaction:

1. lock event and negotiation rows;
2. ensure proposal not stale;
3. re-run clash validation;
4. update only explicitly agreed event(s);
5. write audit log;
6. create notification-outbox rows;
7. invalidate relevant caches;
8. commit.

Never automatically alter an unrelated club event based on a vague approval.

---

# K. REALTIME + RENDER FREE-TIER OPTIMIZATION

Do not promise zero crash. Measure.

## Lazy Socket.IO

Current app opens one socket after login. Under `lazy_socket_v1`:

- background state: no persistent Socket.IO solely for presence;
- active chat: connect/join only required conversation rooms;
- active 1:1 call signaling: connect as required;
- disconnect after an idle grace period when chat/call is left;
- Expo Push handles background/incoming notifications;
- preserve idempotent HTTP message submission and offline outbox.

Add metrics for socket count, reconnects, events/sec and memory.

## LiveKit

- media remains in LiveKit;
- transient live-room data should prefer LiveKit data packets where appropriate;
- enforce role-based publisher grants already used by the backend;
- session mode: `interactive | broadcast | hybrid`;
- large watch-only audiences must not be represented as 1,000 interactive LiveKit participants on a free project.

## Rate limiting

Keep coarse IP defense but add authenticated per-user limits after auth for mutations. A campus NAT must not allow one heavy user to throttle everyone sharing the IP.

## Redis

Keep `REDIS_REQUIRED=false` behavior. Cache failure must degrade performance, not correctness.

---

# L. CLOUDFLARE WORKER EDGE SHIELD

Add only after APIs are stable.

The Worker may cache/sanitize public reads. It must **bypass shared cache** when:

- Authorization is present and the response is personalized/private;
- route is chat, notification, admin, private material, profile-me, personalized recommendations or mutation;
- cookie/session/audience can change data.

Potential cacheable routes (after response audit):

- public club directory
- public event directory
- sanitized public room discovery
- public campus-feed base pages

Cache key must include campus/university, cursor/page, locale/version and any safe audience segmentation.

Never put Supabase service-role or R2 secret credentials in browser-visible code.

---

# M. YOUTUBE CONNECTED ARCHIVE

### Phase 1: manual verified link

A host/admin can attach a YouTube URL/video ID to a completed session. Backend validates provider URL/ID and stores a `room_recordings` row.

### Phase 2: OAuth connection

- Google OAuth, YouTube upload scopes only as needed;
- encrypted refresh token storage;
- connection status/revoke UI;
- server-side token refresh;
- do not accept an API key as a channel upload credential.

### Phase 3: optional automation

Preferred zero-server-disk path to investigate:

LiveKit Egress -> YouTube Live RTMP -> YouTube archive reconciliation.

Alternative:

LiveKit Egress -> temporary R2 object -> asynchronous resumable YouTube upload -> verify -> delete temporary object.

Never upload GB-size video inside a normal Render request.

Make automation a feature flag because LiveKit Egress and YouTube quotas/verification can stop requests.

Unlisted recording is not strict access control. Show an explicit privacy warning to owners.

---

# N. ADMIN CONTROL PLANE

Extend the existing admin app, do not build a second admin.

Add pages/components for:

- storage/provider health
- media object quarantine/failures
- campus feed moderation queue
- anonymous identity reveal action with mandatory reason + audit trail
- club verification/role escalation review
- clash thresholds/policy
- active negotiations
- recording/provider job health
- feature flags / rollout
- provider usage/quota warnings

All destructive/admin actions need confirmation, audit event, and permission checks.

---

# O. ASYNC OUTBOX / DOMAIN EVENTS

For changes that require push notifications, cache invalidation or external-provider work, use a durable database outbox rather than depending on one synchronous request to finish every side effect.

Suggested event types:

- `ROOM_QUESTION_ANSWERED`
- `RESOURCE_READY`
- `POST_PUBLISHED`
- `POST_REPORTED`
- `CLUB_ANNOUNCEMENT_PUBLISHED`
- `EVENT_CONFLICT_DETECTED`
- `NEGOTIATION_OPENED`
- `NEGOTIATION_ACCEPTED`
- `RECORDING_PROVIDER_SYNC`

Processing must be idempotent with retry count/backoff and dead-letter visibility in admin.

Do not turn Redis into the durable outbox.

---

# P. TESTING REQUIREMENTS

For every phase add unit/integration/security tests.

Mandatory cases:

- room Q&A RLS/authorization
- duplicate vote prevention
- accepted answer authorization
- upload ticket path/object-key tampering
- upload size/type commit validation
- private media signed URL authorization
- anonymous feed author never leaks through API serializer
- moderator reveal is audited
- duplicate reaction prevention/change reaction transaction
- cursor pagination stability while new posts arrive
- club role escalation permission
- clash engine with small-club high-percentage overlap
- venue collision
- negotiation stale-version race
- two admins accepting/countering concurrently
- cache bypass on Authorization/private routes
- edge cache key campus segregation
- socket lazy connect/disconnect/reconnect/outbox delivery
- Redis unavailable fallback
- LiveKit provider unavailable behavior
- YouTube token revoked / quota failure / private upload state

---

# Q. PERFORMANCE / LOAD TEST

Create a reproducible load-test folder and report. Do not fake results.

Scenarios:

1. public cached discovery burst
2. authenticated dashboard warm-cache
3. room detail reads
4. 100 concurrent chat senders with bounded message rate
5. 1,000 signed-in simulated clients doing read-heavy flows
6. feed keyset pagination on a seeded 100k-post dataset
7. clash queries across synthetic multi-club memberships
8. Redis outage
9. cold Render instance separately from warm instance

Track:

- p50/p95/p99
- requests/sec
- error percentage
- memory high-water mark
- event-loop lag if available
- DB query latency
- Redis hit rate
- active sockets

Do not write “supports 1,000 concurrent users” unless the documented scenario actually passed and the exact workload is stated.

---

# R. IMPLEMENTATION PHASES & GATES

## Phase 0 — Baseline / cleanup

Deliverables:

- current-state audit
- bug/risk fixes listed above
- docs version update
- feature flags
- baseline test report

Gate: no regression, CI green.

## Phase 1 — Visual integration + modular room shell

Deliverables:

- typed Next-Gen asset map
- debug asset gallery
- five room cards routed to existing/new modules
- responsive Light/Dark/OLED visual QA

Gate: zero broken existing room action.

## Phase 2 — Q&A / Materials / Recording metadata

Deliverables:

- migrations/RLS/RPCs
- API/OpenAPI/tests
- screens and realtime behavior

Gate: full room module usability without YouTube automation.

## Phase 3 — Storage abstraction / R2

Deliverables:

- provider interface
- media_objects
- signed direct upload/commit
- backward-compatible Supabase + R2 reads

Gate: normal files do not traverse Render.

## Phase 4 — Campus Feed

Deliverables:

- feed domain
- anonymous subsystem
- moderation
- cursor pagination
- 100k synthetic dataset performance report

Gate: no identity leak / no deep-offset dependence.

## Phase 5 — Club OS / Clash / Negotiation

Deliverables:

- extended roles/capabilities
- announcement projection
- conflict engine
- negotiation transaction state machine
- audit + push

Gate: race/concurrency tests pass.

## Phase 6 — Realtime / edge optimization

Deliverables:

- lazy sockets
- LiveKit data where appropriate
- edge-safe public cache
- user-aware rate limits
- load-test report

Gate: measurable improvement without correctness regression.

## Phase 7 — YouTube connected provider

Deliverables:

- OAuth
- encrypted provider connection
- manual archive
- optional automation feature-flagged

Gate: revoke/failure/quota/privacy cases pass.

## Phase 8 — rollout

Use existing deterministic feature-flag rollout: 5% -> 20% -> 50% -> 100%, pausing on Sentry/error/p95/memory/provider-quota regressions.

---

# S. DEFINITION OF DONE FOR EVERY CHANGESET

Before saying a phase is complete:

- `typecheck` passes
- `lint` passes
- applicable tests pass
- production build passes
- migration applies from a clean DB and from current schema
- no secrets in git
- OpenAPI/types updated
- docs updated
- Light/Dark/OLED checked
- reduced motion checked
- Android + Web checked; iOS if environment supports it
- loading/empty/error/offline states exist
- retry/idempotency considered
- permission/RLS test added
- metrics/logging added where appropriate
- no paid/unbounded provider assumption hidden in the feature

If a requested architecture assumption conflicts with the current repo, **do not force it**. Document the conflict, preserve working behavior, and implement the safer compatible design.
