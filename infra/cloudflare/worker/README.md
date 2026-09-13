# SkillBridge Next-Gen Cloudflare Edge Gateway

High-performance, zero-cold-start Edge Gateway deployed on Cloudflare Workers (300+ global PoPs).

## Features

1. **Instant Edge Bootstrap (`/api/bootstrap`)**:
   - Returns client configurations, feature flags, and CDN endpoints in `<15ms`.
   - Bypasses Render backend completely during cold boots.

2. **Smart SWR Caching**:
   - Routes cached with Stale-While-Revalidate (`maxAge` + `staleWhileRevalidate`).
   - Deterministic cache key generation (normalized URLs + sorted query parameters).
   - Zero stale private data: requests with `Authorization` headers, cookies, or mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) are strictly bypassed.

3. **Origin Resilience**:
   - On backend 5xx errors or network drops, serves cached stale responses to public visitors rather than failing.

4. **Edge Purge API (`POST /api/edge/purge`)**:
   - Secured by `PURGE_SECRET`.
   - Allows invalidating individual paths or entire caches on content updates.

## Development & Deployment

> **IMPORTANT**: Never deploy without explicit user approval.

```bash
# 1. Inspect configuration
cp wrangler.toml.example wrangler.toml

# 2. Local emulation
npm run dev

# 3. Type check
npm run typecheck
```
