# SkillBridge Production Deployment & Architecture Guide

This manual covers the complete step-by-step production deployment workflow for **SkillBridge** across:
1. **Supabase PostgreSQL 16** (Persistent data layer: users, skills, ratings, rooms, messaging)
2. **Managed Redis on Render** (In-memory caching, sessions, presence, and realtime pub/sub)
3. **App Local Storage & UX Layer** (Fast offline cold-start and local cache hydration)
4. **Backend API on Render or Koyeb** (Node.js 22 container with LiveKit & WebSockets)
5. **Frontend Web & Admin Portal on Vercel / Netlify** (Edge-served SPA clients)

---

## 1. Architecture Flowchart

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Applications                         │
│  • Mobile App (Expo / React Native - iOS & Android)         │
│  • Web Client (Expo Web hosted on Vercel / Netlify)         │
│  • Admin Dashboard (React + Vite hosted on Vercel / Netlify)│
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               │ HTTPS / REST / Socket.IO       │ Local Cache Hydration
               ▼                               ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│     Backend Node.js API       │  │      Client Local Storage     │
│  (Render / Koyeb MicroVMs)    │  │  • AsyncStorage / LocalStorage │
│  • Express 5 REST Routes      │  │  • SecureStore (Tokens)       │
│  • Socket.IO Gateway          │  │  • Zustand State Persistence  │
│  • LiveKit Signaling Engine   │  └───────────────────────────────┘
└───────────┬───────────────┬───┘
            │               │
            ▼               ▼
┌───────────────────┐   ┌───────────────────────────────┐
│   Managed Redis   │   │     Supabase PostgreSQL 16    │
│  (Render VPC)     │   │  • Users / Profiles / Roles   │
│  • Catalog Cache  │   │  • Skills & Proficiencies     │
│  • Room Discovery │   │  • Ratings & Session Reviews  │
│  • User Presence  │   │  • Rooms, Bookings & Messages │
│  • Rate Limiting  │   │  • Row Level Security (RLS)   │
└───────────────────┘   └───────────────────────────────┘
```

---

## 2. Tier 1: Supabase PostgreSQL (Data & Auth Layer)

### 2.1 Schema Breakdown
- **Users (`profiles`)**: Managed alongside `auth.users`, records user status (`active`, `suspended`, `banned`), roles (`learner`, `mentor`, `admin`), trust scores, verification badges.
- **Skills (`skills`, `user_skills`)**: Skill catalog hierarchy, proficiency levels (`beginner`, `intermediate`, `advanced`, `expert`), peer endorsements, hourly rates.
- **Ratings & Reviews (`reviews`, `mentor_ratings`)**: 1-5 star ratings, feedback comments, verified session association, automated rolling average calculations.
- **Rooms & Live Classes (`rooms`, `room_members`, `room_schedules`)**: Virtual classroom topologies, max capacity, host attribution, room state.
- **Bookings & Calendar (`bookings`, `calendar_events`)**: 1-on-1 mentor booking slots, statuses, transactional point ledger.
- **Direct & Group Messaging (`conversations`, `messages`)**: Realtime messaging with RLS isolation and unread badge counters.

### 2.2 Applying Database Migrations
Run the migration scripts located in `infra/supabase/migrations/` sequentially in the Supabase SQL Editor:
1. `001_schema.sql` (Core tables and types)
2. `002_functions_rls.sql` through `018_learning_growth_hub.sql`

Alternatively, use the combined migration script `infra/supabase/migrations/merged.txt` to apply all database tables, functions, triggers, and RLS policies in one single execution.

### 2.3 Supabase Environment Settings
- Navigate to **Project Settings -> API** and copy:
  - **Project URL**: `https://<project-ref>.supabase.co`
  - **anon public key**: `eyJhbGciOi...`
  - **service_role secret key**: `eyJhbGciOi...` (backend only!)
- Navigate to **Authentication -> URL Configuration** and add your production site URLs:
  - `https://skillbridge.app`
  - `https://admin.skillbridge.app`
  - `skillbridge://*` (Mobile OAuth redirect)

---

## 3. Tier 2: Managed Redis on Render (Cache & Realtime)

### 3.1 Setup on Render
1. In the Render Dashboard, click **New + -> Key Value** (or Redis).
2. Name: `skillbridge-redis-free`.
3. Plan: **Free** (25 MB RAM, 50 connections, `allkeys-lru`, persistence off).
4. Eviction Policy: `allkeys-lru` (Least Recently Used).
5. Copy the **Internal Redis Connection String** and set it in your Render Web Service Environment as `REDIS_URL`.
   *(Note: `REDIS_REQUIRED=false` ensures graceful fallback if Redis is waking up).*

### 3.2 Redis Features Enabled in SkillBridge
- **Skill Catalog & Category Caching**: `catalog:skills` cached with 1-hour TTL.
- **Profile Cards & Bios**: `user:profile:<id>` cached with 10-minute TTL.
- **Dashboard Aggregations**: `dashboard:<userId>:<mode>` cached with 2-minute TTL.
- **Public Room Discovery**: `rooms:public:*` cached with 30-second TTL.
- **Live User Presence**: Tracking user active states and broadcasting `user:online` / `user:offline` socket events.
- **Sliding-Window Rate Limiting**: Redis-backed request limiter protecting API endpoints against abuse.

---

## 4. Tier 3: Client Local Storage & UX Acceleration

### 4.1 Storage Architecture
1. **Encrypted Storage (`expo-secure-store`)**:
   - Supabase Auth session tokens (`access_token`, `refresh_token`).
   - Secure biometric keys.
2. **Fast Local Storage (`AsyncStorage` / `LocalStorage`)**:
   - **React Query Cache Hydration**: Queries are cached on device disk so returning users experience **0ms loading times**.
   - **Preferences Store (`usePreferencesStore`)**: Theme (Light, Dark, OLED), accent colors, language (`en`, `bn`), data saver modes.
   - **App Store (`useAppStore`)**: Active user mode (`learn` vs `teach`).
   - **Search History**: Recent search queries cached locally.

### 4.2 Optimistic Updates
- Rating submissions, bookmarking resources, and sending chat messages render instantly in the UI with optimistic state while synchronizing in the background.

---

## 5. Tier 4: Backend API Deployment (Render / Koyeb)

### 5.1 Option A: Render (Recommended)
You can deploy using the included `render.yaml` Blueprint or manually:
1. Create a **Web Service** connected to your Git repository.
2. Set **Root Directory** to `backend`.
3. Set **Runtime** to `Docker` (or Node 22).
4. Set **Health Check Path** to `/api/v1/health`.
5. Add the Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `4000`
   - `SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `SUPABASE_ANON_KEY`: `<your-anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-service-role-key>`
   - `REDIS_URL`: `redis://red-xxxx:6379` (from Render Redis)
   - `WEB_ORIGINS`: `https://skillbridge.app,https://admin.skillbridge.app`
   - `LIVEKIT_URL`: `wss://<your-project>.livekit.cloud`
   - `LIVEKIT_API_KEY`: `<your-livekit-key>`
   - `LIVEKIT_API_SECRET`: `<your-livekit-secret>`

### 5.2 Option B: Koyeb
1. Deploy using `koyeb.yaml` or connect repository to Koyeb.
2. Set Dockerfile path to `./backend/Dockerfile`.
3. Define secrets for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, and `LIVEKIT_API_SECRET`.
4. Configure port `4000` with HTTP health checks on `/api/v1/health`.

---

## 6. Tier 5: Frontend Web & Admin Portal Hosting (Vercel / Netlify)

### 6.1 Admin Dashboard (`/admin`)
- **Vercel**:
  - Import repository -> Select `admin` root directory.
  - Framework Preset: **Vite**.
  - Build Command: `npm run build`.
  - Output Directory: `dist`.
  - Env Vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
- **Netlify**:
  - Automatically configured via `admin/netlify.toml` and `admin/public/_redirects`.

### 6.2 Frontend Web App (`/frontend`)
- **Vercel**:
  - Import repository -> Select `frontend` root directory.
  - Framework Preset: **Other**.
  - Build Command: `npx expo export -p web`.
  - Output Directory: `dist`.
  - Env Vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.
- **Netlify**:
  - Automatically configured via `frontend/netlify.toml`.

---

## 7. Verification Checklist

After deploying all services, execute the following smoke tests:

1. **Backend Health & Redis Connectivity**:
   ```bash
   curl -I https://api.skillbridge.app/api/v1/health
   # Expected: HTTP 200 with {"status":"UP","services":{"database":"UP","redis":"enabled"}}
   ```

2. **Catalog & Cache Verification**:
   ```bash
   curl https://api.skillbridge.app/api/v1/catalog
   # Verify response time drops to <10ms on subsequent requests (served from Redis)
   ```

3. **Admin Dashboard Access**:
   - Open `https://admin.skillbridge.app`.
   - Log in with an admin profile.
   - Confirm user metrics, role management, and moderation queues load accurately.

4. **Web Client & Local Storage Test**:
   - Open `https://skillbridge.app`.
   - Sign in or sign up.
   - Switch themes and refresh browser -> confirm theme and session persist without re-authenticating.
