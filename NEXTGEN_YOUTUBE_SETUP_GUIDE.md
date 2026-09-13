# SkillBridge Next-Gen: YouTube OAuth & Data API Setup Guide

**Phase 4 Operational Runbook**  
**Document Classification:** Production Safe, Zero Auto-Deploy

---

## 1. Executive Summary

SkillBridge Next-Gen Phase 4 introduces automated recording indexing, teacher YouTube channel synchronization, and metadata extraction. To balance rich teacher integration with strict privacy and Render free-tier stability, this subsystem conforms to the following architectural invariants:

1. **Minimum Privileged Scopes**: The integration requests **read-only** channel access (`https://www.googleapis.com/auth/youtube.readonly`). It never requests write or upload scopes.
2. **End-to-End Encryption**: All OAuth refresh and access tokens are encrypted with **AES-256-GCM** using `OAUTH_TOKEN_ENCRYPTION_KEY` before persisting to Supabase (`public.youtube_connections`). Plaintext tokens are never stored.
3. **Log & Telemetry Redaction**: Tokens, codes, and secrets are automatically scrubbed by Pino logger and error reporting hooks.
4. **Quota-Safe Resilient Fallback**: If YouTube Data API v3 daily quota (10,000 units) is exhausted, recordings continue to function with standard YouTube embed and thumbnail URLs without failing user operations.

---

## 2. Google Cloud Console Configuration

### Step 2.1: Create or Select GCP Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named `skillbridge-media-prod` (or select your existing SkillBridge project).
3. Ensure the project is active and note your **Project Number** and **Project ID**.

### Step 2.2: Enable YouTube Data API v3
1. In the Google Cloud Console, navigate to **APIs & Services > Library**.
2. Search for **YouTube Data API v3**.
3. Click **Enable**.

### Step 2.3: Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **External** user type (or **Internal** if restricted to an institutional Google Workspace).
3. Fill in the App Information:
   - **App name**: `SkillBridge Learning Platform`
   - **User support email**: `support@skillbridge.app` (or your developer email)
   - **Developer contact information**: `admin@skillbridge.app`
4. Click **Save and Continue**.
5. In the **Scopes** step, click **Add or Remove Scopes**:
   - Manually enter or filter for:  
     `https://www.googleapis.com/auth/youtube.readonly`
   - Description: *View your YouTube account*
6. Click **Update** and **Save and Continue**.
7. In the **Test users** section (while in Testing status):
   - Add the Gmail addresses of test teachers and moderators who will connect channels during staging verification.

### Step 2.4: Create OAuth 2.0 Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select Application type: **Web application**.
4. Name: `SkillBridge Backend Server`.
5. **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `http://localhost:4000`
   - `https://skillbridge.app`
   - `https://admin.skillbridge.app`
   - `https://<your-render-frontend-domain>.onrender.com`
6. **Authorized redirect URIs**:
   - Development: `http://localhost:4000/api/v1/integrations/youtube/callback`
   - Production: `https://<your-render-backend-domain>.onrender.com/api/v1/integrations/youtube/callback`
7. Click **Create**.
8. Securely copy the **Client ID** and **Client Secret**.

---

## 3. Environment Variables Configuration

In your **Render Dashboard** (or `.env` for local testing), configure the following variables:

```bash
# -----------------------------------------------------------------------------
# Phase 4: YouTube OAuth & Media Automation
# -----------------------------------------------------------------------------

# Set to true when you wish to enable the OAuth connect flow
YOUTUBE_OAUTH_ENABLED=true

# Google OAuth Credentials
YOUTUBE_CLIENT_ID="<YOUR_GOOGLE_CLIENT_ID>.apps.googleusercontent.com"
YOUTUBE_CLIENT_SECRET="<YOUR_GOOGLE_CLIENT_SECRET>"
YOUTUBE_REDIRECT_URI="https://<your-render-backend-domain>.onrender.com/api/v1/integrations/youtube/callback"

# Public API Key (Used for non-authenticated quota-efficient video metadata lookups)
YOUTUBE_API_KEY="<YOUR_YOUTUBE_DATA_API_KEY>"

# AES-256-GCM Token Encryption Key (Must be 32 bytes or 64-character hex)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OAUTH_TOKEN_ENCRYPTION_KEY="<64_CHAR_HEX_KEY>"
```

> [!IMPORTANT]
> Never commit `OAUTH_TOKEN_ENCRYPTION_KEY`, `YOUTUBE_CLIENT_SECRET`, or `YOUTUBE_API_KEY` to git repositories. If `OAUTH_TOKEN_ENCRYPTION_KEY` is omitted in local dev, the backend falls back to deriving a deterministic development key from `SUPABASE_SERVICE_ROLE_KEY`.

---

## 4. Operational Workflows & Testing

### 4.1 Teacher Connection Flow
1. Teacher navigates to **Settings > Integrations & Channels** (`/settings/integrations`).
2. Clicks **Connect YouTube Channel**.
3. Frontend initiates `GET /api/v1/integrations/youtube/connect`.
4. Backend generates a 10-minute HMAC-signed CSRF state token bound to the teacher's `userId`.
5. Browser redirects to Google consent prompt.
6. Upon approval, Google redirects to `/api/v1/integrations/youtube/callback?code=...&state=...`.
7. Backend validates the state signature, exchanges the code for access/refresh tokens, fetches the channel profile, encrypts the tokens with AES-256-GCM, and upserts into `public.youtube_connections`.
8. User is returned to `/settings/integrations?status=success`.

### 4.2 Metadata Syncing & Resync
- When adding a recording in a Modular Study Room (`POST /api/v1/rooms/:id/recordings`), the video ID is extracted and metadata (title, duration in seconds, thumbnail) is immediately fetched and stored.
- Room hosts and moderators can click **Sync Meta** at any time (`POST /api/v1/rooms/:id/recordings/:recId/sync`) to refresh changed titles, thumbnail updates, or privacy statuses.

### 4.3 Revocation & Disconnection
- Teachers can click **Disconnect Channel** at any time (`DELETE /api/v1/integrations/youtube/disconnect`).
- The connection status is set to `revoked` and encrypted tokens are scrubbed. Existing study room recordings remain preserved in the room archive.

---

## 5. Quota & Rate Limit Protection

- **Daily Free Quota**: 10,000 units / day.
  - Video search: 100 units (Avoided! We never use broad search queries).
  - Video details query (`videos.list`): **1 unit**.
  - Channel profile query (`channels.list`): **1 unit**.
- **Quota Exceeded Fallback**:
  - If a 403 `quotaExceeded` error is returned by Google, `youtubeService.ts` catches the error, logs a warning with details, and supplies a standard fallback metadata object with canonical YouTube thumbnail (`https://img.youtube.com/vi/${id}/hqdefault.jpg`). The recording creation **never crashes or blocks the user**.
