import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IconButton, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/state/useAppStore";

type NotificationItem = { id: string; read_at?: string | null };

export function HomeNavbar() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { cachedProfile } = useAppStore();

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const unread = notifications.data?.notifications.filter((item) => !item.read_at).length ?? 0;

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () =>
      api<{ connections: any[]; incoming: any[]; suggested: any[] }>("/connections"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const pendingRequestsCount = connectionsQuery.data?.incoming?.length ?? 0;

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;

  return (
    <View style={s.container}>
      {/* Top Left: Offline-First User Avatar */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to profile"
        onPress={() => {
          triggerHaptic();
          router.push("/profile" as any);
        }}
        style={({ pressed }) => [
          s.avatarButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={s.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[s.avatarFallback, { backgroundColor: colors.primarySoft }]}>
            <Text style={[s.avatarInitial, { color: colors.primary }]}>{initial}</Text>
          </View>
        )}
      </Pressable>

      {/* Center Left: Calendar Hub Icon Button */}
      <View style={s.leftActionsRow}>
        <IconButton
          icon="calendar-month-outline"
          label={t("feed.routineCalendar", "Academic Calendar")}
          onPress={() => {
            triggerHaptic();
            router.push("/schedule" as any);
          }}
        />

        {/* Network & Connection Requests Icon Button with real-time pending badge */}
        <IconButton
          icon="account-multiple-outline"
          label="Network & Connection Requests"
          badge={pendingRequestsCount}
          onPress={() => {
            triggerHaptic();
            router.push("/connections" as any);
          }}
        />
      </View>

      {/* Right: Actions Cluster (Search, Notifications) */}
      <View style={s.actionsRow}>
        <IconButton
          icon="magnify"
          label={t("search.title")}
          onPress={() => {
            triggerHaptic();
            router.push("/search" as any);
          }}
        />
        <IconButton
          icon="bell-outline"
          label={t("notifications.title")}
          badge={unread}
          onPress={() => {
            triggerHaptic();
            router.push("/notifications" as any);
          }}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
    gap: 8,
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "800",
  },
  leftActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginLeft: 4,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
