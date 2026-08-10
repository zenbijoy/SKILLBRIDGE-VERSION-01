> **Windows hotfix 2.0.1:** run `SETUP_WINDOWS.cmd` first. See `HOTFIX_2.0.1.md`.

# SkillBridge Production V2

Production-oriented rebuild of the original Android/Jetpack Compose SkillBridge prototype as a cross-platform application.

## Architecture

- `frontend/` — React Native + Expo Router + TypeScript for Android, iOS and Web/PWA.
- `backend/` — Node.js 22 + Express + TypeScript + Socket.IO.
- `infra/` — Supabase PostgreSQL schema/RLS/storage, Redis, LiveKit and Caddy deployment examples.
- `docs/` — architecture, migration, security, free-service plan and store-release checklists.

## Product modules included

Authentication; onboarding/profile; skills known/wanted/research interests; people matching; research collaborator discovery; learning rooms; public/private/invite-only access; volunteer-to-teach; room membership; session scheduling and attendance; realtime chat; resource upload tickets; clubs/events and approval workflow; ratings; reputation ledger; achievements; quizzes/skill verification; saved items; notifications; blocking/reporting/privacy; moderation/admin API; account deletion; LiveKit classroom tokens; optional AI gateway.

## Production principle

Supabase/PostgreSQL is the source of truth. Redis is disposable cache. Firebase/Expo notification infrastructure is for push/analytics rather than duplicating application records. LiveKit is media transport. This avoids multi-database inconsistency while still using free tiers efficiently.

## Before publish

This bundle contains the code foundation, but store credentials, production domains, privacy/legal URLs, Apple/Google signing, FCM/APNs credentials, real Supabase project keys, LiveKit secrets, device testing, load testing and store declarations must be completed by the project owner before release.
