import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { useSession } from "@/hooks/useSession";
import {
  Button,
  Card,
  ErrorState,
  Muted,
  Pill,
  Row,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { DOUBT_REWARDS, formatRelativeTime, getUrgencyMeta, roomLabel } from "@/features/help/helpUtils";

type Answer = {
  id: string;
  question_id: string;
  body: string;
  is_accepted: boolean;
  upvotes_count: number;
  created_at: string;
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    department?: string;
    university?: string;
  };
};

type QuestionDetail = {
  id: string;
  roomId: string;
  roomTitle: string;
  title: string;
  body: string;
  isResolved: boolean;
  upvotesCount: number;
  createdAt: string;
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    department?: string;
    university?: string;
  };
  answersCount: number;
  hasAcceptedAnswer: boolean;
  acceptedAnswer: Answer | null;
  answers: Answer[];
  subject?: string | null;
  topic?: string | null;
  urgency: "normal" | "today" | "exam_soon";
  imageUrl?: string | null;
};

export default function QuestionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const flatListRef = useRef<FlatList<Answer>>(null);
  const { session } = useSession();
  const qc = useQueryClient();

  const [answerText, setAnswerText] = useState("");
  const [upvoted, setUpvoted] = useState(false);
  const [upvotedAnswers, setUpvotedAnswers] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{
    question: QuestionDetail;
  }>({
    queryKey: ["help-question", id],
    queryFn: () => api<{ question: QuestionDetail }>(`/help/questions/${id}`),
    enabled: Boolean(id),
  });

  const question = data?.question;
  const isAuthor = session?.user?.id === question?.author?.id;

  const upvoteMutation = useMutation({
    mutationFn: () => api<{ upvotesCount: number }>(`/help/questions/${id}/upvote`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic("selection");
      setUpvoted(true);
      qc.invalidateQueries({ queryKey: ["help-question", id] });
      qc.invalidateQueries({ queryKey: ["help-questions"] });
    },
    onError: () => {
      Alert.alert("Error", "Could not upvote this question.");
    },
  });

  const upvoteAnswerMutation = useMutation({
    mutationFn: (answerId: string) =>
      api<{ upvotesCount: number }>(`/help/questions/${id}/answers/${answerId}/upvote`, { method: "POST" }),
    onSuccess: (_res, answerId) => {
      triggerHaptic("selection");
      setUpvotedAnswers((prev) => ({ ...prev, [answerId]: true }));
      qc.invalidateQueries({ queryKey: ["help-question", id] });
    },
    onError: () => {
      Alert.alert("Error", "Could not upvote this answer.");
    },
  });

  const answerMutation = useMutation({
    mutationFn: (body: string) =>
      api<{ answer: Answer; reward?: { points: number; awarded: boolean } }>(`/help/questions/${id}/answers`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (res) => {
      triggerHaptic("notificationSuccess");
      setAnswerText("");
      qc.invalidateQueries({ queryKey: ["help-question", id] });
      qc.invalidateQueries({ queryKey: ["help-questions"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
      const pts = res?.reward?.points ?? DOUBT_REWARDS.ANSWER_DOUBT;
      Alert.alert(
        "Answer Published! 🌟",
        `Thank you for helping your classmate! You earned +${pts} Reputation XP!`,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Answer Failed", err.message || "Could not submit your answer.");
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (answerId: string) =>
      api(`/help/questions/${id}/answers/${answerId}/accept`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["help-question", id] });
      qc.invalidateQueries({ queryKey: ["help-questions"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      Alert.alert(
        "Solution Verified! 🏆",
        `You accepted this answer as the solution. The solver earned +${DOUBT_REWARDS.ACCEPTED_SOLUTION} Reputation, and you received a +${DOUBT_REWARDS.RESOLVE_BONUS} Rep completion bonus!`,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Action Failed", err.message || "Could not mark as accepted.");
    },
  });

  const handleSendAnswer = () => {
    if (!answerText.trim() || answerMutation.isPending) return;
    Keyboard.dismiss();
    answerMutation.mutate(answerText.trim());
  };

  const renderAnswer = ({ item }: ListRenderItemInfo<Answer>) => {
    const isAccepted = item.is_accepted;
    const isAnswerUpvoted = upvotedAnswers[item.id];
    return (
      <View
        style={[
          s.answerCard,
          {
            backgroundColor: colors.surface,
            borderColor: isAccepted ? colors.success : colors.border,
            borderWidth: isAccepted ? 2 : 1,
          },
        ]}
      >
        {isAccepted && (
          <Row style={[s.acceptedBanner, { backgroundColor: `${colors.success}18` }]}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={colors.success} />
            <Text style={[s.acceptedText, { color: colors.success }]}>
              ACCEPTED SOLUTION · +{DOUBT_REWARDS.ACCEPTED_SOLUTION} REP AWARDED
            </Text>
          </Row>
        )}

        <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Pressable
            onPress={() => router.push(`/user/${item.author.id}` as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
          >
            <View style={[s.answerAvatar, { backgroundColor: colors.primarySoft }]}>
              {item.author.avatar_url ? (
                <Image source={{ uri: item.author.avatar_url }} style={s.avatarImg} />
              ) : (
                <Text style={{ fontWeight: "800", color: colors.primary, fontSize: 12 }}>
                  {item.author.full_name?.[0] || "U"}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                {item.author.full_name}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </Pressable>

          <Row style={{ gap: 8, alignItems: "center" }}>
            {/* Upvote answer button */}
            <Pressable
              onPress={() => upvoteAnswerMutation.mutate(item.id)}
              disabled={isAnswerUpvoted || upvoteAnswerMutation.isPending}
              style={[
                s.answerUpvoteBtn,
                {
                  backgroundColor: isAnswerUpvoted ? colors.primarySoft : colors.bg,
                  borderColor: isAnswerUpvoted ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isAnswerUpvoted ? "thumb-up" : "thumb-up-outline"}
                size={13}
                color={isAnswerUpvoted ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  s.answerUpvoteText,
                  { color: isAnswerUpvoted ? colors.primary : colors.text },
                ]}
              >
                {item.upvotes_count || 0}
              </Text>
            </Pressable>

            {isAuthor && !isAccepted && (
              <Pressable
                onPress={() => acceptMutation.mutate(item.id)}
                disabled={acceptMutation.isPending}
                style={[s.markAcceptBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="check" size={14} color={colors.primary} />
                <Text style={[s.markAcceptText, { color: colors.primary }]}>Accept</Text>
              </Pressable>
            )}
          </Row>
        </Row>

        <Text style={[s.answerBody, { color: colors.text }]}>{item.body}</Text>
      </View>
    );
  };

  const questionHeader = question ? (
    <View style={{ marginBottom: 4 }}>
      <Card style={[s.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          {question.subject ? <Pill tone="primary">#{question.subject}</Pill> : null}
          {question.topic ? <Pill tone="info">#{question.topic}</Pill> : null}
          {question.urgency !== "normal" ? (
            <Pill tone={getUrgencyMeta(question.urgency).tone}>{getUrgencyMeta(question.urgency).label}</Pill>
          ) : null}
          <Pill tone={question.isResolved ? "success" : "default"}>
            {question.isResolved ? "SOLVED" : "OPEN"}
          </Pill>
        </Row>

        {/* Bounty / Reward Tag */}
        {!question.isResolved ? (
          <Row style={[s.questionBountyPill, { backgroundColor: `${colors.warning}15`, borderColor: `${colors.warning}44` }]}>
            <MaterialCommunityIcons name="star-shooting" size={14} color={colors.warning} />
            <Text style={[s.questionBountyText, { color: colors.warning }]}>
              Reward: +{DOUBT_REWARDS.ANSWER_DOUBT} Rep for answering · +{DOUBT_REWARDS.ACCEPTED_SOLUTION} Rep for accepted solution
            </Text>
          </Row>
        ) : (
          <Row style={[s.questionBountyPill, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}44` }]}>
            <MaterialCommunityIcons name="check-decagram" size={14} color={colors.success} />
            <Text style={[s.questionBountyText, { color: colors.success }]}>
              Verified Solution Accepted · +{DOUBT_REWARDS.ACCEPTED_SOLUTION} Rep awarded to solver
            </Text>
          </Row>
        )}

        <Text style={[s.mainTitle, { color: colors.text }]}>{question.title}</Text>
        <Text style={[s.mainBody, { color: colors.text }]}>{question.body}</Text>

        {question.imageUrl && (
          <View style={[s.questionImageContainer, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            <Image
              source={{ uri: question.imageUrl }}
              style={s.questionImage}
              resizeMode="contain"
            />
          </View>
        )}

        <Pressable
          onPress={() => router.push(`/user/${question.author.id}` as any)}
          style={[s.authorRow, { borderTopColor: colors.divider }]}
        >
          <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
            {question.author.avatar_url ? (
              <Image source={{ uri: question.author.avatar_url }} style={s.avatarImg} />
            ) : (
              <Text style={{ fontWeight: "800", color: colors.primary }}>
                {question.author.full_name?.[0] || "U"}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>
              {question.author.full_name}
            </Text>
            <Text style={[s.authorSub, { color: colors.muted }]} numberOfLines={1}>
              {[question.author.department, question.author.university].filter(Boolean).join(" • ") ||
                `@${question.author.username}`}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted }}>{formatRelativeTime(question.createdAt)}</Text>
        </Pressable>

        <Row style={s.questionActions}>
          <Pressable
            onPress={() => upvoteMutation.mutate()}
            disabled={upvoteMutation.isPending || upvoted}
            style={[
              s.actionPill,
              {
                backgroundColor: upvoted ? colors.primarySoft : colors.background,
                borderColor: upvoted ? colors.primary : colors.border,
              },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons
                name={upvoted ? "thumb-up" : "thumb-up-outline"}
                size={16}
                color={upvoted ? colors.primary : colors.muted}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: upvoted ? colors.primary : colors.text,
                }}
              >
                {question.upvotesCount}
              </Text>
            </Row>
          </Pressable>

          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="comment-text-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
              {question.answersCount} {question.answersCount === 1 ? "Answer" : "Answers"}
            </Text>
          </Row>

          <Row style={{ alignItems: "center", gap: 4, flexShrink: 1 }}>
            <MaterialCommunityIcons name="door-open" size={14} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>
              {roomLabel(question.roomTitle)}
            </Text>
          </Row>
        </Row>
      </Card>

      <Text style={[s.answersSectionTitle, { color: colors.text, marginTop: 16, marginBottom: 8 }]}>
        Answers &amp; Solutions ({question.answers.length})
      </Text>
    </View>
  ) : null;

  const composerPaddingBottom = Platform.select({
    ios: keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 10),
    android: keyboardHeight > 0 ? keyboardHeight + 8 : Math.max(insets.bottom, 10),
    default: Math.max(insets.bottom, 10),
  });

  return (
    <View style={[s.screenContainer, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Nav bar */}
        <Row style={[s.navBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={[s.navTitle, { color: colors.text }]} numberOfLines={1}>
              {question?.roomTitle || "Help Thread"}
            </Text>
            <Muted style={{ fontSize: 11 }}>Q&amp;A Discussion · Earn Reputation</Muted>
          </View>
          <Pressable
            onPress={() => refetch()}
            disabled={isRefetching}
            style={[s.iconBtn, { borderColor: colors.border }]}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="reload" size={18} color={colors.text} />
            )}
          </Pressable>
        </Row>

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {isLoading ? (
            <View style={{ gap: 12, paddingVertical: 16 }}>
              <Skeleton height={160} />
              <Skeleton height={80} />
              <Skeleton height={80} />
            </View>
          ) : isError || !question ? (
            <ErrorState
              detail={(error as Error)?.message || "Question thread not found."}
              onRetry={() => refetch()}
            />
          ) : (
            <FlatList
              ref={flatListRef}
              data={question.answers}
              keyExtractor={(item) => item.id}
              renderItem={renderAnswer}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={() => refetch()}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  progressBackgroundColor={colors.surface}
                />
              }
              contentContainerStyle={{ paddingBottom: 24 }}
              ListHeaderComponent={questionHeader}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Card style={[s.emptyAnswersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={38} color={colors.primary} />
                  <Text style={[s.emptyAnswersTitle, { color: colors.text }]}>No Answers Yet</Text>
                  <Muted style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}>
                    Know the solution? Type below to help out your classmate and earn +15 Rep!
                  </Muted>
                </Card>
              }
            />
          )}
        </View>

        {/* Answer composer with incentive banner */}
        {question && (
          <View
            style={[
              s.composerContainer,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: composerPaddingBottom,
              },
            ]}
          >
            <Row style={[s.composerIncentive, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
              <MaterialCommunityIcons name="star-shooting" size={15} color={colors.primary} />
              <Text style={[s.composerIncentiveText, { color: colors.primary }]}>
                Post an answer to earn <Text style={{ fontWeight: "800" }}>+{DOUBT_REWARDS.ANSWER_DOUBT} Rep</Text> (+{DOUBT_REWARDS.ACCEPTED_SOLUTION} if accepted!)
              </Text>
            </Row>
            <View style={s.composerBar}>
              <TextInput
                placeholder="Write a helpful answer or solution..."
                placeholderTextColor={colors.muted}
                value={answerText}
                onChangeText={setAnswerText}
                multiline
                maxLength={2000}
                onFocus={() => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
                style={[
                  s.composerInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                ]}
              />
              <View style={{ minWidth: 64 }}>
                <Button
                  title="Reply"
                  compact
                  onPress={handleSendAnswer}
                  disabled={answerMutation.isPending || !answerText.trim()}
                />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  screenContainer: {
    flex: 1,
  },
  navBar: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 4,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  questionCard: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 0,
  },
  questionBountyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 10,
  },
  questionBountyText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    marginBottom: 8,
  },
  mainBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  questionImageContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginVertical: 12,
    maxHeight: 280,
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  questionImage: {
    width: "100%",
    height: 260,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  authorSub: {
    fontSize: 11,
  },
  questionActions: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  answersSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  emptyAnswersCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: 8,
    gap: 6,
  },
  emptyAnswersTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  answerCard: {
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 10,
    overflow: "hidden",
  },
  acceptedBanner: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  acceptedText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  answerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  answerUpvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  answerUpvoteText: {
    fontSize: 11,
    fontWeight: "700",
  },
  markAcceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  markAcceptText: {
    fontSize: 11,
    fontWeight: "700",
  },
  answerBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  composerContainer: {
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 12,
  },
  composerIncentive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 6,
  },
  composerIncentiveText: {
    fontSize: 11,
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
  },
});
