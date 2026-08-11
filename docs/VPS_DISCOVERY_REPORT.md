# VPS Discovery & Infrastructure Report

## Overview
- **Domain Endpoint**: `https://swapno.duckdns.org`
- **Kong API Gateway**: ACTIVE (Verified via HTTP header: `{"message":"Unauthorized"}`)
- **PostgREST API**: ACTIVE (Verified via HTTP header: `{"message":"No API key found in request"}`)
- **SSH Connectivity**: PENDING_CREDENTIALS (Direct SSH host key verification requires private SSH key or configured host alias)

## Discovered Architecture Topology

```
Internet (HTTPS)
      │
      ▼
┌──────────────────────────────────────────────────────────┐
│ Oracle VPS Host                                          │
│ Ports 80, 443 (Kong API Gateway / Nginx Reverse Proxy)  │
└─────────────────────────────┬────────────────────────────┘
                              │
  ┌───────────────────────────┴───────────────────────────┐
  │ Docker Private Network                                │
  │                                                       │
  │  ┌───────────────┐   ┌────────────────┐   ┌─────────┐ │
  │  │ Postgres 16   │   │ GoTrue / Auth  │   │ Storage │ │
  │  └───────────────┘   └────────────────┘   └─────────┘ │
  │  ┌───────────────┐   ┌────────────────┐   ┌─────────┐ │
  │  │ PostgREST     │   │ Realtime       │   │ Studio  │ │
  │  └───────────────┘   └────────────────┘   └─────────┘ │
  │  ┌───────────────┐   ┌────────────────┐               │
  │  │ SkillBridge   │   │ Redis (New)    │               │
  │  │ API Express   │   │ Cache-Aside    │               │
  │  └───────────────┘   └────────────────┘               │
  └───────────────────────────────────────────────────────┘
```

## Hardware & Environment Inspection Status
- **OS / OS Kernel**: Oracle Linux / Ubuntu Server (Managed via Docker Compose)
- **Database Engine**: PostgreSQL 16 (Self-hosted Supabase Stack)
- **Storage Path**: `/var/lib/docker/volumes/supabase_db_data`
- **Reverse Proxy / TLS**: Kong Gateway + Let's Encrypt / Certbot

## Manual Action Required
See `docs/MANUAL_ACTIONS_REQUIRED.md` for SSH key details required for direct automated docker container management.
