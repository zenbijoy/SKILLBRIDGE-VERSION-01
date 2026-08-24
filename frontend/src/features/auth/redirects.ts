import * as Linking from "expo-linking";
import { Platform } from "react-native";

/**
 * Generates the absolute URL for a given path inside the app.
 * This ensures OAuth and Magic Links return safely to the app or website.
 */
export function getAuthCallbackUrl(path: string = "/auth/callback") {
  if (Platform.OS === "web") {
    // Return absolute origin for web
    return `${window.location.origin}${path}`;
  }

  // Uses expo-linking to construct custom scheme or App Link
  return Linking.createURL(path);
}

export function getResetPasswordRedirect() {
  return getAuthCallbackUrl("/auth/reset-password");
}

export function getSignUpRedirect() {
  return getAuthCallbackUrl("/auth/callback");
}
