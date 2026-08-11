import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/hooks/useSession";
import { registerPush, useNotificationRouting } from "@/lib/notifications";
import { colors } from "@/theme";
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  
  useNotificationRouting(router);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/welcome");
    if (session && inAuth) {
      router.replace("/(tabs)");
      registerPush().catch(() => undefined);
    }
  }, [session, loading, segments, router]);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="room/[id]" options={{ title: "Learning room" }} />
      <Stack.Screen name="user/[id]" options={{ title: "Profile" }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen
        name="live/[roomId]"
        options={{ title: "Live classroom" }}
      />
    </Stack>
  );
}
export default function Layout() {
  return (
    <QueryClientProvider client={client}>
      <StatusBar style="light" />
      <Gate />
    </QueryClientProvider>
  );
}
