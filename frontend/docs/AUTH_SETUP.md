# SkillBridge Auth & Deep Linking Setup

This guide details the authentication architecture overhaul implemented for SkillBridge, enabling a robust, cross-platform authentication experience with premium animations, deep linking, and single-source-of-truth session management.

## 1. Authentication Architecture

The application now uses a centralized `AuthProvider` (`src/features/auth/AuthProvider.tsx`) that acts as the single source of truth for the user's session. It replaces the old, fragmented `useSession` hook.

### `AuthProvider` Benefits:
- **Centralized State**: The `session` and `user` state are managed globally.
- **Initialization State**: The `initializing` flag prevents the "flash of unauthenticated content" (FOUC) when the app starts.
- **Reactive**: Listens to Supabase `onAuthStateChange` events automatically.

## 2. Supabase Storage Adapter

To ensure sessions persist correctly across both Web and Native Android/iOS, `src/lib/supabase.ts` now dynamically selects its storage adapter:
- **Web**: Uses `window.localStorage`
- **Native (Expo)**: Uses `expo-secure-store` via `ExpoSecureStoreAdapter`. This ensures auth tokens are encrypted on device rather than stored in plain text Async Storage.

## 3. Deep Linking & OAuth Callbacks

A universal callback handler was introduced at `app/auth/callback.tsx`. This screen intelligently handles both Magic Links and OAuth redirects, routing the user to the correct location (e.g., Tab bar or Reset Password screen).

### Universal Links / Deep Links Setup
To ensure deep links route back to your app after OAuth or Magic Link sign-ins, you must configure the following in your Supabase Dashboard (Authentication -> URL Configuration):

**Site URL**:
- Production: `https://your-skillbridge-domain.com`

**Redirect URLs**:
- `skillbridge://auth/callback` (For Native App)
- `skillbridge://auth/reset-password` (For Native App Reset Flow)
- `https://your-skillbridge-domain.com/auth/callback` (For Web)
- `https://your-skillbridge-domain.com/auth/reset-password` (For Web Reset Flow)

The helper function `getAuthCallbackUrl()` automatically constructs the correct redirect URL based on whether the app is running on Web or Native.

## 4. UI/UX Overhaul

The auth flow (`sign-in`, `sign-up`, `forgot-password`, `reset-password`) has been completely overhauled:
- **`ScreenContainer`**: Replaces raw `SafeAreaView` usage, automatically handling `KeyboardAvoidingView` based on the platform.
- **`AppTextField`**: A premium text input component with floating labels and Reanimated color interpolations.
- **`PasswordField`**: Includes an inline password strength checker (length, case, number) with Reanimated fade transitions.
- **`Button`**: Upgraded with spring scaling on press and hover states for Web. Includes a new `social` variant for Google/Facebook buttons.

These components fulfill the requirement for "wonderful transition, and more" while strictly preserving the underlying API and database integrations.
