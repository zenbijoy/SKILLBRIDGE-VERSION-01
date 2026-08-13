# Current Mobile Frontend Structure

## Overview
The mobile frontend is built using **Expo SDK 56**, **React Native 0.85**, **Expo Router v56**, and **Tailwind (NativeWind) / custom styles**. It is designed to work with a **Custom Expo Development Client** due to native LiveKit/WebRTC and Worklets dependencies.

---

## Directory Organization

```text
frontend/
├── android/                   # Native Android project configuration
│   ├── app/                   # Android application module & manifests
│   ├── gradle/                # Gradle wrapper (8.13)
│   ├── local.properties       # Local machine Android SDK path (untracked)
│   └── build.gradle           # Top-level Gradle configuration (AGP 8.12.0, Kotlin 2.1.20)
├── app/                       # Expo Router filesystem routing
│   ├── (auth)/                # Authentication stack (sign-in, sign-up, forgot-password, reset-password, welcome)
│   ├── (tabs)/                # Main bottom tab navigation (index, discover, inbox, rooms, profile)
│   ├── chat/                  # Direct & group messaging screens ([id].tsx)
│   ├── live/                  # LiveKit video/audio classroom screen ([roomId].tsx)
│   ├── room/                  # Skill room detail and scheduling screens ([id].tsx, schedule.tsx)
│   ├── settings/              # User settings screens (profile.tsx, privacy.tsx, skills.tsx)
│   ├── user/                  # User profile view ([id].tsx)
│   ├── admin.tsx              # Quick admin overlay/dashboard link
│   ├── clubs.tsx              # Community clubs & study groups
│   ├── connections.tsx        # Peer connection & networking screen
│   ├── events.tsx             # Live workshops & events schedule
│   ├── leaderboard.tsx        # Gamified learning & skill leaderboard
│   ├── notifications.tsx      # Push & in-app notification center
│   ├── quiz.tsx               # Skill evaluation & quiz engine
│   ├── research.tsx           # Academic & technical research hub
│   ├── saved.tsx              # Saved posts & learning resources
│   ├── schedule.tsx           # Personal learning timetable
│   ├── _layout.tsx            # Root navigation layout provider
│   └── index.tsx              # Root route redirect
├── assets/                    # Static image & vector assets (icon.png, splash.png)
├── src/                       # Shared application architecture
│   ├── components/            # Reusable UI components (ProfileCard, RoomCard, FeatureGrid, ui.tsx)
│   ├── features/              # Feature modules (live/ LiveRoomScreen platform split)
│   ├── hooks/                 # Custom React hooks (useSession, useDebounce)
│   ├── lib/                   # Utility clients (api.ts, socket.ts, supabase.ts, notifications)
│   ├── state/                 # Zustand global state store (useAppStore.ts)
│   ├── theme/                 # Design tokens & color system
│   └── types/                 # TypeScript interfaces & domain models
├── app.json                   # Expo project configuration
├── eas.json                   # EAS Build profile configuration
└── package.json               # Package manifest with overrides
```
