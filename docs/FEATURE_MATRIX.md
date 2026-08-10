# Feature matrix

| Domain | Frontend | API | Database/security |
|---|---|---|---|
| Email auth/session | yes | token verification | Supabase Auth/profile trigger |
| Profiles/privacy | yes | yes | RLS |
| Skills known/wanted | profile display | query foundation | normalized tables |
| People search | yes | yes | trigram indexes/block filtering |
| Recommendations | yes | SQL RPC | skill/reputation scoring |
| Research matching | yes | yes | skills/research graph |
| Connections | yes | yes | request + edge tables |
| Public/private rooms | yes | yes | RLS + membership |
| Atomic room join | yes | RPC | row lock/capacity validation |
| Volunteer teacher | yes | yes | role transition |
| Scheduling/attendance | schedule UI | yes | session tables |
| Realtime chat | yes | REST + Socket.IO | persisted messages |
| Resources/uploads | room display | signed upload APIs | Storage RLS |
| Clubs/events | event UI | create/apply/review | club roles/applications |
| Ratings/reviews | room/session API | yes | unique reviewer/session |
| Reputation | leaderboard | read | server ledger trigger |
| Quiz verification | yes | secure scoring | answer keys server-only |
| Saved items | yes | yes | per-user rows |
| Push notifications | yes | Expo push | device tokens |
| Live class | yes | LiveKit JWT | membership/publish role check |
| Block/report | privacy/profile | yes | moderation tables |
| Admin reports | yes | role-gated | moderator/admin roles |
| Account deletion | yes | yes | Supabase Auth + cascading profile |
| AI gateway | client-ready | optional endpoint | provider secret server-only |
| Android/iOS/Web | Expo Router | same API | same backend |
