# Web Output Strategy (Phase 1.3.1)

SkillBridge relies on authenticated dynamic routes (`/user/[id]`, `/live/[roomId]`, `/room/[id]`). 
Currently, the Expo web output relies on `static` rendering (`expo.web.output = "static"`).

## Selected Architecture
- **Strategy**: Static generation + Client-side hydration.
- **Why**: Static rendering guarantees maximum initial load performance. The dynamic routes operate smoothly because Expo Router natively hydrates `useLocalSearchParams()` on the client once the bundle loads, and the application's Auth Gate component (`app/_layout.tsx`) correctly redirects unauthenticated visitors even when rendered statically. 

We preserved `expo.web.output = "static"` rather than downgrading to `"single"` (SPA) because the dependency leak (`@livekit/react-native` and `expo-notifications`) was successfully resolved via platform-specific module overrides (`.web.tsx`, `.native.tsx`), which completely avoids SSR Node environment crashes.

If SkillBridge scales to require SSR SEO on dynamic entity pages (e.g., public research papers), we will consider `"server"` output with Expo Router. For now, `"static"` with dynamic client navigation is verified and robust.
