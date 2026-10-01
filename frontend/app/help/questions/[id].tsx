import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import {
  Button,
  Card,
  ErrorState,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";

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
};

export default function QuestionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  const [answerText, setAnswerText] = useState("");
  const [upvoted, setUpvoted] = useState(false);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{
    question: QuestionDetail;
  }>({
    queryKey: ["help-question", id],
    queryFn: () => api<{ question: QuestionDetail }>(`/help/questions/${id}`),
    enabled: Boolean(id),
  });

  const question = data?.question;
  const isAuthor = session?.user?.id === question?.author?.id;

  // Upvote question mutation
  const upvoteMutation = useMutation({
    mutationFn: () => api(`/help/questions/${id}/upvote`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic("selection");
      setUpvoted(true);
      qc.invalidateQueries({ queryKey: ["help-question", id] });
    },
    onError: () => {
      Alert.alert("Error", "Could not upvote this question.");
    },
  });

  // Post answer mutation
  const answerMutation = useMutation({
    mutationFn: (body: string) =>
      api(`/help/questions/${id}/answers`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      setAnswerText("");
      qc.invalidateQueries({ queryKey: ["help-question", id] });
      qc.invalidateQueries({ queryKey: ["help-questions"] });
    },
    onError: (err: Error) => {
      Alert.alert("Answer Failed", err.message || "Could not submit your answer.");
    },
  });

  // Mark answer as accepted
  const acceptMutation = useMutation({
    mutationFn: (answerId: string) =>
      api(`/help/questions/${id}/answers/${answerId}/accept`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["help-question", id] });
      qc.invalidateQueries({ queryKey: ["help-questions"] });
    },
    onError: (err: Error) => {
      Alert.alert("Action Failed", err.message || "Could not mark as accepted.");
    },
  });

  const handleSendAnswer = () => {
    if (!answerText.trim()) return;
    answerMutation.mutate(answerText.trim());
  };

  const formatUrgency = (urgency?: string) => {
    if (urgency === "exam_soon") return { text: "Exam Soon", tone: "danger" as const };
    if (urgency === "today") return { text: "Due Today", tone: "warning" as const };
    return { text: "Academic Question", tone: "default" as const };
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Navigation Bar */}
        <Row style={s.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <Text style={[s.navTitle, { color: colors.text }]} numberOfLines={1}>
              {question?.roomTitle || "Help Thread"}
            </Text>
            <Muted style={{ fontSize: 11 }}>Q&A Discussion</Muted>
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

        {isLoading ? (
          <View style={{ gap: 12, paddingVertical: 16 }}>
            <Skeleton height={140} />
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
            data={question.answers}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
            contentContainerStyle={s.scrollContent}
            ListHeaderComponent={
              <View style={s.questionSection}>
                {/* Question Card */}
                <Card style={[s.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Badges */}
                  <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <Row style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {question.subject && <Pill tone="primary">#{question.subject}</Pill>}
                      {question.urgency !== "normal" && (
                        <Pill tone={formatUrgency(question.urgency).tone}>
                          {formatUrgency(question.urgency).text}
                        </Pill>
                      )}
                      {question.isResolved ? (
                        <Pill tone="accent">SOLVED ✓</Pill>
                      ) : (
                        <Pill tone="default">OPEN</Pill>
                      )}
                    </Row>
                    <Muted style={{ fontSize: 11 }}>
                      {new Date(question.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Muted>
                  </Row>

                  {/* Question Title */}
                  <Text style={[s.mainTitle, { color: colors.text }]}>{question.title}</Text>

                  {/* Question Body */}
                  <Text style={[s.mainBody, { color: colors.text }]}>{question.body}</Text>

                  {/* Author Meta */}
                  <Pressable
                    onPress={() => router.push(`/user/${question.author.id}` as any)}
                    style={s.authorRow}
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
                  </Pressable>

                  {/* Actions Bar */}
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
                          Upvote ({question.upvotesCount + (upvoted ? 1 : 0)})
                        </Text>
                      </Row>
                    </Pressable>

                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="comment-text-outline" size={16} color={colors.primary} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                        {question.answersCount} {question.answersCount === 1 ? "Answer" : "Answers"}
                      </Text>
                    </Row>
                  </Row>
                </Card>

                {/* Section Title */}
                <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 18, marginBottom: 8 }}>
                  <Text style={[s.answersSectionTitle, { color: colors.text }]}>
                    Answers & Solutions ({question.answers.length})
                  </Text>
                </Row>
              </View>
            }
            ListEmptyComponent={
              <Card style={[s.emptyAnswersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={36} color={colors.primary} />
                <Text style={[s.emptyAnswersTitle, { color: colors.text }]}>No Answers Yet</Text>
                <Muted style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  Know the solution? Type below to help out your classmate!
                </Muted>
              </Card>
            }
            renderItem={({ item }) => {
              const isAccepted = item.is_accepted;
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
                        ACCEPTED SOLUTION
                      </Text>
                    </Row>
                  )}

                  {/* Answer Author */}
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
                          {new Date(item.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Question Author Accept Button */}
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

                  {/* Answer Text */}
                  <Text style={[s.answerBody, { color: colors.text }]}>{item.body}</Text>
                </View>
              );
            }}
          />
        )}

        {/* Floating Answer Composer Bar at bottom */}
        {question && (
          <View style={[s.composerBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TextInput
              placeholder="Write a clear answer or solution..."
              placeholderTextColor={colors.muted}
              value={answerText}
              onChangeText={setAnswerText}
              multiline
              maxLength={2000}
              style={[
                s.composerInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
            <View style={{ minWidth: 64 }}>
              <Button
                title="Post"
                compact
                onPress={handleSendAnswer}
                disabled={answerMutation.isPending || !answerText.trim()}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  navBar: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
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
  scrollContent: {
    paddingBottom: 24,
  },
  questionSection: {
    marginBottom: 10,
  },
  questionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
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
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,150,150,0.2)",
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
    borderRadius: 20,
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
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  emptyAnswersTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  answerCard: {
    padding: 14,
    borderRadius: 14,
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
  markAcceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
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
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
  },
});
