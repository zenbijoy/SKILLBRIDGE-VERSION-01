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

/**
 * Safely checks whether the native Google Sign-In TurboModule/legacy module
 * is registered in the native binary, without throwing invariant violations.
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

  try {
    const ReactNative = require("react-native");
    const turbo = ReactNative.TurboModuleRegistry?.get?.("RNGoogleSignin");
    if (turbo != null) return true;

    const legacy = ReactNative.NativeModules?.RNGoogleSignin;
    return legacy != null;
  } catch {
    return false;
  }
}

let cachedModule: any = null;

/**
 * Lazily loads the native Google Sign-In module only if confirmed registered in the binary.
 */
export function getNativeGoogleSigninModule(): any | null {
  if (cachedModule) return cachedModule;
  if (!isNativeGoogleSignInSupported()) return null;

  try {
    // Dynamic require ensures NativeGoogleSignin.js is never evaluated when the native module is missing
    cachedModule = require("@react-native-google-signin/google-signin");
    return cachedModule;
  } catch (e) {
    console.warn("[GoogleSignIn] Could not load native @react-native-google-signin/google-signin module:", e);
    return null;
  }
}

export function resetNativeGoogleSignInCache(): void {
  cachedModule = null;
  testMockOverride = null;
}
