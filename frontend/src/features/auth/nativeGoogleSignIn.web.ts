export const nativeStatusCodes = Object.freeze({
  SIGN_IN_CANCELLED: "12501",
  IN_PROGRESS: "12502",
  PLAY_SERVICES_NOT_AVAILABLE: "12500",
  SIGN_IN_REQUIRED: "4",
});

export function setNativeGoogleSignInSupportedForTesting(_supported: boolean | null): void {
  // No-op on web
}

/**
 * Web platform never supports native TurboModule Google Sign-In.
 * Standard web OAuth redirect flow is used instead.
 */
export function isNativeGoogleSignInSupported(): boolean {
  return false;
}

export function getNativeGoogleSigninModule(): null {
  return null;
}

export function resetNativeGoogleSignInCache(): void {
  // No-op on web
}
