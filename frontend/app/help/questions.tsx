import React, { useState, useMemo } from "react";
import {
  Alert,
  FlatList,
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
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { AskHelpComposerModal } from "@/features/help/AskHelpComposerModal";

type HelpQuestion = {
  id: string;
  roomId: string;
  roomTitle: string;
  title: string;
  body: string;
  isResolved: boolean;
  upvotesCount: number;
  createdAt: string;
  answersCount: number;
  hasAcceptedAnswer: boolean;
  subject?: string | null;
  topic?: string | null;
  urgency: "normal" | "today" | "exam_soon";
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
  };
};

type FilterStatus = "all" | "open" | "answered" | "resolved";

export default function HelpQuestionsScreen() {
  const { colors } = useTheme();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{
    questions: HelpQuestion[];
  }>({
    queryKey: ["help-questions", filterStatus, onlyMine],
    queryFn: () =>
      api<{ questions: HelpQuestion[] }>(
        `/help/questions?status=${filterStatus}&mine=${onlyMine}&limit=40`,
      ),
  });

  const questions = data?.questions ?? [];

  const filteredQuestions = useMemo(() => {
    if (!search.trim()) return questions;
    const q = search.toLowerCase();
    return questions.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.body?.toLowerCase().includes(q) ||
        item.subject?.toLowerCase().includes(q) ||
        item.roomTitle?.toLowerCase().includes(q),
    );
  }, [questions, search]);

  const getUrgencyTone = (urgency: string): "default" | "warning" | "danger" | "accent" => {
    if (urgency === "exam_soon") return "danger";
    if (urgency === "today") return "warning";
    return "default";
  };

  const formatUrgency = (urgency: string) => {
    if (urgency === "exam_soon") return "Exam Soon";
    if (urgency === "today") return "Due Today";
    return "Normal";
  };

  return (
    <Screen>
      {/* Top Header */}
      <Row style={s.headerRow}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View>
            <H1 style={s.title}>{onlyMine ? "My Help Questions" : "Academic Help Hub"}</H1>
            <Muted style={s.subtitle}>Canonical Q&A threads across university rooms</Muted>
          </View>
        </Row>
        <Button
          title="+ Ask"
          variant="secondary"
          onPress={() => {
            triggerHaptic();
            setShowComposer(true);
          }}
        />
      </Row>

      {/* Search Input */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          placeholder="Search questions by subject, formula or topic..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          style={[s.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Scope & Status Filter Bar */}
      <Row style={s.filterRow}>
        {/* Toggle between All Questions and My Questions */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setOnlyMine((m) => !m);
          }}
          style={[
            s.pillBtn,
            {
              backgroundColor: onlyMine ? colors.primarySoft : colors.surface,
              borderColor: onlyMine ? colors.primary : colors.border,
            },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons
              name={onlyMine ? "account-check" : "account-outline"}
              size={14}
              color={onlyMine ? colors.primary : colors.muted}
            />
            <Text style={{ fontSize: 12, fontWeight: "600", color: onlyMine ? colors.primary : colors.text }}>
              {onlyMine ? "Mine Only" : "All Questions"}
            </Text>
          </Row>
        </Pressable>

        {/* Status Filters */}
        {(["all", "open", "answered", "resolved"] as FilterStatus[]).map((st) => {
          const isSelected = filterStatus === st;
          return (
            <Pressable
              key={st}
              onPress={() => {
                triggerHaptic();
                setFilterStatus(st);
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
                  textTransform: "capitalize",
                }}
              >
                {st}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {/* Questions List */}
      {isLoading ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : isError ? (
        <ErrorState
          detail={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : filteredQuestions.length === 0 ? (
        <Empty
          title={onlyMine ? "No Questions Yet" : "No Questions Found"}
          detail={onlyMine ? "You haven't asked any help questions yet. Tap '+ Ask' above." : "Be the first to ask a study question or change filters."}
        />
      ) : (
        <FlatList
          data={filteredQuestions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                triggerHaptic();
                // Navigate into canonical room Q&A
                router.push(`/room/${item.roomId}?tab=learn&qId=${item.id}` as any);
              }}
              style={({ pressed }) => [
                s.questionCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {/* Header Badges */}
              <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Row style={{ gap: 6, alignItems: "center" }}>
                  {item.subject && <Pill tone="primary">#{item.subject}</Pill>}
                  {item.urgency !== "normal" && (
                    <Pill tone={getUrgencyTone(item.urgency)}>
                      {formatUrgency(item.urgency)}
                    </Pill>
                  )}
                  {item.hasAcceptedAnswer && (
                    <Pill tone="accent">SOLVED ✓</Pill>
                  )}
                </Row>
                <Muted style={{ fontSize: 11 }}>
                  {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Muted>
              </Row>

              {/* Title & Body */}
              <Text style={[s.questionTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={[s.questionBody, { color: colors.muted }]} numberOfLines={2}>
                {item.body}
              </Text>

              {/* Footer: Answers, Upvotes, Source Space */}
              <Row style={s.cardFooter}>
                <Row style={{ gap: 12, alignItems: "center" }}>
                  <Row style={{ gap: 4, alignItems: "center" }}>
                    <MaterialCommunityIcons name="comment-text-outline" size={15} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>
                      {item.answersCount} {item.answersCount === 1 ? "answer" : "answers"}
                    </Text>
                  </Row>
                  <Row style={{ gap: 4, alignItems: "center" }}>
                    <MaterialCommunityIcons name="thumb-up-outline" size={15} color={colors.muted} />
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {item.upvotesCount}
                    </Text>
                  </Row>
                </Row>

                {/* Source Space Badge */}
                <Row style={{ gap: 4, alignItems: "center" }}>
                  <MaterialCommunityIcons name="door-open" size={14} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
                    {item.roomTitle}
                  </Text>
                </Row>
              </Row>
            </Pressable>
          )}
        />
      )}

      {/* 3-Step Ask Help Composer Modal */}
      <AskHelpComposerModal
        visible={showComposer}
        onClose={() => setShowComposer(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: 24,
  },
  questionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 6,
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
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(150,150,150,0.15)",
  },
});
