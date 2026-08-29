# SKILLBRIDGE — Production-Ready Peer Learning & Growth Platform

[![CI](https://github.com/zenbijoy/SKILLBRIDGE-VERSION-01/actions/workflows/ci.yml/badge.svg)](https://github.com/zenbijoy/SKILLBRIDGE-VERSION-01/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1.0-orange.svg)](file:///c:/Users/24030/source/skillbridge-final/docs/API_REFERENCE.md)

SkillBridge is an enterprise-grade, peer-to-peer learning, mentorship, real-time collaboration, and community platform built with strict TypeScript across all layers.

---

## 🏗 Architecture & Repository Structure

```
SKILLBRIDGE
├── backend/          # Node.js 22 + Express 5 + Socket.IO + Pino + Sentry API Service
├── frontend/         # React Native 0.86 + Expo 57 (Android, iOS, Web/PWA)
├── admin/            # React 19 + Vite 8 + Tailwind Operations & Moderation Console
├── infra/            # Supabase PostgreSQL (RLS & RPCs), Redis, LiveKit, Cloudflare TURN
├── docs/             # Architecture, security, API specifications, and operational runbooks
│   ├── legal/        # Publish-ready Privacy Policy, Terms of Service, and Compliance Docs
│   └── testing/      # E2E test journeys and automation specifications
└── scripts/          # Database verification, doctor preflight, and audit tools
```

---

## 🚀 Key Production Capabilities

1. **Observability & Structured Logging**:
   - High-throughput **Pino** structured logging with automatic secret redaction (`authorization`, `cookie`, `password`, `token`, `serviceRoleKey`, `otp`).
   - Request context correlation (`X-Request-ID`) propagated via `AsyncLocalStorage` across deep service calls.
   - Sentry crash telemetry with contextual user/route metadata and strict `beforeSend` data sanitization.
2. **Central Error Architecture**:
   - Standardized application errors (`AppError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `RateLimitError`).
   - Safe production error masking preventing stack trace and database detail leakage.
3. **OpenAPI 3.1 & Interactive Docs**:
   - Machine-readable specification at `GET /openapi.json`.
   - Interactive Swagger UI documentation viewer at `GET /api-docs`.
4. **Hybrid Real-Time Communication**:
   - Ultra-low latency P2P WebRTC audio/video with Cloudflare TURN fallback.
   - Selective Forwarding Unit (SFU) rooms via LiveKit Cloud for large multi-party classrooms.
5. **Accessibility (WCAG 2.1 AA Compliant)**:
   - TalkBack & VoiceOver screen reader integration across reusable UI primitives (`Button`, `AppTextField`, `PasswordField`, `SettingSwitch`, `Card`).
   - Dynamic font scaling, high contrast support (Light, Dark, OLED themes), and 44x44pt minimum touch targets.
6. **Robust CI & Security Standards**:
   - Automated dependency vulnerability audits (`npm audit --audit-level=high`).
   - Dependabot weekly security updates.
   - 118+ automated unit, integration, and security adversarial test suites with coverage tracking.

---

## 🛠 Quick Start & Development Setup

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`

### 1. Installation
```bash
# Install dependencies across all packages
npm run setup
```

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

### 3. Run Development Servers
```bash
# Start Backend API (http://localhost:4000)
npm run dev:backend

# Start Mobile/Web Frontend (http://localhost:8081)
npm run dev:web

# Start Admin Operations Console (http://localhost:5173)
npm run dev:admin
```

---

## 🧪 Testing & Validation

Execute full monorepo validation suite:
```bash
# 1. Typecheck all packages
npm run typecheck

# 2. Lint all packages
npm run lint

# 3. Backend Test Suite with Coverage
npm run test:coverage

# 4. Frontend Jest Unit Tests
npm run test --prefix frontend

# 5. Production Bundle Builds
npm run build
```

---

## 📚 Core Documentation Index

- [Architecture Design & Data Flow](file:///c:/Users/24030/source/skillbridge-final/docs/ARCHITECTURE.md)
- [API Reference & OpenAPI Specification](file:///c:/Users/24030/source/skillbridge-final/docs/API_REFERENCE.md)
- [API Versioning & Deprecation Policy](file:///c:/Users/24030/source/skillbridge-final/docs/API_VERSIONING.md)
- [Secrets Management & Key Rotation](file:///c:/Users/24030/source/skillbridge-final/docs/SECRETS_MANAGEMENT.md)
- [Internal Security Self-Audit (OWASP)](file:///c:/Users/24030/source/skillbridge-final/docs/SECURITY_AUDIT_CHECKLIST.md)
- [Staging Deployment & Hardening Runbook](file:///c:/Users/24030/source/skillbridge-final/docs/STAGING_RUNBOOK.md)
- [End-to-End Test Journeys](file:///c:/Users/24030/source/skillbridge-final/docs/testing/E2E_JOURNEYS.md)
- [Privacy Policy](file:///c:/Users/24030/source/skillbridge-final/docs/legal/PRIVACY_POLICY.md)
- [Terms of Service](file:///c:/Users/24030/source/skillbridge-final/docs/legal/TERMS_OF_SERVICE.md)
- [Community Guidelines](file:///c:/Users/24030/source/skillbridge-final/docs/legal/COMMUNITY_GUIDELINES.md)
- [Data Retention Policy](file:///c:/Users/24030/source/skillbridge-final/docs/legal/DATA_RETENTION_POLICY.md)
- [Account Deletion & Data Erasure](file:///c:/Users/24030/source/skillbridge-final/docs/legal/ACCOUNT_DELETION.md)

---

## 🔒 Security Principles
Supabase PostgreSQL is the authoritative source of truth protected by strict Row-Level Security (RLS) and transactional RPCs. Redis serves as a disposable cache. All client traffic passes through rate-limited, correlation-tagged, and helmet-secured Express middleware.
