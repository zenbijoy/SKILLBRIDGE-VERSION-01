import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/hooks/useSession";
import { registerPush, useNotificationRouting } from "@/lib/notifications";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useTheme } from "@/theme";

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
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const pushEnabled = usePreferencesStore((state) => state.pushEnabled);
  const { colors } = useTheme();

  useNotificationRouting(router);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/welcome");
    if (session && inAuth) router.replace("/(tabs)");
  }, [session, loading, segments, router]);

  useEffect(() => {
    if (!loading && session?.user.id && pushEnabled) {
      registerPush().catch(() => undefined);
    }
  }, [loading, session?.user.id, pushEnabled]);

  return (
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
      <Stack.Screen name="settings/language" options={{ title: "Language & Region" }} />
      <Stack.Screen name="settings/appearance" options={{ title: "Appearance" }} />
      <Stack.Screen name="settings/notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="settings/data-storage" options={{ title: "Data & Storage" }} />
      <Stack.Screen name="settings/accessibility" options={{ title: "Accessibility" }} />
      <Stack.Screen name="settings/security" options={{ title: "Security" }} />
      <Stack.Screen name="settings/about" options={{ title: "About" }} />
      <Stack.Screen name="room/[id]" options={{ title: "Learning room" }} />
      <Stack.Screen name="user/[id]" options={{ title: "Profile" }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen name="live/[roomId]" options={{ title: "Live classroom" }} />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function Layout() {
  return (
    <QueryClientProvider client={client}>
      <ThemedStatusBar />
      <Gate />
    </QueryClientProvider>
  );
}
