import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Generates the absolute URL for a given path inside the app.
 * This ensures OAuth and Magic Links return safely to the app or website.
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
 * Canonical helper for OAuth redirects
 */
export function getOAuthRedirectUrl(path: string = "/auth/callback"): string {
  return getAuthCallbackUrl(path);
}

export function getResetPasswordRedirect(): string {
  return getAuthCallbackUrl("/auth/reset-password");
}

export function getSignUpRedirect(): string {
  return getAuthCallbackUrl("/auth/callback");
}

