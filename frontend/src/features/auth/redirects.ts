import * as Linking from "expo-linking";
import { Platform } from "react-native";

export const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_URL || "https://skillbridge-kappa.vercel.app";

/**
 * Generates the in-app deep link or web URL for a given path.
 * For native platforms, returns custom scheme (e.g. skillbridge://auth/callback).
 * For web, returns origin URL (e.g. https://skillbridge-kappa.vercel.app/auth/callback).
 */
export function getAuthCallbackUrl(path: string = "/auth/callback"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }

  try {
    // Uses expo-linking to construct custom scheme (e.g. skillbridge://auth/callback)
    return Linking.createURL(normalizedPath, { scheme: "skillbridge" });
  } catch {
    // Deterministic fallback for test/bare environments without injected manifest
    return `skillbridge://${normalizedPath.replace(/^\/+/, "")}`;
  }
}

/**
 * Canonical helper for OAuth redirects (uses native deep link on mobile)
 */
export function getOAuthRedirectUrl(path: string = "/auth/callback"): string {
  return getAuthCallbackUrl(path);
}

/**
 * Canonical helper for Email Verification & Password Reset links.
 * Standard email clients (Gmail, Outlook, Apple Mail) only support HTTPS links.
 * This URL directs the user to the web callback landing page, which then
 * attempts to launch the mobile app first, falling back to the web app if not installed.
 */
export function getEmailConfirmationUrl(path: string = "/auth/callback"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }
  return `${WEB_APP_URL.replace(/\/+$/, "")}${normalizedPath}`;
}

export function getResetPasswordRedirect(): string {
  return getEmailConfirmationUrl("/auth/reset-password");
}

export function getSignUpRedirect(): string {
  return getEmailConfirmationUrl("/auth/callback");
}


