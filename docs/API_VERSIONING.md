# SKILLBRIDGE API Versioning & Deprecation Policy

## 1. Overview
SkillBridge follows a strict backward-compatibility and API lifecycle management policy to guarantee zero downtime and smooth upgrades for Web, Mobile, and third-party integrations.

The current canonical API base path is:
```http
/api/v1
```

---

## 2. Backward Compatibility Guarantees
The following changes are considered **backward-compatible** (Non-Breaking) within `/api/v1`:
- Adding new endpoints.
- Adding optional request body fields or query parameters.
- Adding new fields to response JSON payloads.
- Adding optional HTTP headers.
- Improving performance or internal database queries without changing contract schemas.

---

## 3. Breaking Changes Policy
A change is considered **breaking** if it requires client code modifications to avoid runtime failure. Examples include:
- Removing an endpoint.
- Renaming an existing endpoint path.
- Renaming required request parameters or JSON fields.
- Changing the datatype of a response field.
- Introducing a new required request field without a default.
- Changing authentication mechanisms.

> [!IMPORTANT]
> **Rule on Major Version Bumps (`/api/v2`)**:
> Major version branches (e.g. `/api/v2`) are **only** introduced when an architectural requirement fundamentally cannot be satisfied via backward-compatible additions in `/v1`.

---

## 4. API Deprecation & Sunset Timeline
When an endpoint or schema property is designated for retirement, the following timeline is enforced:

| Phase | Timeline | Action Required |
| :--- | :--- | :--- |
| **Notice** | Day 0 | Mark endpoint as `@deprecated` in OpenAPI schema and developer documentation. |
| **Deprecation Headers** | Day 0 to 90 | Inject HTTP Sunset and Deprecation headers on responses. |
| **Telemetry Analysis** | Day 90 to 180 | Monitor client version distribution using `X-App-Version` headers. |
| **Sunset / Retirement** | Day 180+ | Remove deprecated handler with formal migration guide. |

### Standard Deprecation Headers
```http
Deprecation: @1735689600
Sunset: Wed, 01 Jul 2026 00:00:00 GMT
Link: <https://skillbridge.example.com/docs/migrations/v1-to-v2>; rel="deprecation"
```

---

## 5. Client Version Tracking
Every client request from Mobile or Web must transmit:
```http
X-App-Version: 2.0.1
X-App-Locale: en
```
This enables accurate telemetry regarding outdated clients prior to applying sunset rules.
