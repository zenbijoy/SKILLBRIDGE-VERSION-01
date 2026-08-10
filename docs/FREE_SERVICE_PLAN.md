# Free-first service plan

Do not use many databases just because they are free. Use each service for one clear responsibility.

| Need | Default service | Why |
|---|---|---|
| Auth | Supabase Auth | one identity authority |
| relational app data | Supabase PostgreSQL | joins, transactions, RLS, full-text search |
| files | Supabase Storage | integrated storage policies |
| realtime persistence | Postgres + Socket.IO/API | durable chat source-of-truth |
| cache | self-hosted Redis / free Redis provider | disposable performance layer |
| Android push | Expo Notifications backed by FCM | works with Expo/EAS |
| analytics/crash | Firebase services (optional native integration) | product telemetry |
| video/audio | self-hosted LiveKit initially | WebRTC, role-based publishing |
| web hosting | static hosting/CDN | Expo web output |
| backend hosting | existing/free VPS initially | Docker deployment |

## Cost-control rules
- paginate every list and message history;
- cache dashboard/recommendations briefly;
- compress avatars/resources client-side;
- do not auto-record live classes on free storage;
- avoid duplicating chat/profile data into Firestore;
- limit media publish roles in classrooms;
- rate-limit API and AI routes;
- add database indexes before adding external search infrastructure.
