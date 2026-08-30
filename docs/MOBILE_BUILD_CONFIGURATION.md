# SkillBridge Mobile Build Configuration Guide

## 1. Authoritative Mobile Project Structure

The SkillBridge mobile application is located entirely in the `frontend/` directory.

- **Source Code**: `frontend/`
- **Application ID**: `com.skillbridge.app`
- **Scheme**: `skillbridge`
- **Expo SDK**: 52+
- **Entry Point**: `frontend/app/` (Expo Router)
- **Native Android Project**: `frontend/android/`

> **Note on Root Legacy Project**: A legacy skeleton existed at the repository root (`app.json` with `com.bijoysaha.skillbridgeroot` and SDK 46). Do NOT run builds or Expo commands from the repository root; all mobile builds, scripts, and commands target `frontend/`.

---

## 2. Required Build-Time Environment Variables

The mobile application requires three core public environment variables configured in `frontend/.env`:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | Canonical Supabase Project URL | `https://wyqsoxkwmulhpcoslnoj.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase Anon / Publishable Key | `eyJhbGci...` |
| `EXPO_PUBLIC_API_URL` | Backend API Base URL | `https://skillbridge-api-pd9c.onrender.com/api/v1` |

> [!CAUTION]
> **Security Rule**: The mobile application must **NEVER** receive `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or private API secrets. The runtime validator in `frontend/src/lib/config.ts` will immediately abort execution if privileged secrets are detected in the client environment.

---

## 3. Why Rebuilding the APK is Required After Env Changes

In Expo and React Native:
1. `EXPO_PUBLIC_*` variables are **inlined into the JavaScript bundle at build time** by the Metro bundler.
2. Changing server-side environment variables (such as on Render or Supabase) has **zero effect** on already-compiled APK binaries.
3. Whenever `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, or `EXPO_PUBLIC_API_URL` changes, **a fresh APK must be compiled and distributed**.

---

## 4. Build Pipelines

### A. Local Android APK Compilation (via Gradle / `BUILD_APK.cmd`)
1. Ensure `frontend/.env` is configured with valid production credentials.
2. Run the pre-flight validator:
   ```bash
   node scripts/validate-mobile-env.mjs
   ```
3. Run `BUILD_APK.cmd` or execute Gradle release assembly:
   ```bash
   cd frontend/android
   gradlew assembleRelease -PMYAPP_UPLOAD_STORE_FILE=debug.keystore -PMYAPP_UPLOAD_STORE_PASSWORD=android -PMYAPP_UPLOAD_KEY_ALIAS=androiddebugkey -PMYAPP_UPLOAD_KEY_PASSWORD=android
   ```
4. The output APK will be generated at `skillbridge-app.apk`.

### B. Cloud Build via EAS Build
1. Set secrets in EAS:
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project-ref>.supabase.co"
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon-key>"
   eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://skillbridge-api-pd9c.onrender.com/api/v1"
   ```
2. Trigger the build:
   ```bash
   cd frontend
   eas build --platform android --profile preview
   ```

---

## 5. Verification & Consistency Utilities

To verify that the mobile app, backend API, and admin dashboard are pointing to the exact same Supabase project:
```bash
node scripts/verify-env-consistency.mjs
```

To validate mobile build-time environment variables:
```bash
node scripts/validate-mobile-env.mjs
```
