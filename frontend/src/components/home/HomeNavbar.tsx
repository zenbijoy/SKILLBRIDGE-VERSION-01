import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IconButton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/state/useAppStore";

type NotificationItem = { id: string; read_at?: string | null };

export function HomeNavbar() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { cachedProfile } = useAppStore();

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unread = notifications.data?.notifications.filter((item) => !item.read_at).length ?? 0;

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

      {/* Center: Calendar & Routine Hub Button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("feed.routineCalendar", "Routine & Calendar")}
        onPress={() => {
          triggerHaptic();
          router.push("/schedule" as any);
        }}
        style={({ pressed }) => [
          s.calendarButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="calendar-clock-outline" size={17} color={colors.primary} />
        <Text style={[s.calendarButtonText, { color: colors.text }]} numberOfLines={1}>
          {t("feed.routineCalendar", "Routine & Calendar")}
        </Text>
      </Pressable>

      {/* Right: Actions Cluster (Customize Feed, Search, Notifications) */}
      <View style={s.actionsRow}>
        <IconButton
          icon="tune-variant"
          label="Customize feed"
          onPress={() => {
            triggerHaptic();
            router.push("/dashboard/customize" as any);
          }}
        />
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
  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  calendarButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
