import { Platform } from "react-native";

export const nativeStatusCodes = Object.freeze({
  SIGN_IN_CANCELLED: "12501",
  IN_PROGRESS: "12502",
  PLAY_SERVICES_NOT_AVAILABLE: "12500",
  SIGN_IN_REQUIRED: "4",
});

let testMockOverride: boolean | null = null;

/**
 * Allows test suites to explicitly simulate presence or absence of native Google Sign-In module.
 */
export function setNativeGoogleSignInSupportedForTesting(supported: boolean | null): void {
  testMockOverride = supported;
}

let cachedModule: any = null;

/**
 * Lazily loads the native Google Sign-In module only if confirmed registered in the binary.
 */
export function getNativeGoogleSigninModule(): any | null {
  if (cachedModule) return cachedModule;
  if (Platform.OS === "web") return null;

  if (testMockOverride === false) {
    return null;
  }

  try {
    cachedModule = require("@react-native-google-signin/google-signin");
    return cachedModule;
  } catch (e) {
    console.warn("[GoogleSignIn] Could not load native @react-native-google-signin/google-signin module:", e);
    return null;
  }
}

/**
 * Safely checks whether the native Google Sign-In module is registered in the native binary.
 */
export function isNativeGoogleSignInSupported(): boolean {
  if (Platform.OS === "web") return false;

  if (testMockOverride !== null) {
    return testMockOverride;
  }

  // Default to true in Jest unless explicitly overridden, so existing native test mocks work
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const mod = getNativeGoogleSigninModule();
  return Boolean(mod?.GoogleSignin);
}

export function resetNativeGoogleSignInCache(): void {
  cachedModule = null;
  testMockOverride = null;
}
