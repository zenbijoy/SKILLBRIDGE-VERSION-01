import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, Platform, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IconButton, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/state/useAppStore";
import { DirectCallModal } from "@/features/calls/components/DirectCallModal";

type NotificationItem = { id: string; read_at?: string | null };

export function HomeNavbar() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const { cachedProfile } = useAppStore();
  const [showDirectCall, setShowDirectCall] = useState(false);

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

  const streakQuery = useQuery({
    queryKey: ["activity-streak"],
    queryFn: () => api<{ current_streak_days: number }>("/activity/streak"),
    staleTime: 30_000,
  });
  const streakDays = streakQuery.data?.current_streak_days ?? 5;

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;
  const { width } = useWindowDimensions();

  // On Web Desktop/Tablet, WebHeader provides the full professional top bar
  if (Platform.OS === "web" && width >= 768) {
    return null;
  }

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

      {/* Top Fire Streak Badge Pill */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View Learning Streak & Usage"
        onPress={() => {
          triggerHaptic();
          router.push("/streak" as any);
        }}
        style={({ pressed }) => [
          s.streakPill,
          {
            backgroundColor: isDark ? "rgba(249, 115, 22, 0.16)" : "#FFF7ED",
            borderColor: isDark ? "rgba(249, 115, 22, 0.35)" : "#FDBA74",
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={s.fireIcon}>🔥</Text>
        <Text style={[s.streakText, { color: isDark ? "#FB923C" : "#EA580C" }]}>
          {streakDays}d
        </Text>
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

        {/* Direct P2P Call Launcher */}
        <IconButton
          icon="phone-outline"
          label="Direct Call"
          onPress={() => {
            triggerHaptic();
            setShowDirectCall(true);
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

      <DirectCallModal visible={showDirectCall} onClose={() => setShowDirectCall(false)} />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
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
    gap: 6,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#F97316",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
  },
  fireIcon: {
    fontSize: 14,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
