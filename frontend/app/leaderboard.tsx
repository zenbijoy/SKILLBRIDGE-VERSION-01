import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Card, Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type LeaderProfile = Profile & {
  sessions_taught?: number;
  sessions_attended?: number;
  research_count?: number;
};

const CATEGORIES = [
  { key: "reputation", label: "🌟 Overall", icon: "trophy" },
  { key: "tutors", label: "👨‍🏫 Top Tutors", icon: "school" },
  { key: "learners", label: "🎯 Top Learners", icon: "book-open-page-variant" },
  { key: "research", label: "🔬 Researchers", icon: "flask" },
];

export default function Leaderboard() {
  const { colors, isDark } = useTheme();
  const [activeCategory, setActiveCategory] = useState("reputation");

  const q = useQuery({
    queryKey: ["leaderboard", activeCategory],
    queryFn: () =>
      api<{ leaders: LeaderProfile[] }>(`/gamification/leaderboard?category=${activeCategory}`),
  });

  const leaders = q.data?.leaders ?? [];
  const top3 = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  const getMetricBadge = (p: LeaderProfile) => {
    if (activeCategory === "tutors") return `${p.sessions_taught ?? 0} taught`;
    if (activeCategory === "learners") return `${p.sessions_attended ?? 0} attended`;
    if (activeCategory === "research") return `${p.research_count ?? 0} papers`;
    return `${p.reputation ?? 0} rep`;
  };

  return (
    <Screen>
      <H1>Campus Leaderboard 🏆</H1>
      <Muted>
        Verified server-authoritative rankings calculated from peer tutoring, room participation, and research.
      </Muted>

      {/* Category Tabs */}
      <View style={s.categoryBar}>
        {CATEGORIES.map((cat) => {
          const selected = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => {
                triggerHaptic();
                setActiveCategory(cat.key);
              }}
              style={[
                s.catTab,
                {
                  backgroundColor: selected ? colors.primary : colors.surface2,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? colors.white : colors.text,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <>
          <Skeleton height={140} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </>
      ) : null}

      {q.isError ? (
        <ErrorState detail={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : null}

      {/* Podium for Top 3 */}
      {top3.length > 0 && !q.isLoading ? (
        <Card tone="glow" style={s.podiumCard}>
          <Text style={[s.podiumTitle, { color: colors.primary }]}>TOP PERFORMERS</Text>
          <View style={s.podiumRow}>
            {/* Rank 2 - Silver */}
            {top3[1] ? (
              <View style={[s.podiumCol, { marginTop: 24 }]}>
                <View style={[s.podiumAvatarWrap, { borderColor: "#94A3B8" }]}>
                  {top3[1].avatar_url ? (
                    <Image source={{ uri: top3[1].avatar_url }} style={s.podiumAvatar} />
                  ) : (
                    <View style={[s.podiumAvatar, { backgroundColor: colors.surface2 }]}>
                      <Text style={s.podiumInitial}>{top3[1].full_name?.[0] || "2"}</Text>
                    </View>
                  )}
                  <View style={[s.rankBadge, { backgroundColor: "#94A3B8" }]}>
                    <Text style={s.rankBadgeText}>2</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[s.podiumName, { color: colors.text }]}>
                  {top3[1].full_name}
                </Text>
                <Pill tone="default">{getMetricBadge(top3[1])}</Pill>
              </View>
            ) : null}

            {/* Rank 1 - Gold */}
            {top3[0] ? (
              <View style={s.podiumCol}>
                <MaterialCommunityIcons name="crown" size={26} color="#EAB308" />
                <View style={[s.podiumAvatarWrap, { borderColor: "#EAB308", width: 68, height: 68, borderRadius: 34 }]}>
                  {top3[0].avatar_url ? (
                    <Image source={{ uri: top3[0].avatar_url }} style={[s.podiumAvatar, { width: 60, height: 60, borderRadius: 30 }]} />
                  ) : (
                    <View style={[s.podiumAvatar, { backgroundColor: colors.primary, width: 60, height: 60, borderRadius: 30 }]}>
                      <Text style={[s.podiumInitial, { fontSize: 24, color: "#FFFFFF" }]}>{top3[0].full_name?.[0] || "1"}</Text>
                    </View>
                  )}
                  <View style={[s.rankBadge, { backgroundColor: "#EAB308" }]}>
                    <Text style={s.rankBadgeText}>1</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[s.podiumName, { color: colors.text, fontWeight: "900" }]}>
                  {top3[0].full_name}
                </Text>
                <Pill tone="accent">{getMetricBadge(top3[0])}</Pill>
              </View>
            ) : null}

            {/* Rank 3 - Bronze */}
            {top3[2] ? (
              <View style={[s.podiumCol, { marginTop: 32 }]}>
                <View style={[s.podiumAvatarWrap, { borderColor: "#D97706" }]}>
                  {top3[2].avatar_url ? (
                    <Image source={{ uri: top3[2].avatar_url }} style={s.podiumAvatar} />
                  ) : (
                    <View style={[s.podiumAvatar, { backgroundColor: colors.surface2 }]}>
                      <Text style={s.podiumInitial}>{top3[2].full_name?.[0] || "3"}</Text>
                    </View>
                  )}
                  <View style={[s.rankBadge, { backgroundColor: "#D97706" }]}>
                    <Text style={s.rankBadgeText}>3</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={[s.podiumName, { color: colors.text }]}>
                  {top3[2].full_name}
                </Text>
                <Pill tone="default">{getMetricBadge(top3[2])}</Pill>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* Ranks 4+ */}
      {rest.map((p, i) => (
        <Card key={p.id}>
          <Row style={{ alignItems: "center" }}>
            <View style={[s.tableRank, { backgroundColor: colors.surface2 }]}>
              <Text style={[s.rankNum, { color: colors.text }]}>#{i + 4}</Text>
            </View>

            {p.avatar_url ? (
              <Image source={{ uri: p.avatar_url }} style={s.listAvatar} />
            ) : (
              <View style={[s.listAvatar, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ color: colors.primary, fontWeight: "800" }}>{p.full_name?.[0] || "S"}</Text>
              </View>
            )}

            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                {p.full_name}
              </Text>
              <Muted numberOfLines={1}>
                {p.university ? `${p.university} · ` : ""}@{p.username}
              </Muted>
            </View>

            <Pill tone="accent">{getMetricBadge(p)}</Pill>
          </Row>
        </Card>
      ))}

      {leaders.length === 0 && !q.isLoading ? (
        <Empty title="No ranked members" detail="Be the first to tutor a session or join research to enter the leaderboard!" />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  categoryBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  catTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  podiumCard: { alignItems: "center", paddingVertical: 18 },
  podiumTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 12 },
  podiumRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 16, width: "100%" },
  podiumCol: { alignItems: "center", width: "30%", gap: 6 },
  podiumAvatarWrap: {
    position: "relative",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  podiumInitial: { fontWeight: "800", fontSize: 20 },
  podiumName: { fontSize: 12, fontWeight: "800", textAlign: "center" },
  rankBadge: {
    position: "absolute",
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  tableRank: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rankNum: { fontWeight: "800", fontSize: 13 },
  listAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", fontSize: 14 },
});
