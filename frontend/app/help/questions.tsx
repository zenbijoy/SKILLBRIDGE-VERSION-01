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
import { Button, Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { AskHelpComposerModal } from "@/features/help/AskHelpComposerModal";
import {
  deriveStatus,
  formatRelativeTime,
  getUrgencyMeta,
  matchesSearch,
  roomLabel,
  summarizeQuestions,
  type HelpQuestionSummary,
  type HelpStatus,
} from "@/features/help/helpUtils";

const STATUS_FILTERS: { key: HelpStatus; label: string }[] = [
  { key: "all", label: "All" },
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
    queryKey: ["help-questions", filterStatus, onlyMine],
    queryFn: () =>
      api<{ questions: HelpQuestionSummary[] }>(
        `/help/questions?status=${filterStatus}&mine=${onlyMine}&limit=40`,
      ),
  });

  const questions = useMemo(() => data?.questions ?? [], [data]);
  // Live counts derived from the real payload — never hardcoded.
  const stats = useMemo(() => summarizeQuestions(questions), [questions]);

  const visibleQuestions = useMemo(() => {
    if (!search.trim()) return questions;
    return questions.filter((q) => matchesSearch(q, search));
  }, [questions, search]);

  const openComposer = () => {
    triggerHaptic();
    setShowComposer(true);
  };

  const renderQuestion = ({ item }: ListRenderItemInfo<HelpQuestionSummary>) => {
    const status = deriveStatus(item);
    const urgency = getUrgencyMeta(item.urgency);
    const solved = status === "resolved";

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
            borderColor: solved ? `${colors.success}55` : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {solved && <View style={[s.solvedStripe, { backgroundColor: colors.success }]} />}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ gap: 6, alignItems: "center", flexShrink: 1 }}>
            {item.subject ? <Pill tone="primary">#{item.subject}</Pill> : null}
            {item.urgency !== "normal" ? <Pill tone={urgency.tone}>{urgency.label}</Pill> : null}
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
                  <MaterialCommunityIcons name="comment-text-outline" size={12} color={colors.primary} />
                  <Text style={[s.metaText, { color: colors.primary }]}>
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
        {visibleQuestions.length} {visibleQuestions.length === 1 ? "question" : "questions"}
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
          {onlyMine ? "My Questions" : "All Authors"}
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
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Empty
            icon="help-circle-outline"
            title={onlyMine ? "No Questions Yet" : "No Questions Found"}
            detail={
              onlyMine
                ? "You haven't asked for help yet. Tap the button below to post your first doubt."
                : "Be the first to ask a study question, or try a different filter or search."
            }
            actionTitle="Ask a Question"
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
            <H1 style={s.title}>Ask Doubt</H1>
            <Muted style={s.subtitle}>Get unstuck with your campus peers</Muted>
          </View>
          <Button title="Ask" compact onPress={openComposer} />
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
            <Text style={s.heroLabel}>Loaded</Text>
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

      {/* FlatList is the scroller (fixes VirtualizedList-in-ScrollView) */}
      <View style={{ flex: 1, paddingHorizontal: 16 }}>{listBody()}</View>

      {/* Floating Ask button */}
      <Pressable
        onPress={openComposer}
        style={({ pressed }) => [
          s.fab,
          {
            backgroundColor: colors.primary,
            bottom: Math.max(insets.bottom, 16) + 76,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
        accessibilityLabel="Ask a new doubt"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="message-question-outline" size={26} color="#FFFFFF" />
      </Pressable>

      {/* Real composer wired to POST /help/questions */}
      <AskHelpComposerModal visible={showComposer} onClose={() => setShowComposer(false)} />
    </Screen>
  );
}


const s = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
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
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  heroItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  heroDivider: {
    width: 1,
    height: 26,
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
    paddingHorizontal: 14,
    paddingVertical: 7,
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
  solvedStripe: {
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
  fab: {
    position: "absolute",
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});

