# Redis Production Acceleration Layer

## Overview & Principles
Redis is deployed as an **internal acceleration layer**.

1. **Non-Authoritative**: Redis failure does NOT crash core authenticated application functionality. If Redis is unavailable or unconfigured, `RedisService` enters `DISABLED` or `DEGRADED` status and falls back gracefully to PostgreSQL.
2. **Never Authoritative for Security**: Roles, account status, reputation, verification, attendance, and moderation are ALWAYS evaluated directly against PostgreSQL.

## Docker Compose Deployment Specification

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: skillbridge-redis
    restart: always
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --save ""
    ports:
      - "127.0.0.1:6379:6379" # Internal localhost binding ONLY - NEVER EXPOSED PUBLICLY
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - supabase_network

networks:
  supabase_network:
    external: true
```

## Cache TTL Classes & Strategies

| Cache Entity | Strategy | TTL | Invalidation Trigger |
| :--- | :--- | :--- | :--- |
| **Search / Discover** | Cache-aside + Single-flight lock | 30 seconds | Expiry |
| **Public Metadata / Skills** | Cache-aside | 15 minutes | Admin update |
| **Institution List** | Cache-aside | 30 minutes | Admin update |
| **Public Room Summaries** | Cache-aside | 60 seconds | Room update / close |
| **Rate Limiter** | Sliding window counter | 60 seconds | Window expiry |
