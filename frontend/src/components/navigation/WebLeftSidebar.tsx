import React from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import { router, usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/state/useAppStore";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface ClubItem {
  id: string;
  name: string;
  avatar_url?: string | null;
  category?: string;
  member_count?: number;
}

export function WebLeftSidebar() {
  const { colors, isDark } = useTheme();
  const pathname = usePathname();
  const { cachedProfile } = useAppStore();

  const clubsQuery = useQuery({
    queryKey: ["web-sidebar-clubs"],
    queryFn: () => api<{ clubs: ClubItem[] }>("/clubs?limit=4"),
    staleTime: 60_000,
  });
  const myClubs = clubsQuery.data?.clubs || [];

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;

  const NAV_SECTIONS = [
    {
      title: "CAMPUS & SOCIAL",
      items: [
        {
          icon: "newspaper-variant",
          label: "Campus Feed",
          route: "/feed",
          color: "#3B82F6",
          active: pathname === "/feed" || pathname === "/" || pathname === "/(tabs)",
        },
        {
          icon: "compass-outline",
          label: "Discover Mentors",
          route: "/(tabs)/discover",
          color: "#8B5CF6",
          active: pathname.startsWith("/(tabs)/discover"),
        },
        {
          icon: "door-open",
          label: "Live Study Rooms",
          route: "/(tabs)/rooms",
          color: "#10B981",
          active: pathname.startsWith("/(tabs)/rooms") || pathname.startsWith("/room"),
        },
        {
          icon: "account-multiple-outline",
          label: "My Network",
          route: "/connections",
          color: "#F59E0B",
          active: pathname.startsWith("/connections"),
        },
        {
          icon: "chat-processing-outline",
          label: "Messages & Chat",
          route: "/(tabs)/inbox",
          color: "#06B6D4",
          active: pathname.startsWith("/(tabs)/inbox") || pathname.startsWith("/chat"),
        },
      ],
    },
    {
      title: "ACADEMICS & STUDY",
      items: [
        {
          icon: "calendar-clock",
          label: "Study Schedule",
          route: "/schedule",
          color: "#6366F1",
          active: pathname.startsWith("/schedule") || pathname.startsWith("/calendar"),
        },
        {
          icon: "calendar-check",
          label: "Mentorship Bookings",
          route: "/bookings",
          color: "#EC4899",
          active: pathname.startsWith("/bookings") || pathname.startsWith("/booking"),
        },
        {
          icon: "archive-outline",
          label: "Study Vault",
          route: "/vault",
          color: "#14B8A6",
          active: pathname.startsWith("/vault"),
        },
        {
          icon: "target",
          label: "Learning Goals",
          route: "/goals",
          color: "#F97316",
          active: pathname.startsWith("/goals"),
        },
        {
          icon: "notebook-outline",
          label: "Daily Planner",
          route: "/planner",
          color: "#84CC16",
          active: pathname.startsWith("/planner"),
        },
        {
          icon: "chart-line-variant",
          label: "Progress Analytics",
          route: "/progress",
          color: "#A855F7",
          active: pathname.startsWith("/progress"),
        },
      ],
    },
    {
      title: "COMMUNITY & BADGES",
      items: [
        {
          icon: "shield-account",
          label: "Student Clubs",
          route: "/clubs",
          color: "#3B82F6",
          active: pathname.startsWith("/clubs") || pathname.startsWith("/club"),
        },
        {
          icon: "trophy-outline",
          label: "Leaderboard",
          route: "/leaderboard",
          color: "#EAB308",
          active: pathname.startsWith("/leaderboard"),
        },
        {
          icon: "lightning-bolt-outline",
          label: "Daily Skill Quiz",
          route: "/quiz",
          color: "#F43F5E",
          active: pathname.startsWith("/quiz"),
        },
        {
          icon: "medal-outline",
          label: "Achievements",
          route: "/achievements",
          color: "#10B981",
          active: pathname.startsWith("/achievements"),
        },
        {
          icon: "bookmark-outline",
          label: "Saved Bookmarks",
          route: "/saved",
          color: "#8B5CF6",
          active: pathname.startsWith("/saved"),
        },
        {
          icon: "flask-outline",
          label: "Research Lab",
          route: "/research",
          color: "#0284C7",
          active: pathname.startsWith("/research"),
        },
        {
          icon: "help-circle-outline",
          label: "Campus Q&A",
          route: "/help/questions",
          color: "#F59E0B",
          active: pathname.startsWith("/help"),
        },
        {
          icon: "cog-outline",
          label: "Settings",
          route: "/settings",
          color: "#64748B",
          active: pathname.startsWith("/settings"),
        },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: 280,
        height: "calc(100vh - 60px)",
        position: "sticky",
        top: 60,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        boxSizing: "border-box",
        overflowY: "auto",
        padding: "16px 12px 24px 12px",
        gap: 16,
      }}
    >
      {/* 1. User Profile Mini-Card */}
      <Pressable
        onPress={() => {
          triggerHaptic();
          router.push("/profile" as any);
        }}
        style={({ pressed }) => [
          styles.profileCard,
          {
            backgroundColor: pressed ? colors.surface2 : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.profileAvatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatarFallback, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
          )}
          <View style={[styles.onlineIndicator, { backgroundColor: "#10B981" }]} />
        </View>

        <View style={styles.profileTextCol}>
          <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
            {cachedProfile?.full_name || "SkillBridge Learner"}
          </Text>
          <Text style={[styles.profileSubtitle, { color: colors.muted }]} numberOfLines={1}>
            {cachedProfile?.bio || "Campus Knowledge Member"}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
      </Pressable>

      {/* 2. Navigation Sections */}
      {NAV_SECTIONS.map((section) => (
        <View key={section.title} style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>{section.title}</Text>
          <View style={styles.sectionItemsWrap}>
            {section.items.map((item) => {
              const isActive = item.active;
              return (
                <Pressable
                  key={item.route}
                  onPress={() => {
                    triggerHaptic();
                    router.push(item.route as any);
                  }}
                  style={({ pressed }) => [
                    styles.navItem,
                    {
                      backgroundColor: isActive
                        ? isDark
                          ? "rgba(37, 99, 235, 0.16)"
                          : "rgba(37, 99, 235, 0.08)"
                        : pressed
                        ? colors.surface2
                        : "transparent",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.itemIconBox,
                      {
                        backgroundColor: isActive ? `${item.color}22` : `${item.color}12`,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={20}
                      color={isActive ? colors.primary : item.color}
                    />
                  </View>
                  <Text
                    style={[
                      styles.itemLabel,
                      {
                        color: isActive ? colors.primary : colors.text,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {isActive ? (
                    <View style={[styles.activePill, { backgroundColor: colors.primary }]} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* 3. My Campus Clubs */}
      {myClubs.length > 0 ? (
        <View style={styles.sectionWrap}>
          <View style={styles.clubsHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>CAMPUS CLUBS</Text>
            <Pressable onPress={() => router.push("/clubs" as any)}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.sectionItemsWrap}>
            {myClubs.map((club) => (
              <Pressable
                key={club.id}
                onPress={() => {
                  triggerHaptic();
                  router.push(`/club/${club.id}` as any);
                }}
                style={({ pressed }) => [
                  styles.clubItemRow,
                  {
                    backgroundColor: pressed ? colors.surface2 : "transparent",
                  },
                ]}
              >
                {club.avatar_url ? (
                  <Image source={{ uri: club.avatar_url }} style={styles.clubAvatar} />
                ) : (
                  <View style={[styles.clubAvatarFallback, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.clubInitial, { color: colors.primary }]}>
                      {club.name[0]?.toUpperCase() || "C"}
                    </Text>
                  </View>
                )}
                <View style={styles.clubTextCol}>
                  <Text style={[styles.clubName, { color: colors.text }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  {club.member_count ? (
                    <Text style={[styles.clubMembers, { color: colors.muted }]}>
                      {club.member_count} members
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* 4. Footer Legal / Info */}
      <View style={[styles.footerWrap, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerLinks, { color: colors.muted }]}>
          Privacy · Terms · Help · Cookies
        </Text>
        <Text style={[styles.copyright, { color: colors.muted }]}>
          SkillBridge Platform © 2026
        </Text>
      </View>
    </aside>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  profileAvatarWrap: {
    position: "relative",
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  profileAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: "800",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  profileTextCol: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  profileSubtitle: {
    fontSize: 11,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  sectionItemsWrap: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    cursor: "pointer",
    position: "relative",
  } as any,
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    fontSize: 13,
    flex: 1,
  },
  activePill: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  clubsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: "700",
  },
  clubItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    cursor: "pointer",
  } as any,
  clubAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  clubAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  clubInitial: {
    fontSize: 12,
    fontWeight: "800",
  },
  clubTextCol: {
    flex: 1,
  },
  clubName: {
    fontSize: 12,
    fontWeight: "600",
  },
  clubMembers: {
    fontSize: 10,
  },
  footerWrap: {
    marginTop: "auto",
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 4,
    paddingHorizontal: 8,
  },
  footerLinks: {
    fontSize: 11,
    lineHeight: 16,
  },
  copyright: {
    fontSize: 10,
  },
});
