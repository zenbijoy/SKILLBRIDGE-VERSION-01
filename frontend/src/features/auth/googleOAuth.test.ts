import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import {
  signInWithGoogle,
  parseOAuthCallbackUrl,
  isGoogleOAuthBusy,
  resetGoogleOAuthBusyState,
} from "./googleOAuth";

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
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

describe("signInWithGoogle (Native Flow)", () => {
  beforeEach(() => {
    resetGoogleOAuthBusyState();
    jest.clearAllMocks();
    Platform.OS = "android";
  });

  it("Test 1 — opens native browser auth session with OAuth URL and redirect", async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock-ref.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "success",
      url: "skillbridge://auth/callback?code=valid_code_123",
    });
    (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValueOnce({
      data: { session: { access_token: "mock_token" }, user: { id: "user_1" } },
      error: null,
    });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: "mock_token" } },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "skillbridge://auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://mock-ref.supabase.co/auth/v1/authorize?provider=google",
      "skillbridge://auth/callback"
    );
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("valid_code_123");
    expect(result).toEqual({ success: true, cancelled: false });
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 2 — handles missing OAuth URL from Supabase gracefully", async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: null },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    if (!result.success && !result.cancelled) {
      expect(result.error.category).toBe("AUTH_UNKNOWN");
    }
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 3 — handles user cancellation/dismissal gracefully without error alert", async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock-ref.supabase.co/auth/v1/authorize" },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "cancel",
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: false, cancelled: true });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 4 — exchanges PKCE authorization code exactly once", async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock-ref.supabase.co/auth/v1/authorize" },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "success",
      url: "skillbridge://auth/callback?code=single_use_code",
    });
    (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValueOnce({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });

    const result = await signInWithGoogle();

    expect(result.success).toBe(true);
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("single_use_code");
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 5 — handles invalid callback with error cleanly", async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({
      data: { url: "https://mock-ref.supabase.co/auth/v1/authorize" },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "success",
      url: "skillbridge://auth/callback?error=server_error&error_description=Google+error",
    });

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 6 — prevents concurrent double-tap requests", async () => {
    let resolveFirstAuth: (val: any) => void;
    const firstAuthPromise = new Promise((resolve) => {
      resolveFirstAuth = resolve;
    });

    (supabase.auth.signInWithOAuth as jest.Mock).mockImplementationOnce(() => firstAuthPromise);

    const firstCallPromise = signInWithGoogle();
    const secondCallResult = await signInWithGoogle();

    expect(secondCallResult.success).toBe(false);
    if (!secondCallResult.success && !secondCallResult.cancelled) {
      expect(secondCallResult.error.title).toBe("Please wait");
    }

    // Resolve first
    resolveFirstAuth!({
      data: { url: "https://mock.url" },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: "cancel",
    });

    const firstResult = await firstCallPromise;
    expect(firstResult.cancelled).toBe(true);
    expect(isGoogleOAuthBusy()).toBe(false);
  });

  it("Test 7 — handles Web platform OAuth initiation", async () => {
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
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, cancelled: false });
    expect(isGoogleOAuthBusy()).toBe(false);
  });
});

