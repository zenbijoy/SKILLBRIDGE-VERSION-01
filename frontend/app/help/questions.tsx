import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  type ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { AskHelpComposerModal } from "@/features/help/AskHelpComposerModal";
import {
  deriveStatus,
  DOUBT_REWARDS,
  filterQuestions,
  formatRelativeTime,
  getUrgencyMeta,
  matchesSearch,
  roomLabel,
  summarizeQuestions,
  type HelpQuestionSummary,
  type HelpStatus,
} from "@/features/help/helpUtils";

const STATUS_FILTERS: { key: HelpStatus; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "all", label: "All" },
  { key: "unanswered", label: "Needs Answer 🔥", icon: "fire" },
  { key: "open", label: "Open" },
  { key: "answered", label: "Answered" },
  { key: "resolved", label: "Solved" },
];

export default function HelpQuestionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [filterStatus, setFilterStatus] = useState<HelpStatus>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{
    questions: HelpQuestionSummary[];
  }>({
    queryKey: ["help-questions", onlyMine],
    queryFn: () =>
      api<{ questions: HelpQuestionSummary[] }>(
        `/help/questions?mine=${onlyMine}&limit=100`,
      ),
  });

  const questions = useMemo(() => data?.questions ?? [], [data]);
  // Live counts derived from the full question list — stays stable across tab switches.
  const stats = useMemo(() => summarizeQuestions(questions), [questions]);

  const visibleQuestions = useMemo(() => {
    return filterQuestions(questions, {
      status: filterStatus,
      onlyMine,
      userId: null,
      search,
    });
  }, [questions, filterStatus, onlyMine, search]);

  const openComposer = () => {
    triggerHaptic();
    setShowComposer(true);
  };

  const renderQuestion = ({ item }: ListRenderItemInfo<HelpQuestionSummary>) => {
    const status = deriveStatus(item);
    const urgency = getUrgencyMeta(item.urgency);
    const solved = status === "resolved";
    const needsAnswer = item.answersCount === 0 && !solved;

    return (
      <Pressable
        onPress={() => {
          triggerHaptic();
          router.push(`/help/questions/${item.id}` as any);
        }}
        style={({ pressed }) => [
          s.questionCard,
          {
            backgroundColor: colors.surface,
            borderColor: solved ? `${colors.success}55` : needsAnswer ? `${colors.warning}44` : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {solved && <View style={[s.stripe, { backgroundColor: colors.success }]} />}
        {needsAnswer && <View style={[s.stripe, { backgroundColor: colors.warning }]} />}

        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ gap: 6, alignItems: "center", flexShrink: 1 }}>
            {item.subject ? <Pill tone="primary">#{item.subject}</Pill> : null}
            {item.imageUrl ? <Pill tone="accent">📷 Photo</Pill> : null}
            {item.urgency !== "normal" ? <Pill tone={urgency.tone}>{urgency.label}</Pill> : null}
            {needsAnswer && (
              <Pill tone="warning">⚡ +{DOUBT_REWARDS.ANSWER_DOUBT} Rep Bounty</Pill>
            )}
          </Row>
          <Pill tone={solved ? "success" : status === "answered" ? "info" : "default"}>
            {solved ? "SOLVED" : status === "answered" ? "ANSWERED" : "OPEN"}
          </Pill>
        </Row>

        <Text style={[s.questionTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[s.questionBody, { color: colors.muted }]} numberOfLines={2}>
          {item.body}
        </Text>

        <Row style={[s.cardFooter, { borderTopColor: colors.divider }]}>
          <Row style={{ gap: 8, alignItems: "center", flexShrink: 1 }}>
            <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
              {item.author?.avatar_url ? (
                <Image source={{ uri: item.author.avatar_url }} style={s.avatarImg} />
              ) : (
                <Text style={{ fontWeight: "800", color: colors.primary, fontSize: 12 }}>
                  {item.author?.full_name?.[0] || "U"}
                </Text>
              )}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>
                {item.author?.full_name || "Student"}
              </Text>
              <Row style={{ gap: 10, alignItems: "center" }}>
                <Row style={{ gap: 3, alignItems: "center" }}>
                  <MaterialCommunityIcons
                    name={item.answersCount > 0 ? "comment-check-outline" : "comment-question-outline"}
                    size={12}
                    color={item.answersCount > 0 ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      s.metaText,
                      { color: item.answersCount > 0 ? colors.primary : colors.muted, fontWeight: "600" },
                    ]}
                  >
                    {item.answersCount} {item.answersCount === 1 ? "answer" : "answers"}
                  </Text>
                </Row>
                <Row style={{ gap: 3, alignItems: "center" }}>
                  <MaterialCommunityIcons name="thumb-up-outline" size={12} color={colors.muted} />
                  <Text style={[s.metaText, { color: colors.muted }]}>{item.upvotesCount}</Text>
                </Row>
              </Row>
            </View>
          </Row>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={[s.metaText, { color: colors.muted }]}>{formatRelativeTime(item.createdAt)}</Text>
            <Row style={{ gap: 3, alignItems: "center", maxWidth: 120 }}>
              <MaterialCommunityIcons name="door-open" size={11} color={colors.muted} />
              <Text style={[s.metaText, { color: colors.muted }]} numberOfLines={1}>
                {roomLabel(item.roomTitle)}
              </Text>
            </Row>
          </View>
        </Row>
      </Pressable>
    );
  };

  const listHeader = (
    <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <Muted style={{ fontSize: 12 }}>
        {visibleQuestions.length} {visibleQuestions.length === 1 ? "doubt" : "doubts"}
        {search.trim() ? " matching" : ""}
      </Muted>
      <Pressable
        onPress={() => {
          triggerHaptic();
          setOnlyMine((m) => !m);
        }}
        style={[
          s.mineToggle,
          {
            backgroundColor: onlyMine ? colors.primarySoft : colors.surface,
            borderColor: onlyMine ? colors.primary : colors.border,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={onlyMine ? "account-check" : "account-outline"}
          size={14}
          color={onlyMine ? colors.primary : colors.muted}
        />
        <Text style={{ fontSize: 12, fontWeight: "600", color: onlyMine ? colors.primary : colors.text }}>
          {onlyMine ? "My Doubts" : "All Authors"}
        </Text>
      </Pressable>
    </Row>
  );

  const listBody = () => {
    if (isLoading) {
      return (
        <View style={{ gap: 10 }}>
          <Skeleton height={116} />
          <Skeleton height={116} />
          <Skeleton height={116} />
        </View>
      );
    }
    if (isError) {
      return <ErrorState detail={(error as Error)?.message} onRetry={() => refetch()} />;
    }
    return (
      <FlatList
        data={visibleQuestions}
        keyExtractor={(item) => item.id}
        renderItem={renderQuestion}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Empty
            icon="help-circle-outline"
            title={onlyMine ? "No Doubts Asked Yet" : "No Doubts Found"}
            detail={
              onlyMine
                ? "You haven't asked for academic help yet. Tap below to post your first doubt and earn +5 Reputation."
                : "Be the first to post a study question and get help from peer mentors!"
            }
            actionTitle={onlyMine ? "Ask Your First Doubt" : "Post a Doubt"}
            onAction={openComposer}
          />
        }
      />
    );
  };

  return (
    <Screen scroll={false} contentStyle={{ padding: 0, gap: 0 }}>
      {/* Fixed header block */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <H1 style={s.title}>Campus Doubts</H1>
            <Muted style={s.subtitle}>Ask doubts, help peers &amp; earn rewards</Muted>
          </View>
          {/* Quick link to Leaderboard instead of duplicate ask button */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push("/leaderboard" as any);
            }}
            style={[s.trophyBtn, { backgroundColor: `${colors.accent}15`, borderColor: `${colors.accent}40` }]}
          >
            <MaterialCommunityIcons name="trophy-outline" size={16} color={colors.accent} />
            <Text style={[s.trophyBtnText, { color: colors.accent }]}>Rankings</Text>
          </Pressable>
        </Row>

        {/* Live stat hero */}
        <LinearGradient
          colors={[colors.primary, colors.primary2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroItem}>
            <Text style={s.heroValue}>{stats.total}</Text>
            <Text style={s.heroLabel}>Total</Text>
          </View>
          <View style={[s.heroDivider, { backgroundColor: "rgba(255,255,255,0.25)" }]} />
          <View style={s.heroItem}>
            <Text style={s.heroValue}>{stats.open}</Text>
            <Text style={s.heroLabel}>Open</Text>
          </View>
          <View style={[s.heroDivider, { backgroundColor: "rgba(255,255,255,0.25)" }]} />
          <View style={s.heroItem}>
            <Text style={s.heroValue}>{stats.answered}</Text>
            <Text style={s.heroLabel}>Answered</Text>
          </View>
          <View style={[s.heroDivider, { backgroundColor: "rgba(255,255,255,0.25)" }]} />
          <View style={s.heroItem}>
            <Text style={s.heroValue}>{stats.resolved}</Text>
            <Text style={s.heroLabel}>Solved</Text>
          </View>
        </LinearGradient>

        {/* Gamification & Reward Motivation Strip */}
        <Row style={[s.rewardStrip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="star-shooting" size={16} color={colors.accent} />
          <Text style={[s.rewardStripText, { color: colors.text }]}>
            Rewards: <Text style={{ color: colors.primary, fontWeight: "700" }}>+{DOUBT_REWARDS.ASK_DOUBT} Rep</Text> Ask ·{" "}
            <Text style={{ color: colors.warning, fontWeight: "700" }}>+{DOUBT_REWARDS.ANSWER_DOUBT} Rep</Text> Answer ·{" "}
            <Text style={{ color: colors.success, fontWeight: "800" }}>+{DOUBT_REWARDS.ACCEPTED_SOLUTION} Rep</Text> Solved
          </Text>
        </Row>

        {/* Search */}
        <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            placeholder="Search by subject, topic or keyword..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={[s.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Status filters */}
        <Row style={s.filterRow}>
          {STATUS_FILTERS.map((f) => {
            const isSelected = filterStatus === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  triggerHaptic();
                  setFilterStatus(f.key);
                }}
                style={[
                  s.pillBtn,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isSelected ? "700" : "500",
                    color: isSelected ? "#FFFFFF" : colors.text,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </View>

      {/* FlatList is the scroller */}
      <View style={{ flex: 1, paddingHorizontal: 16 }}>{listBody()}</View>

      {/* Extended Floating Ask Button - visible when list has items to prevent overlapping with Empty state CTA */}
      {visibleQuestions.length > 0 && (
        <Pressable
          onPress={openComposer}
          style={({ pressed }) => [
            s.extendedFab,
            {
              backgroundColor: colors.primary,
              bottom: Math.max(insets.bottom, 16) + 20,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          accessibilityLabel="Ask a new doubt"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color="#FFFFFF" />
          <Text style={s.extendedFabText}>Ask Doubt</Text>
        </Pressable>
      )}

      {/* Real composer wired to POST /help/questions with rewards */}
      <AskHelpComposerModal visible={showComposer} onClose={() => setShowComposer(false)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  trophyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  trophyBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  heroItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  heroDivider: {
    width: 1,
    height: 24,
  },
  heroValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  heroLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
  },
  rewardStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rewardStripText: {
    fontSize: 11.5,
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    gap: 6,
    flexWrap: "wrap",
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  mineToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  questionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 10,
    overflow: "hidden",
  },
  stripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  questionBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  authorName: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 11,
  },
  extendedFab: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  extendedFabText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
