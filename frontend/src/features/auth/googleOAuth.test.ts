import { Platform } from "react-native";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";
import { openAuthSessionAsync } from "expo-web-browser";
import { setNativeGoogleSignInSupportedForTesting } from "./nativeGoogleSignIn";
import {
  signInWithGoogle,
  parseOAuthCallbackUrl,
  isGoogleOAuthBusy,
  resetGoogleOAuthBusyState,
  resetGoogleSignInConfigState,
} from "./googleOAuth";

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: "12501",
    IN_PROGRESS: "12502",
    PLAY_SERVICES_NOT_AVAILABLE: "12500",
    SIGN_IN_REQUIRED: "4",
  },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      signInWithIdToken: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

describe("parseOAuthCallbackUrl", () => {
  it("parses PKCE authorization code from query parameters", () => {
    const url = "skillbridge://auth/callback?code=pkce_test_code_123";
    const result = parseOAuthCallbackUrl(url);
    expect(result).toEqual({
      type: "code",
      code: "pkce_test_code_123",
    });
  });

  it("parses PKCE authorization code from hash fragments", () => {
    const url = "skillbridge://auth/callback#code=hash_pkce_code_456";
    const result = parseOAuthCallbackUrl(url);
    expect(result).toEqual({
      type: "code",
      code: "hash_pkce_code_456",
    });
  });

  it("parses implicit tokens from hash fragments", () => {
    const url =
      "skillbridge://auth/callback#access_token=test_access_token&refresh_token=test_refresh_token&token_type=bearer";
    const result = parseOAuthCallbackUrl(url);
    expect(result).toEqual({
      type: "tokens",
      accessToken: "test_access_token",
      refreshToken: "test_refresh_token",
      tokenType: "bearer",
    });
  });

  it("parses error and error_description from callback", () => {
    const url =
      "skillbridge://auth/callback?error=access_denied&error_description=User+denied+access";
    const result = parseOAuthCallbackUrl(url);
    expect(result).toEqual({
      type: "error",
      error: "access_denied",
      errorDescription: "User denied access",
    });
  });

  it("returns none for empty or unrelated URLs", () => {
    expect(parseOAuthCallbackUrl("")).toEqual({ type: "none" });
    expect(parseOAuthCallbackUrl("skillbridge://home")).toEqual({ type: "none" });
  });
});

describe("signInWithGoogle (Native ID Token Flow)", () => {
  beforeEach(() => {
    resetGoogleOAuthBusyState();
    resetGoogleSignInConfigState();
    jest.clearAllMocks();
    Platform.OS = "android";
  });

  it("Test 1 — signs in with native Google credential and exchanges ID token with Supabase", async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
      type: "success",
      data: {
        idToken: "mock_google_id_token_xyz",
        user: {
          id: "google_user_1",
          email: "student@campus.edu",
          name: "Campus Student",
        },
      },
    });
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValueOnce({
      data: {
        session: { access_token: "supabase_session_token_123" },
        user: { id: "sb_user_1", email: "student@campus.edu" },
      },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(GoogleSignin.hasPlayServices).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true,
    });
    expect(GoogleSignin.signIn).toHaveBeenCalled();
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "mock_google_id_token_xyz",
    });
    expect(result).toEqual({ success: true, cancelled: false });
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 2 — handles user cancellation via response type gracefully", async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
      type: "cancelled",
      data: null,
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: false, cancelled: true });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 3 — handles user cancellation via error code gracefully", async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    const cancelError = new Error("User cancelled the sign in");
    (cancelError as any).code = statusCodes.SIGN_IN_CANCELLED;
    (GoogleSignin.signIn as jest.Mock).mockRejectedValueOnce(cancelError);

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: false, cancelled: true });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 4 — handles missing ID token from Google response gracefully", async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
      type: "success",
      data: {
        idToken: null,
      },
    });

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(false);
    if (!result.success && !result.cancelled) {
      expect(result.error.category).toBe("OAUTH_UNKNOWN");
      expect(result.error.message).toContain("No ID token");
    }
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 5 — handles Supabase signInWithIdToken error cleanly", async () => {
    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
      type: "success",
      data: {
        idToken: "mock_google_id_token",
      },
    });
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error("Invalid Google token or provider disabled"),
    });

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "mock_google_id_token",
    });
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 6 — prevents concurrent double-tap sign-in requests", async () => {
    let resolveFirstAuth: (val: any) => void;
    const firstAuthPromise = new Promise((resolve) => {
      resolveFirstAuth = resolve;
    });

    (GoogleSignin.hasPlayServices as jest.Mock).mockResolvedValueOnce(true);
    (GoogleSignin.signIn as jest.Mock).mockImplementationOnce(() => firstAuthPromise);

    const firstCallPromise = signInWithGoogle();
    const secondCallResult = await signInWithGoogle();

    expect(secondCallResult.success).toBe(false);
    if (!secondCallResult.success && !secondCallResult.cancelled) {
      expect(secondCallResult.error.title).toBe("Please wait");
    }

    // Resolve first with cancelled
    resolveFirstAuth!({
      type: "cancelled",
      data: null,
    });

    const firstResult = await firstCallPromise;
    expect(firstResult.cancelled).toBe(true);
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 7 — handles Play Services unavailable error", async () => {
    const playServicesError = new Error("Google Play Services not available");
    (playServicesError as any).code = statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
    (GoogleSignin.hasPlayServices as jest.Mock).mockRejectedValueOnce(playServicesError);

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(false);
    if (!result.success && !result.cancelled) {
      expect(result.error.title).toBe("Google Play Services unavailable");
    }
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 8 — handles Web platform via browser OAuth redirect", async () => {
    Platform.OS = "web";
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock.url" },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "skillbridge://auth/callback",
        queryParams: { prompt: "select_account" },
      },
    });
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, cancelled: false });
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 9 — falls back to WebBrowser on mobile when native Google Sign-In is unavailable (e.g. Expo Go)", async () => {
    Platform.OS = "android";
    setNativeGoogleSignInSupportedForTesting(false);

    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    (openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "success",
      url: "skillbridge://auth/callback?code=pkce_code_from_browser_flow",
    });
    (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValueOnce({
      data: { session: { access_token: "mock_session_token" } },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "skillbridge://auth/callback",
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://mock.supabase.co/auth/v1/authorize?provider=google",
      "skillbridge://auth/callback"
    );
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce_code_from_browser_flow");
    expect(result).toEqual({ success: true, cancelled: false });
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 10 — handles user cancellation in mobile WebBrowser fallback cleanly", async () => {
    Platform.OS = "android";
    setNativeGoogleSignInSupportedForTesting(false);

    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    (openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "cancel",
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: false, cancelled: true });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });
});
