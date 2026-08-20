import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
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

const TIME_WINDOWS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "all_time", label: "All Time" },
];

const REPUTATION_RULES = [
  { action: "Host a Completed Study Session", points: "+10 pts", icon: "video-check" },
  { action: "Verify Skill with 80%+ Quiz Score", points: "+15 pts", icon: "certificate" },
  { action: "Accepted as Research Collaborator", points: "+20 pts", icon: "flask-outline" },
  { action: "Receive a 5-Star Session Review", points: "+5 pts", icon: "star-circle" },
  { action: "Complete Peer Review for a Session", points: "+2 pts", icon: "comment-check" },
];

export default function Leaderboard() {
  const { colors, isDark } = useTheme();
  const [activeCategory, setActiveCategory] = useState("reputation");
  const [timeWindow, setTimeWindow] = useState("weekly");
  const [showHowPointsWork, setShowHowPointsWork] = useState(false);

  const q = useQuery({
    queryKey: ["leaderboard", activeCategory, timeWindow],
    queryFn: () =>
      api<{ leaders: LeaderProfile[] }>(`/gamification/leaderboard?category=${activeCategory}&window=${timeWindow}`),
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
      <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
        <H1>Campus Leaderboard 🏆</H1>
        <Pressable
          onPress={() => setShowHowPointsWork(true)}
          style={[s.infoButton, { backgroundColor: colors.primary + "18" }]}
        >
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
          <Text style={[s.infoButtonText, { color: colors.primary }]}>How points work</Text>
        </Pressable>
      </Row>
      <Muted>
        Verified server-authoritative rankings calculated from peer tutoring, room participation, and research.
      </Muted>

      {/* Time Window Tabs */}
      <View style={s.windowRow}>
        {TIME_WINDOWS.map((win) => {
          const selected = timeWindow === win.key;
          return (
            <Pressable
              key={win.key}
              onPress={() => {
                triggerHaptic();
                setTimeWindow(win.key);
              }}
              style={[
                s.winTab,
                {
                  backgroundColor: selected ? colors.primary + "20" : "transparent",
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? colors.primary : colors.muted,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {win.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
      {top3.length > 0 && !q.isLoading ? (() => {
        const first = top3[0];
        const second = top3[1];
        const third = top3[2];
        return (
          <Card tone="glow" style={s.podiumCard}>
            <Text style={[s.podiumTitle, { color: colors.primary }]}>TOP PERFORMERS</Text>
            <View style={s.podiumRow}>
              {/* Rank 2 - Silver */}
              {second ? (
                <Pressable
                  onPress={() => router.push(`/user/${second.id}` as any)}
                  style={[s.podiumCol, { marginTop: 24 }]}
                >
                  <View style={[s.podiumAvatarWrap, { borderColor: "#94A3B8" }]}>
                    {second.avatar_url ? (
                      <Image source={{ uri: second.avatar_url }} style={s.podiumAvatar} />
                    ) : (
                      <View style={[s.podiumAvatar, { backgroundColor: colors.surface2 }]}>
                        <Text style={s.podiumInitial}>{second.full_name?.[0] || "2"}</Text>
                      </View>
                    )}
                    <View style={[s.rankBadge, { backgroundColor: "#94A3B8" }]}>
                      <Text style={s.rankBadgeText}>2</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[s.podiumName, { color: colors.text }]}>
                    {second.full_name}
                  </Text>
                  <Pill tone="default">{getMetricBadge(second)}</Pill>
                </Pressable>
              ) : null}

              {/* Rank 1 - Gold */}
              {first ? (
                <Pressable
                  onPress={() => router.push(`/user/${first.id}` as any)}
                  style={s.podiumCol}
                >
                  <MaterialCommunityIcons name="crown" size={26} color="#EAB308" />
                  <View style={[s.podiumAvatarWrap, { borderColor: "#EAB308", width: 68, height: 68, borderRadius: 34 }]}>
                    {first.avatar_url ? (
                      <Image source={{ uri: first.avatar_url }} style={[s.podiumAvatar, { width: 60, height: 60, borderRadius: 30 }]} />
                    ) : (
                      <View style={[s.podiumAvatar, { backgroundColor: colors.primary, width: 60, height: 60, borderRadius: 30 }]}>
                        <Text style={[s.podiumInitial, { fontSize: 24, color: "#FFFFFF" }]}>{first.full_name?.[0] || "1"}</Text>
                      </View>
                    )}
                    <View style={[s.rankBadge, { backgroundColor: "#EAB308" }]}>
                      <Text style={s.rankBadgeText}>1</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[s.podiumName, { color: colors.text, fontWeight: "900" }]}>
                    {first.full_name}
                  </Text>
                  <Pill tone="accent">{getMetricBadge(first)}</Pill>
                </Pressable>
              ) : null}

              {/* Rank 3 - Bronze */}
              {third ? (
                <Pressable
                  onPress={() => router.push(`/user/${third.id}` as any)}
                  style={[s.podiumCol, { marginTop: 32 }]}
                >
                  <View style={[s.podiumAvatarWrap, { borderColor: "#D97706" }]}>
                    {third.avatar_url ? (
                      <Image source={{ uri: third.avatar_url }} style={s.podiumAvatar} />
                    ) : (
                      <View style={[s.podiumAvatar, { backgroundColor: colors.surface2 }]}>
                        <Text style={s.podiumInitial}>{third.full_name?.[0] || "3"}</Text>
                      </View>
                    )}
                    <View style={[s.rankBadge, { backgroundColor: "#D97706" }]}>
                      <Text style={s.rankBadgeText}>3</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[s.podiumName, { color: colors.text }]}>
                    {third.full_name}
                  </Text>
                  <Pill tone="default">{getMetricBadge(third)}</Pill>
                </Pressable>
              ) : null}
            </View>
          </Card>
        );
      })() : null}

      {/* Ranks 4+ */}
      {rest.map((p, i) => (
        <Pressable key={p.id} onPress={() => router.push(`/user/${p.id}` as any)}>
          <Card>
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
        </Pressable>
      ))}

      {leaders.length === 0 && !q.isLoading ? (
        <Empty title="No ranked members" detail="Be the first to tutor a session or join research to enter the leaderboard!" />
      ) : null}

      {/* How Points Work Modal */}
      <Modal
        visible={showHowPointsWork}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHowPointsWork(false)}
      >
        <View style={s.modalOverlay}>
          <Card style={s.modalCard}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <H2>How Reputation Works 🌟</H2>
              <Pressable onPress={() => setShowHowPointsWork(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Muted style={{ marginBottom: 14 }}>
              SkillBridge calculates verifiable reputation from real peer learning and research contributions.
            </Muted>

            <View style={{ gap: 10, marginBottom: 16 }}>
              {REPUTATION_RULES.map((rule) => (
                <Row key={rule.action} style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons name={rule.icon as any} size={20} color={colors.primary} />
                    <Text style={[s.ruleAction, { color: colors.text }]}>{rule.action}</Text>
                  </Row>
                  <Pill tone="accent">{rule.points}</Pill>
                </Row>
              ))}
            </View>

            <Button title="Got it!" onPress={() => setShowHowPointsWork(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  infoButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  windowRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  winTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  categoryBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    borderRadius: radius.lg,
  },
  ruleAction: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
