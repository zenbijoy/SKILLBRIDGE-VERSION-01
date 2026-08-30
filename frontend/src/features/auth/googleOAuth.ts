import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import { getOAuthRedirectUrl } from "./redirects";
import {
  classifyAuthError,
  logAuthEvent,
  logAuthFailure,
  type ClassifiedAuthError,
} from "./authErrors";

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
    // Extract query string and hash fragment
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

/**
 * Initiates production-hardened Google OAuth flow.
 *
 * Flow:
 * Native (Android / iOS):
 *   1. Generates PKCE code verifier and Supabase authorize URL (skipBrowserRedirect: true)
 *   2. Opens in-app browser auth session via WebBrowser.openAuthSessionAsync
 *   3. Captures returned deep link (skillbridge://auth/callback?code=...)
 *   4. Exchanges PKCE code for Supabase session and stores it securely
 *   5. Emits real-time auth state to AuthProvider
 *
 * Web:
 *   1. Triggers standard Supabase browser redirect
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
    const redirectTo = getOAuthRedirectUrl("/auth/callback");

    logAuthEvent("oauth_google_started", {
      provider: "google",
      platform,
    });
    if (platform === "web") {
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

    // Native Platform (Android / iOS)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error("No authorization URL returned by authentication provider.");
    }

    logAuthEvent("oauth_google_browser_opened", {
      provider: "google",
      platform,
    });

    // Open native browser auth session
    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    // Handle user cancellation / dismissal gracefully
    if (authResult.type === "cancel" || authResult.type === "dismiss") {
      logAuthEvent("oauth_google_cancelled", {
        provider: "google",
        platform,
      });
      return { success: false, cancelled: true };
    }

    if (authResult.type !== "success" || !authResult.url) {
      throw new Error("Browser session closed without returning authentication credentials.");
    }

    logAuthEvent("oauth_google_callback_received", {
      provider: "google",
      platform,
    });

    // Parse returned deep link
    const parsed = parseOAuthCallbackUrl(authResult.url);

    if (parsed.type === "error") {
      throw new Error(parsed.errorDescription || parsed.error || "Authentication callback returned an error.");
    }

    if (parsed.type === "code") {
      // Modern PKCE flow
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        parsed.code
      );
      if (exchangeError) {
        throw exchangeError;
      }
    } else if (parsed.type === "tokens") {
      // Implicit token fallback
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (setSessionError) {
        throw setSessionError;
      }
    } else {
      // If no code or tokens found in callback URL, check if session was already established
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error("No valid authentication code or tokens found in callback.");
      }
    }

    // Verify session
    const { data: finalSessionData } = await supabase.auth.getSession();
    if (!finalSessionData?.session) {
      throw new Error("Failed to initialize authenticated session.");
    }

    logAuthEvent("oauth_google_session_created", {
      provider: "google",
      platform,
    });

    return { success: true, cancelled: false };
  } catch (err) {
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
