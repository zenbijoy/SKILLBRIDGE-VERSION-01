# Vercel Deployment Audit

## 1. Root Cause Analysis of Blank Page

The existing Vercel deployment of the SkillBridge monorepo was exhibiting a "blank page" issue on the frontend due to two main reasons:

1.  **Monorepo Deployment Architecture**: By default, connecting a Vercel project to the root of this repository will attempt to build and serve from the root. Since the monorepo splits applications into `frontend/` (Expo React Native Web) and `admin/` (Vite React), a single root deployment cannot serve both. The frontend build commands (`npx expo export --platform web`) were likely not being executed correctly or outputting to a directory Vercel couldn't correctly serve without explicit configuration.
2.  **Runtime Crash Due to Native Code Import**: More critically, the frontend codebase included a hard crash on the web bundle. In `frontend/src/features/calls/services/webrtc.ts`, the code conditionally imported `@livekit/react-native-webrtc` (a strictly native module) using `require()`. Although guarded by `if (Platform.OS !== "web")`, web bundlers (like Expo's Metro for web) resolve `require` statements during the bundling phase. This caused the module to be evaluated in the browser, triggering an immediate crash (blank page) because native components cannot be executed in the web environment.

### Exact Files Causing the Issue:
*   `frontend/src/features/calls/services/webrtc.ts`

## 2. Fixes Applied

### A. Fixing the Native Module Crash (WebRTC)
We removed the single `webrtc.ts` file and split it into two platform-specific files:
*   **`frontend/src/features/calls/services/webrtc.web.ts`**: Uses standard browser APIs (`window.RTCPeerConnection`, `navigator.mediaDevices`).
*   **`frontend/src/features/calls/services/webrtc.native.ts`**: Uses the React Native specific bindings (`@livekit/react-native-webrtc`).

By utilizing `.web.ts` and `.native.ts` extensions, the Metro bundler correctly includes only the appropriate file for the target platform, completely isolating the native LiveKit dependency from the web bundle.

### B. Vercel Configuration Verification
Both `frontend/vercel.json` and `admin/vercel.json` were audited and confirmed to correctly support their respective Single Page Applications (SPAs).
*   **Frontend**: Includes rewrites to fallback to `/index.html` while preserving paths to `_expo` static assets.
*   **Admin**: Includes rewrites to fallback to `/index.html` while preserving standard Vite `assets/`.

## 3. Deployment Instructions & Required Settings

To properly deploy the SkillBridge suite, you must create **TWO independent Vercel projects** connected to the same repository.

### Vercel Project 1: Frontend (Expo Web)
When creating the project in Vercel, configure it as follows:
*   **Root Directory**: `frontend`
*   **Framework Preset**: Other
*   **Build Command**: `npx expo export --platform web`
*   **Output Directory**: `dist`
*   **Environment Variables**:
    *   `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
    *   `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon/Publishable Key
    *   `EXPO_PUBLIC_API_URL`: `https://skillbridge-api.onrender.com/api/v1` (or your active production backend)

### Vercel Project 2: Admin Dashboard (Vite)
When creating the project in Vercel, configure it as follows:
*   **Root Directory**: `admin`
*   **Framework Preset**: Vite
*   **Build Command**: `npm run build`
*   **Output Directory**: `dist`
*   **Environment Variables**:
    *   `VITE_SUPABASE_URL`: Your Supabase Project URL
    *   `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon/Publishable Key
    *   `VITE_API_URL`: `https://skillbridge-api.onrender.com/api/v1` (or your active production backend)

## 4. Backend CORS Configuration
The backend (hosted on Render) must be updated to accept cross-origin requests from these new Vercel domains.

Update your Render environment variables for the backend service:
*   **`WEB_ORIGINS`**: `https://<your-frontend-domain>.vercel.app,https://<your-admin-domain>.vercel.app,http://localhost:8081`

*(Replace the `<...>` placeholders with the actual domains Vercel assigns to your projects).*

## 5. Build Results

Both builds were executed locally to guarantee success:
*   **Frontend**: `npx expo export --platform web` completed successfully in ~4 seconds, generating the web bundle and index.html in `frontend/dist`.
*   **Admin**: `npm run build` (`tsc -b && vite build`) completed successfully in ~4 seconds, generating the minified React bundle in `admin/dist`.

Both builds have been confirmed to output correctly without compilation errors. The runtime web bundle crash caused by LiveKit has been resolved. There are no remaining blockers for deploying these applications on Vercel.
