import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { H2, Muted, Screen, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

type ToolItem = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  color?: string;
};

export default function ToolsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const me = meQuery.data?.profile;

  const academicTools: ToolItem[] = [
    {
      icon: "help-circle-outline",
      title: t("tools.askHelpTitle"),
      subtitle: t("tools.askHelpSubtitle"),
      route: "/help/questions",
      color: colors.primary,
    },
    {
      icon: "flask-outline",
      title: t("tools.researchHubTitle"),
      subtitle: t("tools.researchHubSubtitle"),
      route: "/research",
      color: colors.info,
    },
    {
      icon: "brain",
      title: t("tools.skillQuizzesTitle"),
      subtitle: t("tools.skillQuizzesSubtitle"),
      route: "/quiz",
      color: "#8B5CF6",
    },
    {
      icon: "calendar-clock",
      title: t("tools.academicScheduleTitle"),
      subtitle: t("tools.academicScheduleSubtitle"),
      route: "/schedule",
      color: colors.accent,
    },
    {
      icon: "calendar-check-outline",
      title: t("tools.tutorBookingsTitle"),
      subtitle: t("tools.tutorBookingsSubtitle"),
      route: "/bookings",
      color: colors.success,
    },
  ];

  const communityTools: ToolItem[] = [
    {
      icon: "account-group-outline",
      title: t("tools.studentClubsTitle"),
      subtitle: t("tools.studentClubsSubtitle"),
      route: "/clubs",
      color: colors.warning,
    },
    {
      icon: "calendar-star",
      title: t("tools.campusEventsTitle"),
      subtitle: t("tools.campusEventsSubtitle"),
      route: "/events",
      color: colors.danger,
    },
    {
      icon: "trophy-outline",
      title: t("tools.campusLeaderboardTitle"),
      subtitle: t("tools.campusLeaderboardSubtitle"),
      route: "/leaderboard",
      color: "#EAB308",
    },
    {
      icon: "bookmark-multiple-outline",
      title: t("tools.savedMaterialsTitle"),
      subtitle: t("tools.savedMaterialsSubtitle"),
      route: "/saved",
      color: colors.primary,
    },
  ];

  const preferencesTools: ToolItem[] = [
    {
      icon: "tune-variant",
      title: t("tools.customizeFeedTitle"),
      subtitle: t("tools.customizeFeedSubtitle"),
      route: "/dashboard/customize",
      color: colors.primary,
    },
    {
      icon: "youtube",
      title: t("tools.mediaIntegrationsTitle"),
      subtitle: t("tools.mediaIntegrationsSubtitle"),
      route: "/settings/integrations",
      color: "#EF4444",
    },
    {
      icon: "cog-outline",
      title: t("tools.settingsPrivacyTitle"),
      subtitle: t("tools.settingsPrivacySubtitle"),
      route: "/settings",
      color: colors.muted,
    },
  ];

  const renderSection = (title: string, items: ToolItem[]) => (
    <View style={s.sectionWrap}>
      <Text style={[s.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[s.groupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <Pressable
              key={item.title}
              onPress={() => {
                triggerHaptic();
                router.push(item.route as any);
              }}
              style={({ pressed }) => [
                s.row,
                { backgroundColor: pressed ? colors.surface2 : "transparent" },
                !isLast && { borderBottomColor: colors.divider, borderBottomWidth: 1 },
              ]}
            >
              <View style={[s.iconBox, { backgroundColor: `${item.color || colors.primary}18` }]}>
                <MaterialCommunityIcons name={item.icon} size={20} color={item.color || colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.itemTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[s.itemSubtitle, { color: colors.muted }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen
      header={
        <AppHeader
          title={t("nav.tools")}
          searchPlaceholder={t("tools.searchPlaceholder")}
        />
      }
      onRefresh={async () => {
        await meQuery.refetch();
      }}
      refreshing={meQuery.isRefetching}
    >
      {/* User Quick Profile Card */}
      {me ? (
        <Pressable
          onPress={() => {
            triggerHaptic();
            router.push("/(tabs)/profile" as any);
          }}
          style={({ pressed }) => [
            s.profileCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <View style={[s.avatarCircle, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>
              {me.full_name?.[0] || "U"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.profileName, { color: colors.text }]}>{me.full_name}</Text>
            <Muted numberOfLines={1}>@{me.username} · {me.university || "SkillBridge Member"}</Muted>
          </View>
          <View style={[s.viewProfilePill, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>{t("tools.viewProfile")}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Sections */}
      {renderSection(t("tools.academicEngines"), academicTools)}
      {renderSection(t("tools.communityCampus"), communityTools)}
      {renderSection(t("tools.preferencesConfig"), preferencesTools)}
    </Screen>
  );
}

const s = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 15,
    fontWeight: "700",
  },
  viewProfilePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sectionWrap: {
    marginTop: spacing.sm,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  groupCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemSubtitle: {
    fontSize: 12,
  },
});
