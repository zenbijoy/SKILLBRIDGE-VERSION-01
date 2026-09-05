import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "@/lib/config";
import { getOAuthRedirectUrl } from "./redirects";
import {
  classifyAuthError,
  logAuthEvent,
  logAuthFailure,
  type ClassifiedAuthError,
} from "./authErrors";
import {
  isNativeGoogleSignInSupported,
  getNativeGoogleSigninModule,
  nativeStatusCodes,
  resetNativeGoogleSignInCache,
} from "./nativeGoogleSignIn";

export { nativeStatusCodes as statusCodes };

// Complete auth session on web if inside a popup or redirect return
if (Platform.OS === "web") {
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch {
    // Graceful fallback if window/document is unavailable during SSR
  }
}

export type OAuthCallbackResult =
  | { type: "code"; code: string }
  | { type: "tokens"; accessToken: string; refreshToken: string; tokenType?: string }
  | { type: "error"; error: string; errorDescription?: string }
  | { type: "none" };

/**
 * Robustly parses OAuth callback URLs for both query parameters (?code=...)
 * and hash fragments (#access_token=... or #code=...) across native and web platforms.
 */
export function parseOAuthCallbackUrl(url: string): OAuthCallbackResult {
  if (!url) return { type: "none" };

  try {
    let queryStr = "";
    let hashStr = "";

    const queryIndex = url.indexOf("?");
    const hashIndex = url.indexOf("#");

    if (queryIndex !== -1 && hashIndex !== -1) {
      if (queryIndex < hashIndex) {
        queryStr = url.substring(queryIndex + 1, hashIndex);
        hashStr = url.substring(hashIndex + 1);
      } else {
        hashStr = url.substring(hashIndex + 1, queryIndex);
        queryStr = url.substring(queryIndex + 1);
      }
    } else if (queryIndex !== -1) {
      queryStr = url.substring(queryIndex + 1);
    } else if (hashIndex !== -1) {
      hashStr = url.substring(hashIndex + 1);
    }

    const queryParams = new URLSearchParams(queryStr);
    const hashParams = new URLSearchParams(hashStr);

    // 1. Check for errors
    const error =
      queryParams.get("error") ||
      hashParams.get("error") ||
      queryParams.get("error_code") ||
      hashParams.get("error_code");
    const errorDescription =
      queryParams.get("error_description") ||
      hashParams.get("error_description") ||
      undefined;

    if (error) {
      return { type: "error", error, errorDescription };
    }

    // 2. Check for PKCE authorization code
    const code = queryParams.get("code") || hashParams.get("code");
    if (code) {
      return { type: "code", code };
    }

    // 3. Check for implicit tokens
    const accessToken =
      queryParams.get("access_token") || hashParams.get("access_token");
    const refreshToken =
      queryParams.get("refresh_token") || hashParams.get("refresh_token");
    const tokenType =
      queryParams.get("token_type") || hashParams.get("token_type") || undefined;

    if (accessToken && refreshToken) {
      return {
        type: "tokens",
        accessToken,
        refreshToken,
        tokenType,
      };
    }

    return { type: "none" };
  } catch {
    return {
      type: "error",
      error: "oauth_callback_invalid",
      errorDescription: "Failed to parse OAuth callback URL",
    };
  }
}

export type GoogleOAuthResult =
  | { success: true; cancelled: false }
  | { success: false; cancelled: true }
  | { success: false; cancelled: false; error: ClassifiedAuthError };

// Mutual exclusion lock to prevent double-tap race conditions
let isOAuthInProgress = false;

export function isGoogleOAuthBusy(): boolean {
  return isOAuthInProgress;
}

export function resetGoogleOAuthBusyState(): void {
  isOAuthInProgress = false;
}

let isGoogleSigninConfigured = false;

/**
 * Ensures GoogleSignin is configured with the Web Client ID and optional iOS Client ID.
 */
export function configureGoogleSignIn(): void {
  if (isGoogleSigninConfigured || Platform.OS === "web") return;
  const nativeModule = getNativeGoogleSigninModule();
  if (!nativeModule?.GoogleSignin) return;

  try {
    nativeModule.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      scopes: ["profile", "email"],
      offlineAccess: true,
    });
    isGoogleSigninConfigured = true;
  } catch (err) {
    console.warn("[GoogleSignIn] Failed to configure native Google Sign-In:", err);
  }
}

export function resetGoogleSignInConfigState(): void {
  isGoogleSigninConfigured = false;
  resetNativeGoogleSignInCache();
}

/**
 * Initiates production-hardened Google Sign-In flow across all platforms:
 *
 * 1. Web:
 *    Triggers standard Supabase browser redirect OAuth flow.
 *
 * 2. Native with compiled RNGoogleSignin TurboModule (Android / iOS):
 *    Invokes Native Google Sign-In / Credential Manager via GoogleSignin.signIn()
 *    Obtains Google ID Token -> authenticates with Supabase via signInWithIdToken
 *
 * 3. Native Fallback (Expo Go or dev client without compiled RNGoogleSignin):
 *    Opens WebBrowser auth session with Supabase OAuth and exchanges PKCE / tokens cleanly.
 */
export async function signInWithGoogle(): Promise<GoogleOAuthResult> {
  if (isOAuthInProgress) {
    return {
      success: false,
      cancelled: false,
      error: {
        category: "OAUTH_UNKNOWN",
        title: "Please wait",
        message: "A sign-in request is already in progress.",
        rawMessage: "OAuth request in progress",
        isNetworkError: false,
      },
    };
  }

  isOAuthInProgress = true;

  try {
    const platform = Platform.OS;

    // 1. Web Platform (Browser Redirect Flow)
    if (platform === "web") {
      logAuthEvent("oauth_google_started", {
        provider: "google",
        platform,
        flow: "web_oauth",
      });

      const redirectTo = getOAuthRedirectUrl("/auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) throw error;
      if (data?.url && typeof window !== "undefined" && window.location) {
        window.location.assign(data.url);
      }
      return { success: true, cancelled: false };
    }

    // 2. Native Platform with compiled RNGoogleSignin module
    const nativeModule = isNativeGoogleSignInSupported() ? getNativeGoogleSigninModule() : null;

    if (nativeModule?.GoogleSignin) {
      logAuthEvent("oauth_google_started", {
        provider: "google",
        platform,
        flow: "native_id_token",
      });

      configureGoogleSignIn();

      // Verify Google Play Services on Android
      if (platform === "android") {
        await nativeModule.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      // Trigger native Google Sign-In modal / Android Credential Manager
      const response = await nativeModule.GoogleSignin.signIn();

      if (response?.type === "cancelled") {
        logAuthEvent("oauth_google_cancelled", {
          provider: "google",
          platform,
        });
        return { success: false, cancelled: true };
      }

      const idToken = response?.data?.idToken;
      if (!idToken) {
        throw new Error("No ID token returned by Google authentication.");
      }

      logAuthEvent("oauth_google_callback_received", {
        provider: "google",
        platform,
        flow: "native_id_token",
      });

      // Exchange Google ID Token with Supabase
      const { data: authData, error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (signInError) {
        throw signInError;
      }

      if (!authData?.session) {
        throw new Error("Failed to establish Supabase session from Google ID token.");
      }

      logAuthEvent("oauth_google_session_created", {
        provider: "google",
        platform,
        flow: "native_id_token",
      });

      return { success: true, cancelled: false };
    }

    // 3. Native Platform Fallback (e.g. Expo Go or dev client without compiled RNGoogleSignin)
    logAuthEvent("oauth_google_started", {
      provider: "google",
      platform,
      flow: "mobile_browser_oauth",
    });

    const redirectTo = getOAuthRedirectUrl("/auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) {
      throw new Error("Failed to generate Google OAuth URL.");
    }

    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (authResult.type === "cancel" || authResult.type === "dismiss") {
      logAuthEvent("oauth_google_cancelled", {
        provider: "google",
        platform,
      });
      return { success: false, cancelled: true };
    }

    if (authResult.type === "success" && authResult.url) {
      const parsed = parseOAuthCallbackUrl(authResult.url);
      if (parsed.type === "code") {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
        if (exchangeError) throw exchangeError;
        logAuthEvent("oauth_google_session_created", {
          provider: "google",
          platform,
          flow: "mobile_browser_oauth",
        });
        return { success: true, cancelled: false };
      } else if (parsed.type === "tokens") {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (sessionError) throw sessionError;
        logAuthEvent("oauth_google_session_created", {
          provider: "google",
          platform,
          flow: "mobile_browser_oauth",
        });
        return { success: true, cancelled: false };
      } else if (parsed.type === "error") {
        throw new Error(parsed.errorDescription || parsed.error);
      }
    }

    return { success: true, cancelled: false };
  } catch (err: any) {
    // Check if cancellation
    const isCancelled =
      err?.code === nativeStatusCodes.SIGN_IN_CANCELLED ||
      err?.code === "12501" ||
      err?.code === 12501 ||
      (typeof err?.message === "string" && (
        err.message.toLowerCase().includes("cancelled") ||
        err.message.toLowerCase().includes("canceled") ||
        err.message.toLowerCase().includes("dismissed")
      ));

    if (isCancelled) {
      logAuthEvent("oauth_google_cancelled", {
        provider: "google",
        platform: Platform.OS,
      });
      return { success: false, cancelled: true };
    }

    const classified = classifyAuthError(err);
    logAuthFailure("oauth_google_failed", {
      provider: "google",
      error: err,
    });
    return {
      success: false,
      cancelled: false,
      error: classified,
    };
  } finally {
    isOAuthInProgress = false;
  }
}
