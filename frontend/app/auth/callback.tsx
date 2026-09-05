import { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, View, Platform, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme, spacing } from "@/theme";
import { Button, Loading, Screen } from "@/components/ui";
import { classifyAuthError, logAuthEvent, logAuthFailure } from "@/features/auth/authErrors";

export default function AuthCallback() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const [errorMsg, setErrorMsg] = useState("");
  const [isMobileWeb, setIsMobileWeb] = useState(false);
  const [appLaunchAttempted, setAppLaunchAttempted] = useState(false);
  const processedRef = useRef(false);

  useEffect(() => {
    async function handleCallback() {
      if (processedRef.current) return;
      processedRef.current = true;

      try {
        logAuthEvent("oauth_google_callback_received", {
          hasCode: Boolean(params.code),
          hasTokens: Boolean(params.access_token && params.refresh_token),
        });

        // 1. Check for explicit error parameters
        if (params.error) {
          throw new Error(
            params.error_description?.toString() ||
              params.error?.toString() ||
              "An error occurred during authentication."
          );
        }

        let authenticated = false;

        // 2. Handle OAuth code exchange (PKCE)
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            params.code.toString()
          );
          if (error) {
            const { data: fallbackSession } = await supabase.auth.getSession();
            if (!fallbackSession?.session) {
              throw error;
            }
          }
          authenticated = true;
          logAuthEvent("oauth_google_session_created");
        }

        // 3. Handle Magic Link / Tokens from query parameters
        if (!authenticated && params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token.toString(),
            refresh_token: params.refresh_token.toString(),
          });
          if (error) throw error;
          authenticated = true;
        }

        // 4. Handle Hash fragment on Web (e.g. #access_token=...&refresh_token=...)
        if (!authenticated && typeof window !== "undefined" && window.location?.hash) {
          const hashParams = new URLSearchParams(
            window.location.hash.replace(/^#/, "")
          );
          const hashError =
            hashParams.get("error_description") || hashParams.get("error");
          if (hashError) {
            throw new Error(hashError);
          }

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            authenticated = true;
          }
        }

        // 5. Check if session was already established or restored
        if (!authenticated) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session) {
            authenticated = true;
          }
        }

        if (!authenticated) {
          throw new Error("Invalid or missing authentication tokens.");
        }

        // Handle Password Recovery redirect
        if (params.type === "recovery") {
          router.replace("/auth/reset-password" as any);
          return;
        }

        // Native App: Navigate directly to Tabs
        if (Platform.OS !== "web") {
          router.replace("/(tabs)" as any);
          return;
        }

        // Web Environment: Check if user is on a mobile device
        const isMobile =
          typeof navigator !== "undefined" &&
          /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          );

        if (isMobile && typeof window !== "undefined") {
          setIsMobileWeb(true);
          setAppLaunchAttempted(true);

          // Deep link to reopen the installed native app
          const appDeepLink = `skillbridge://auth/callback${window.location.search || ""}${window.location.hash || ""}`;

          // Try launching the native app
          try {
            window.location.href = appDeepLink;
          } catch {
            // Ignore browser navigation blocks
          }

          // Fallback: If user remains in web browser after 2.5s, proceed to web app
          const fallbackTimer = setTimeout(() => {
            if (typeof document !== "undefined" && !document.hidden) {
              router.replace("/(tabs)" as any);
            }
          }, 2500);

          return () => clearTimeout(fallbackTimer);
        } else {
          // Desktop Web: Smoothly proceed into web dashboard
          router.replace("/(tabs)" as any);
        }
      } catch (err) {
        logAuthFailure("oauth_google_failed", {
          provider: "callback",
          error: err,
        });
        const classified = classifyAuthError(err);
        setErrorMsg(classified.message);
      }
    }

    handleCallback();
  }, [params, router]);

  const handleOpenNativeApp = () => {
    if (typeof window !== "undefined") {
      const appDeepLink = `skillbridge://auth/callback${window.location.search || ""}${window.location.hash || ""}`;
      window.location.href = appDeepLink;
    }
  };

  const handleContinueOnWeb = () => {
    router.replace("/(tabs)" as any);
  };

  if (errorMsg) {
    return (
      <Screen contentStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={[styles.title, { color: colors.text }]}>Authentication Error</Text>
          <Text style={[styles.error, { color: colors.danger }]}>{errorMsg}</Text>
          <View style={styles.btnWrapper}>
            <Button
              title="Return to Sign In"
              onPress={() => router.replace("/(auth)/sign-in" as any)}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (isMobileWeb && appLaunchAttempted) {
    return (
      <Screen contentStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="check-decagram" size={54} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Authentication Confirmed!</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Attempting to open the SkillBridge mobile app...
          </Text>

          <View style={styles.btnWrapper}>
            <Button
              title="Open SkillBridge App"
              onPress={handleOpenNativeApp}
            />
          </View>

          <TouchableOpacity
            onPress={handleContinueOnWeb}
            style={styles.webFallbackBtn}
            activeOpacity={0.7}
          >
            <Text style={[styles.webFallbackText, { color: colors.textSecondary }]}>
              App not installed? <Text style={{ color: colors.primary, fontWeight: "600" }}>Continue on Web</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.container}>
      <Loading label="Authenticating your session..." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: spacing.md,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  error: {
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  btnWrapper: {
    width: "100%",
    marginTop: spacing.lg,
  },
  webFallbackBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
  },
  webFallbackText: {
    fontSize: 14,
  },
});


