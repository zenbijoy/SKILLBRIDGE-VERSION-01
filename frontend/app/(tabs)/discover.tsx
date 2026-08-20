import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Card, ErrorState, H2, Muted, Pill, Row, Screen, SectionHeader, Skeleton, triggerHaptic } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { RoomCard } from "@/components/RoomCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

const explore = [
  ["flask-outline", "Research Hub", "/research", "Collaborate on papers & projects"],
  ["calendar-star", "Campus Events", "/events", "Workshops, hackathons & talks"],
  ["account-multiple-outline", "Connections", "/connections", "Find peers & skill partners"],
  ["brain", "Skill Quizzes", "/quiz", "Test skills & earn badges"],
  ["trophy-outline", "Leaderboard", "/leaderboard", "Top teachers & learners"],
  ["bookmark-multiple-outline", "Saved Items", "/saved", "Bookmarks & archived resources"],
  ["account-group-outline", "Clubs", "/clubs", "Join or lead student clubs"],
  ["calendar-clock", "Schedule", "/schedule", "Calendar & upcoming classes"],
] as const;

export default function Discover() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const people = useQuery({
    queryKey: ["recommendations", "people"],
    queryFn: () => api<{ people: Profile[] }>("/recommendations/people"),
  });
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms"),
  });

  return (
    <Screen
      onRefresh={async () => {
        await Promise.all([people.refetch(), rooms.refetch()]);
      }}
      refreshing={people.isRefetching || rooms.isRefetching}
    >
      <AppHeader title={t("discover.title")} searchPlaceholder={t("common.searchEverything")} />
      <Muted>{t("discover.subtitle")}</Muted>

      {/* Interactive Quick Search Card */}
      <Pressable
        onPress={() => {
          triggerHaptic();
          router.push("/search" as any);
        }}
      >
        <Card tone="glow" style={{ padding: 18, gap: 12 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Pill tone="primary">Global Directory</Pill>
            <MaterialCommunityIcons name="compass-outline" size={20} color={colors.primary} />
          </Row>
          <H2>Explore by what you want to do</H2>
          <Muted>Search across all peer tutors, study rooms, research projects and campus events.</Muted>
          <View style={[s.primarySearch, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.primary} />
            <Text style={{ color: colors.muted, fontWeight: "700", flex: 1, fontSize: 14 }}>
              Search skills, topics, universities...
            </Text>
            <View style={[s.arrowCircle, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="arrow-right" size={16} color={colors.white} />
            </View>
          </View>
        </Card>
      </Pressable>

      {/* Explore Grid */}
      <SectionHeader title={t("discover.explore")} />
      <View style={s.exploreGrid}>
        {explore.map(([icon, label, href, detail]) => (
          <Pressable
            key={label}
            onPress={() => {
              triggerHaptic();
              router.push(href as any);
            }}
            style={({ pressed }) => [
              s.exploreItem,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <View style={[s.exploreIcon, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name={icon as any} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{label}</Text>
              <Muted numberOfLines={1} style={{ fontSize: 11 }}>{detail}</Muted>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Recommended People */}
      <SectionHeader
        title={t("discover.people")}
        action={t("common.seeAll")}
        onAction={() => router.push("/connections" as any)}
      />
      {people.isLoading ? (
        <>
          <Skeleton height={110} />
          <Skeleton height={110} />
        </>
      ) : people.isError ? (
        <ErrorState detail={(people.error as Error).message} onRetry={() => people.refetch()} />
      ) : (
        people.data?.people.slice(0, 4).map((profile) => <ProfileCard key={profile.id} profile={profile} />)
      )}

      {/* Active Rooms */}
      <SectionHeader
        title={t("discover.rooms")}
        action={t("common.seeAll")}
        onAction={() => router.push("/rooms" as any)}
      />
      {rooms.isLoading ? (
        <>
          <Skeleton height={120} />
          <Skeleton height={120} />
        </>
      ) : rooms.isError ? (
        <ErrorState detail={(rooms.error as Error).message} onRetry={() => rooms.refetch()} />
      ) : (
        rooms.data?.rooms.slice(0, 4).map((room) => <RoomCard key={room.id} room={room} />)
      )}

      <SectionHeader title="More platform tools" />
      <FeatureGrid />
    </Screen>
  );
}

const s = StyleSheet.create({
  primarySearch: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  exploreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  exploreItem: {
    width: "48%",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 68,
  },
  exploreIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
