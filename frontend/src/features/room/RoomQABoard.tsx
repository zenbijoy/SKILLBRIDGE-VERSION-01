import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, Image } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Pill, Row, ErrorState, Button } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenEmptyStatesV2 } from "@/assets/nextgen";
import type { Profile } from "@/types";

export type Question = {
  id: string;
  room_id: string;
  author: Profile;
  title: string;
  body: string;
  is_resolved: boolean;
  upvotes_count: number;
  created_at: string;
  answers: {
    id: string;
    body: string;
    is_accepted: boolean;
    upvotes_count: number;
    created_at: string;
    author: Profile;
  }[];
};

export function RoomQABoard({ roomId, isMember }: { roomId: string; isMember: boolean }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showAskModal, setShowAskModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<{ questions: Question[] }>({
    queryKey: ["room-questions", roomId],
    queryFn: () => api(`/rooms/${roomId}/questions`),
    enabled: Boolean(roomId),
  });

  const acceptMutation = useMutation({
    mutationFn: ({ qId, aId }: { qId: string; aId: string }) =>
      api(`/rooms/${roomId}/questions/${qId}/answers/${aId}/accept`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-questions", roomId] });
      Alert.alert("Accepted Solution 🎉", "This answer has been marked as the accepted solution!");
    },
    onError: (err: Error) => Alert.alert("Could not accept answer", err.message),
  });

  const askMutation = useMutation({
    mutationFn: () =>
      api(`/rooms/${roomId}/questions`, {
        method: "POST",
        body: JSON.stringify({ title: newTitle, body: newBody }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-questions", roomId] });
      setShowAskModal(false);
      setNewTitle("");
      setNewBody("");
    },
    onError: (err: Error) => Alert.alert("Could not post question", err.message),
  });

  const answerMutation = useMutation({
    mutationFn: (qId: string) =>
      api(`/rooms/${roomId}/questions/${qId}/answers`, {
        method: "POST",
        body: JSON.stringify({ body: answerText }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-questions", roomId] });
      setAnsweringQuestionId(null);
      setAnswerText("");
    },
    onError: (err: Error) => Alert.alert("Could not post answer", err.message),
  });

  const voteMutation = useMutation({
    mutationFn: (qId: string) =>
      api(`/rooms/${roomId}/questions/${qId}/vote`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-questions", roomId] });
    },
  });

  const questions = data?.questions ?? [];

  return (
    <View style={styles.container}>
      <Row style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Discussion & Q&A</Text>
        {isMember && (
          <Pressable
            onPress={() => setShowAskModal(true)}
            style={[styles.askBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="help-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.askBtnText}>Ask Question</Text>
          </Pressable>
        )}
      </Row>

      {showAskModal && (
        <Card style={styles.askCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Ask a Question</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Question Title (e.g. How does Dijkstra handle negative edges?)"
            placeholderTextColor={colors.muted}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <TextInput
            style={[styles.inputArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Explain what you've tried or where you are stuck..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            value={newBody}
            onChangeText={setNewBody}
          />
          <Row style={styles.actionRow}>
            <Pressable onPress={() => setShowAskModal(false)} style={styles.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => askMutation.mutate()}
              disabled={askMutation.isPending || !newTitle.trim() || !newBody.trim()}
              style={[
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: newTitle.trim() && newBody.trim() ? 1 : 0.6 },
              ]}
            >
              {askMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Publish Question</Text>
              )}
            </Pressable>
          </Row>
        </Card>
      )}

      {isError ? (
        <ErrorState
          detail={(error as Error)?.message || "Failed to load discussions."}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : questions.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Image
            source={nextGenEmptyStatesV2.noAnswers}
            style={{ width: 90, height: 90 }}
            resizeMode="contain"
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No questions asked yet in this room
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Have a doubt about this topic? Be the first to ask!
          </Text>
        </Card>
      ) : (
        questions.map((q) => (
          <Card key={q.id} style={styles.questionCard}>
            <Row style={styles.qHeader}>
              <Pressable
                onPress={() => voteMutation.mutate(q.id)}
                style={[styles.upvoteBadge, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <MaterialCommunityIcons name="arrow-up-bold" size={16} color={colors.primary} />
                <Text style={[styles.upvoteCount, { color: colors.text }]}>{q.upvotes_count}</Text>
              </Pressable>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[styles.qTitle, { color: colors.text }]}>{q.title}</Text>
                  {q.is_resolved && <Pill tone="success">Solved</Pill>}
                </Row>
                <Text style={[styles.authorName, { color: colors.muted }]}>
                  Asked by {q.author?.full_name || "Member"}
                </Text>
              </View>
            </Row>

            <Text style={[styles.qBody, { color: colors.text }]}>{q.body}</Text>

            {/* Answer Thread */}
            {q.answers && q.answers.length > 0 && (
              <View style={[styles.answersContainer, { borderTopColor: colors.border }]}>
                {q.answers.map((a) => (
                  <View key={a.id} style={[styles.answerItem, { backgroundColor: colors.surface }]}>
                    <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={[styles.answerAuthor, { color: colors.text }]}>
                        {a.author?.full_name || "Peer"}
                      </Text>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        {a.is_accepted ? (
                          <Pill tone="success">Accepted Solution ✓</Pill>
                        ) : (
                          isMember && !q.is_resolved && (
                            <Pressable
                              onPress={() => acceptMutation.mutate({ qId: q.id, aId: a.id })}
                              disabled={acceptMutation.isPending}
                              style={[styles.acceptBtn, { borderColor: colors.primary }]}
                            >
                              <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.primary} />
                              <Text style={[styles.acceptBtnText, { color: colors.primary }]}>Accept</Text>
                            </Pressable>
                          )
                        )}
                      </Row>
                    </Row>
                    <Text style={[styles.answerBody, { color: colors.text }]}>{a.body}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Answer Input */}
            {isMember && (
              <View style={{ marginTop: 12 }}>
                {answeringQuestionId === q.id ? (
                  <View>
                    <TextInput
                      style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                      placeholder="Write your answer or explanation..."
                      placeholderTextColor={colors.muted}
                      value={answerText}
                      onChangeText={setAnswerText}
                    />
                    <Row style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                      <Pressable onPress={() => setAnsweringQuestionId(null)} style={styles.cancelBtn}>
                        <Text style={{ color: colors.muted }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => answerMutation.mutate(q.id)}
                        disabled={answerMutation.isPending || !answerText.trim()}
                        style={[styles.smallSubmitBtn, { backgroundColor: colors.primary }]}
                      >
                        <Text style={styles.submitBtnText}>Post</Text>
                      </Pressable>
                    </Row>
                  </View>
                ) : (
                  <Pressable onPress={() => setAnsweringQuestionId(q.id)} style={styles.replyBtn}>
                    <MaterialCommunityIcons name="reply" size={16} color={colors.primary} />
                    <Text style={[styles.replyBtnText, { color: colors.primary }]}>Reply / Answer</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  headerRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "700" },
  askBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  askBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  askCard: { padding: 14, marginBottom: 14, borderRadius: radius.lg },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  inputArea: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 90, textAlignVertical: "top", marginBottom: 10 },
  actionRow: { justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  smallSubmitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md },
  submitBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  emptyCard: { padding: 28, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, fontWeight: "600", marginTop: 8 },
  emptySubtext: { fontSize: 13, marginTop: 4, textAlign: "center" },
  questionCard: { padding: 14, marginBottom: 12, borderRadius: radius.lg },
  qHeader: { alignItems: "flex-start" },
  upvoteBadge: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 6, alignItems: "center", minWidth: 38 },
  upvoteCount: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  qTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  authorName: { fontSize: 12, marginTop: 2 },
  qBody: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  answersContainer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 8 },
  answerItem: { padding: 10, borderRadius: radius.md },
  answerAuthor: { fontSize: 12, fontWeight: "600" },
  answerBody: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
  replyBtnText: { fontSize: 13, fontWeight: "600" },
  acceptBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  acceptBtnText: { fontSize: 11, fontWeight: "700" },
});
