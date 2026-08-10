# Security checklist

- Rotate any credentials that were ever committed to the original repository.
- Never commit `.env`, Supabase service-role keys, Google service credentials, LiveKit secrets or AI keys.
- Keep RLS enabled on all user/business tables.
- Validate every external input at the API boundary.
- Rate-limit login-adjacent, report, message, search and AI endpoints.
- Restrict file MIME type/size and scan uploads before enabling public sharing at scale.
- Use signed URLs for private resources.
- Log moderation/admin actions in an audit table before public launch.
- Add CSRF-aware origin restrictions for browser sessions if cookie authentication is ever introduced.
- Enforce profile/account status on sensitive routes.
- Add email verification requirements for club administration.
- Add abuse throttling for connection requests, messaging and event applications.
- Keep quiz answer keys server-only.
- Keep points/reputation server-authoritative.
- Run dependency, secret and SAST scans in CI.
