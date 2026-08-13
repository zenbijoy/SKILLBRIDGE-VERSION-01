# Mobile Application Screen Inventory

This document provides a verified inventory of the mobile application screens present in `frontend/app/`.

---

## Screen Inventory

| Route | File Path | Purpose | Auth Required | Key Dependencies |
| :--- | :--- | :--- | :---: | :--- |
| `/` | `app/index.tsx` | Root entry point redirecting to `(tabs)` or `(auth)` | No | `expo-router` |
| `/(auth)/welcome` | `app/(auth)/welcome.tsx` | Onboarding screen with features overview | No | `expo-router` |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | User login screen with Supabase auth | No | `@supabase/supabase-js`, `zustand` |
| `/(auth)/sign-up` | `app/(auth)/sign-up.tsx` | New account registration screen | No | `@supabase/supabase-js` |
| `/(auth)/forgot-password` | `app/(auth)/forgot-password.tsx` | Password reset request screen | No | `@supabase/supabase-js` |
| `/(auth)/reset-password` | `app/(auth)/reset-password.tsx` | New password set screen | No | `@supabase/supabase-js` |
| `/(tabs)` | `app/(tabs)/index.tsx` | Home feed & active rooms overview | Yes | `@tanstack/react-query`, `RoomCard` |
| `/(tabs)/discover` | `app/(tabs)/discover.tsx` | Search & discover skill matches | Yes | `@tanstack/react-query` |
| `/(tabs)/inbox` | `app/(tabs)/inbox.tsx` | Direct messages & chat list | Yes | `socket.io-client` |
| `/(tabs)/rooms` | `app/(tabs)/rooms.tsx` | User's active & joined skill rooms | Yes | `@tanstack/react-query` |
| `/(tabs)/profile` | `app/(tabs)/profile.tsx` | Current user profile & achievements | Yes | `useSession` |
| `/chat/[id]` | `app/chat/[id].tsx` | 1-on-1 and room chat messaging view | Yes | `socket.io-client`, `@supabase/supabase-js` |
| `/live/[roomId]` | `app/live/[roomId].tsx` | LiveKit WebRTC video/audio classroom | Yes | `@livekit/react-native`, `@livekit/react-native-webrtc` |
| `/room/[id]` | `app/room/[id].tsx` | Skill room detailed view & enrollment | Yes | `@tanstack/react-query` |
| `/room/[id]/schedule` | `app/room/[id]/schedule.tsx` | Room session calendar & booking | Yes | `@tanstack/react-query` |
| `/settings/profile` | `app/settings/profile.tsx` | Edit user profile info | Yes | `useSession` |
| `/settings/privacy` | `app/settings/privacy.tsx` | Privacy settings & blocked users | Yes | `@supabase/supabase-js` |
| `/settings/skills` | `app/settings/skills.tsx` | Skill tags & expertise management | Yes | `@supabase/supabase-js` |
| `/user/[id]` | `app/user/[id].tsx` | Public profile view of another member | Yes | `@tanstack/react-query` |
| `/clubs` | `app/clubs.tsx` | Student clubs & interest communities | Yes | `@tanstack/react-query` |
| `/connections` | `app/connections.tsx` | Network connections & requests | Yes | `@tanstack/react-query` |
| `/events` | `app/events.tsx` | Upcoming workshops & live events | Yes | `@tanstack/react-query` |
| `/leaderboard` | `app/leaderboard.tsx` | Global gamified learning leaderboard | Yes | `@tanstack/react-query` |
| `/notifications` | `app/notifications.tsx` | Activity & system notification hub | Yes | `expo-notifications` |
| `/quiz` | `app/quiz.tsx` | Skill assessment quiz player | Yes | `@tanstack/react-query` |
| `/research` | `app/research.tsx` | Technical articles & research papers | Yes | `@tanstack/react-query` |
| `/saved` | `app/saved.tsx` | Bookmarked resources & sessions | Yes | `@tanstack/react-query` |
| `/schedule` | `app/schedule.tsx` | Personal learning calendar | Yes | `@tanstack/react-query` |
| `/admin` | `app/admin.tsx` | Mobile link to Admin Control Panel | Yes (Admin) | `useSession` |

**Total Unique Mobile Routes**: 29 screens.
