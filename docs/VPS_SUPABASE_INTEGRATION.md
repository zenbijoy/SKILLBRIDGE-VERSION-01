# VPS & Self-Hosted Supabase Integration Guide

## Architecture Overview
SkillBridge connects to self-hosted Supabase running at `https://swapno.duckdns.org`.

1. **PostgreSQL as Source of Truth**: All RBAC, reputation, account status, verification, attendance, and moderation decisions are executed strictly in PostgreSQL using Row-Level Security (RLS) policies and SECURITY DEFINER RPCs.
2. **Dual-Path Migration Safety**:
   - Fresh install: `001_skillbridge_baseline.sql` + post-baseline migrations (`012`, `013`).
   - Legacy upgrade: Preserves existing historical migration history (`001-011`) and applies append-only upgrade corrections `012_upgrade_corrections.sql` and `013_hardening.sql`.

## Backend Supabase Configuration

```env
# backend/.env (Server-side secrets - NEVER in client apps)
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:[PASSWORD]@127.0.0.1:5432/postgres
SUPABASE_URL=https://swapno.duckdns.org
SUPABASE_SERVICE_ROLE_KEY=[SUPABASE_SERVICE_ROLE_KEY]
REDIS_URL=redis://127.0.0.1:6379
```

## Mobile Application Configuration

```env
# frontend/.env (Public client values only)
EXPO_PUBLIC_API_URL=https://swapno.duckdns.org/api/v1
EXPO_PUBLIC_SUPABASE_URL=https://swapno.duckdns.org
EXPO_PUBLIC_SUPABASE_ANON_KEY=[SUPABASE_ANON_KEY]
```
