import { useEffect } from "react";
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { registerPush, useNotificationRouting } from "@/lib/notifications";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useTheme } from "@/theme";
import { api } from "@/lib/api";
import type { Dashboard, Profile } from "@/types";
import { TourProvider } from "@/features/tour/TourContext";
import { TourOverlay } from "@/features/tour/TourOverlay";
import { IncomingCallModal } from "@/features/calls/components/IncomingCallModal";
import { useI18n } from "@/i18n";
import { SkillBridgeLoader } from "@/components/ui";

// Prevent native splash screen from hiding prematurely until session initialization completes
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global error listener for web production diagnostic reporting
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    console.error("[SkillBridge Web Diagnostic Error]", e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[SkillBridge Web Diagnostic Unhandled Rejection]", e.reason);
  });
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
        return failureCount < 2;
      },
      refetchOnReconnect: true,
    },
  },
});

function Gate() {
  const { session, initializing } = useAuth();
  const loading = initializing;
  const segments = useSegments();
  const router = useRouter();
  const pushEnabled = usePreferencesStore((state) => state.pushEnabled);
  const { colors } = useTheme();
  const { t } = useI18n();
  const profileQuery = useQuery({
    queryKey: ["session-profile", session?.user.id],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
    enabled: !loading && Boolean(session),
    staleTime: 30_000,
  });
  const onboardingStatus = profileQuery.data?.profile.onboarding_status;
  const isFirstTimeUser =
    onboardingStatus === "not_started" ||
    (!onboardingStatus && !profileQuery.data?.profile.onboarding_completed);
  const canAccessMainApp =
    onboardingStatus === "completed" ||
    onboardingStatus === "deferred" ||
    onboardingStatus === "in_progress" ||
    onboardingStatus === "skipped" ||
    profileQuery.data?.profile.onboarding_completed === true;

  const experienceQuery = useQuery({
    queryKey: ["dashboard", "learn"],
    queryFn: () => api<Dashboard>("/dashboard?mode=learn"),
    enabled: !loading && Boolean(session) && Boolean(canAccessMainApp),
    staleTime: 30_000,
  });
  const guidedTourEnabled = experienceQuery.data?.featureFlags.guided_tour === true;

  useNotificationRouting(router);

  useEffect(() => {
    if (loading) return;
    const segmentNames = segments as string[];
    const inAuth = segmentNames[0] === "(auth)";
    const inOnboarding = inAuth && segmentNames[1] === "onboarding";
    if (!session) {
      if (!inAuth || inOnboarding) router.replace("/(auth)/welcome");
      return;
    }
    if (profileQuery.isLoading || profileQuery.isError) return;

    if (canAccessMainApp && inAuth && !inOnboarding) {
      router.replace("/(tabs)");
      return;
    }

    if (isFirstTimeUser && inAuth && !inOnboarding) {
      router.replace("/(auth)/onboarding" as never);
    }
  }, [
    session,
    loading,
    segments,
    router,
    canAccessMainApp,
    isFirstTimeUser,
    profileQuery.isError,
    profileQuery.isLoading,
  ]);

  useEffect(() => {
    if (!loading && session?.user.id && pushEnabled) {
      registerPush().catch(() => undefined);
    }
  }, [loading, session?.user.id, pushEnabled]);

  // Connect/disconnect socket based on session state
  useEffect(() => {
    if (!loading && session?.access_token) {
      connectSocket(session.access_token);
    } else if (!loading && !session) {
      disconnectSocket();
    }
    return () => disconnectSocket();
  }, [loading, session]);

  // Hide native splash screen once initial session resolution completes
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return <SkillBridgeLoader fullScreen size="hero" />;
  }

  return (
    <TourProvider enabled={Boolean(session) && canAccessMainApp && guidedTourEnabled}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="search/index" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/profile" options={{ title: t("settings.profile") }} />
        <Stack.Screen name="settings/skills" options={{ title: t("settings.skills") }} />
        <Stack.Screen name="settings/privacy" options={{ title: t("settings.privacy") }} />
        <Stack.Screen name="settings/language" options={{ title: t("settings.languageTitle") }} />
        <Stack.Screen name="settings/appearance" options={{ title: t("settings.appearanceTitle") }} />
        <Stack.Screen name="settings/notifications" options={{ title: t("settings.notificationsTitle") }} />
        <Stack.Screen name="settings/data-storage" options={{ title: t("settings.dataTitle") }} />
        <Stack.Screen name="settings/accessibility" options={{ title: t("settings.accessibilityTitle") }} />
        <Stack.Screen name="settings/security" options={{ title: t("settings.securityTitle") }} />
        <Stack.Screen name="settings/about" options={{ title: t("settings.about") }} />
        <Stack.Screen name="dashboard/customize" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ title: "Learning room" }} />
        <Stack.Screen name="user/[id]" options={{ title: "Profile" }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Conversation" }} />
        <Stack.Screen name="live/[roomId]" options={{ title: "Live classroom" }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false }} />
      </Stack>
      <TourOverlay />
      <IncomingCallModal />
    </TourProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={layoutStyles.errorContainer}>
      <Text style={layoutStyles.errorTitle}>SkillBridge Encountered an Issue</Text>
      <Text style={layoutStyles.errorMessage}>
        {error?.message || "An unexpected error occurred. Please refresh or try again."}
      </Text>
      <Pressable style={layoutStyles.errorButton} onPress={retry}>
        <Text style={layoutStyles.errorButtonText}>Reload SkillBridge</Text>
      </Pressable>
    </View>
  );
}

export default function Layout() {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ThemedStatusBar />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

const layoutStyles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#07111F",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    color: "#91A4BD",
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
    maxWidth: 360,
  },
  errorButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});

