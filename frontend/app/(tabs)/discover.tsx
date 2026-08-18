import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Card, ErrorState, H1, H2, Muted, Pill, Row, Screen, SectionHeader, Skeleton } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { RoomCard } from "@/components/RoomCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

const explore = [
  ["flask-outline", "Research", "/research"],
  ["calendar-star", "Events", "/events"],
  ["account-multiple-outline", "Connections", "/connections"],
  ["bookmark-multiple-outline", "Saved", "/saved"],
  ["trophy-outline", "Leaderboard", "/leaderboard"],
  ["brain", "Quiz", "/quiz"],
  ["account-group-outline", "Clubs", "/clubs"],
  ["calendar-clock", "Schedule", "/schedule"],
] as const;

export default function Discover() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const people = useQuery({
    queryKey: ["recommendations", "people"],
    queryFn: () => api<{ people: Profile[] }>("/recommendations/people"),
  });
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms"),
  });

  return (
    <Screen>
      <AppHeader title={t("discover.title")} />
      <Muted>{t("discover.subtitle")}</Muted>

      <Card tone="primary">
        <H2>Explore by what you want to do</H2>
        <Muted>Search when you know what you need; discover when you want ideas, people and opportunities.</Muted>
        <Pressable onPress={() => router.push("/search" as any)} style={[s.primarySearch, { backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }}>Search the whole network</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={colors.primary} />
        </Pressable>
      </Card>

      <SectionHeader title={t("discover.explore")} />
      <View style={s.exploreGrid}>
        {explore.map(([icon, label, href]) => (
          <Pressable key={label} onPress={() => router.push(href as any)} style={({ pressed }) => [s.exploreItem, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
            <View style={[s.exploreIcon, { backgroundColor: colors.primarySoft }]}><MaterialCommunityIcons name={icon as any} size={22} color={colors.primary} /></View>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title={t("discover.people")} action={t("common.seeAll")} onAction={() => router.push("/connections" as any)} />
      {people.isLoading ? <><Skeleton height={110} /><Skeleton height={110} /></> : people.isError ? <ErrorState detail={(people.error as Error).message} onRetry={() => people.refetch()} /> : people.data?.people.slice(0, 4).map((profile) => <ProfileCard key={profile.id} profile={profile} />)}

      <SectionHeader title={t("discover.rooms")} action={t("common.seeAll")} onAction={() => router.push("/rooms" as any)} />
      {rooms.isLoading ? <><Skeleton height={120} /><Skeleton height={120} /></> : rooms.isError ? <ErrorState detail={(rooms.error as Error).message} onRetry={() => rooms.refetch()} /> : rooms.data?.rooms.slice(0, 4).map((room) => <RoomCard key={room.id} room={room} />)}

      <SectionHeader title="More tools" />
      <FeatureGrid />
    </Screen>
  );
}

const s = StyleSheet.create({
  primarySearch: { marginTop: 4, minHeight: 50, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  exploreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  exploreItem: { width: "48%", borderWidth: 1, borderRadius: radius.lg, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64 },
  exploreIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
