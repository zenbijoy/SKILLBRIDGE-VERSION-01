# Original Android → Production V2 migration map

| Original concept / issue | V2 implementation |
|---|---|
| Jetpack Compose Android-only UI | Expo Router React Native screens for Android/iOS/Web |
| `isAuthenticated = true` launch bypass | Supabase session gate in root layout |
| hard-coded `user_me` | authenticated Supabase UUID propagated by bearer token |
| local/mock profile data | `profiles`, `skills`, `user_skills` PostgreSQL tables |
| empty connection repository | request/accept/decline/remove graph API + database |
| empty recommendation repository | SQL scoring functions + API |
| empty search repository | indexed Postgres search API |
| fake Supabase upload URL | signed storage upload tickets + bucket RLS |
| Room-only/local session state | PostgreSQL source of truth + local React Query cache |
| client-editable points | append-only server points ledger + reputation trigger |
| room capacity client logic | `join_room_atomic` row lock/transaction |
| mock quiz answers | safe backend scoring; correct answers denied to client |
| missing live video | LiveKit secure room token endpoint + Expo live screen |
| chat split/mock behavior | persistent Postgres messages + Socket.IO delivery |
| missing connections/saved routing | complete Expo routes |
| weak UGC safety | block/report/moderator report APIs + privacy UI |
| no account deletion | authenticated server-side deletion endpoint |
| no release deployment | EAS config + Docker + GitHub Actions + release checklist |
| static first-run flow | localized welcome carousel + resumable 9-step atomic onboarding |
| fixed dashboard layout | server-targeted widgets + user presets/order/visibility + required-widget enforcement |
| no guided product tour | versioned resumable tour with skip/replay and idempotent reward |
| local-only notification settings | atomic server preferences + quiet-hours/category push suppression |
| basic moderation console | dedicated product experience administration with targeting, flags, broadcasts, and versioned copy |
