import React, { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { YouTubePlayer } from "@/components/live/YouTubePlayer";
import { Button, Card, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";

interface Question {
  id: string;
  authorName: string;
  question: string;
  upvotes: number;
  hasUpvoted: boolean;
  status: "pending" | "accepted_live" | "answered";
}

const SAMPLE_QUESTIONS: Question[] = [
  {
    id: "q1",
    authorName: "Tanvir Rahman",
    question: "How do we prepare for the upcoming university programming contest?",
    upvotes: 24,
    hasUpvoted: true,
    status: "accepted_live",
  },
  {
    id: "q2",
    authorName: "Farzana Akter",
    question: "Will the presentation slides and code samples be shared on SkillBridge?",
    upvotes: 18,
    hasUpvoted: false,
    status: "pending",
  },
  {
    id: "q3",
    authorName: "Mahir Faisal",
    question: "Is Python accepted in the competitive programming track?",
    upvotes: 11,
    hasUpvoted: false,
    status: "pending",
  },
];

export default function BroadcastScreen() {
  const { id, videoId, title, clubName } = useLocalSearchParams<{
    id: string;
    videoId?: string;
    title?: string;
    clubName?: string;
  }>();

  const { colors } = useTheme();
  const [questions, setQuestions] = useState<Question[]>(SAMPLE_QUESTIONS);
  const [newQuestion, setNewQuestion] = useState("");
  const [isQaOpen, setIsQaOpen] = useState(true);
  const [isLiveKitStageActive, setIsLiveKitStageActive] = useState(false);

  const resolvedVideoId = videoId || "dQw4w9WgXcQ";

  const handleUpvote = (questionId: string) => {
    triggerHaptic();
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id === questionId) {
          const delta = q.hasUpvoted ? -1 : 1;
          return { ...q, upvotes: q.upvotes + delta, hasUpvoted: !q.hasUpvoted };
        }
        return q;
      }).sort((a, b) => b.upvotes - a.upvotes),
    );
  };

  const handlePostQuestion = () => {
    if (!newQuestion.trim()) return;
    triggerHaptic();
    const newQ: Question = {
      id: `q_${Date.now()}`,
      authorName: "You",
      question: newQuestion.trim(),
      upvotes: 1,
      hasUpvoted: true,
      status: "pending",
    };
    setQuestions((prev) => [newQ, ...prev]);
    setNewQuestion("");
  };

  return (
    <Screen scroll={false} contentStyle={{ flex: 1, padding: 0 }}>
      {/* 1. Live Video Stream Player (YouTube Embedded) */}
      <View style={styles.videoSection}>
        <YouTubePlayer videoId={resolvedVideoId} isLive={true} />
      </View>

      {/* 2. Broadcast Title & Info Bar */}
      <View style={[styles.infoBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <Pill tone="danger">🔴 LIVE</Pill>
            <Text style={[styles.clubTag, { color: colors.primary }]}>{clubName || "University Club"}</Text>
          </Row>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title || "Campus Workshop & Live Seminar"}
          </Text>
        </View>

        <Button
          title="🎙️ Join Q&A Stage"
          compact
          variant="secondary"
          onPress={() => {
            triggerHaptic();
            router.push(`/live/qa-stage-${id}` as any);
          }}
        />
      </View>

      {/* 3. Interactive SkillBridge Q&A Queue */}
      <View style={styles.qaSection}>
        <Row style={{ justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
          <H2 style={{ fontSize: 16 }}>Live Q&A Queue ({questions.length})</H2>
          <Muted style={{ fontSize: 12 }}>Top upvoted questions answered first</Muted>
        </Row>

        <FlatList
          data={questions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          renderItem={({ item }) => (
            <Card style={styles.questionCard}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Row style={{ alignItems: "center", gap: 6 }}>
                    <Text style={[styles.authorName, { color: colors.text }]}>{item.authorName}</Text>
                    {item.status === "accepted_live" ? (
                      <Pill tone="accent">Speaking on Stage 🎙️</Pill>
                    ) : null}
                  </Row>
                  <Text style={[styles.questionText, { color: colors.text }]}>{item.question}</Text>
                </View>

                {/* Upvote Button */}
                <Pressable
                  onPress={() => handleUpvote(item.id)}
                  style={[
                    styles.upvoteBtn,
                    {
                      backgroundColor: item.hasUpvoted ? colors.primary : colors.surface2,
                      borderColor: item.hasUpvoted ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="thumb-up-outline"
                    size={16}
                    color={item.hasUpvoted ? "#FFFFFF" : colors.muted}
                  />
                  <Text
                    style={[
                      styles.upvoteCount,
                      { color: item.hasUpvoted ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {item.upvotes}
                  </Text>
                </Pressable>
              </Row>
            </Card>
          )}
        />

        {/* Question Composer */}
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            placeholder="Ask a question for the live speaker…"
            placeholderTextColor={colors.muted}
            value={newQuestion}
            onChangeText={setNewQuestion}
            onSubmitEditing={handlePostQuestion}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
          />
          <Button
            title="Ask"
            compact
            onPress={handlePostQuestion}
            disabled={!newQuestion.trim()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  videoSection: {
    width: "100%",
    backgroundColor: "#000000",
  },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  clubTag: {
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  qaSection: {
    flex: 1,
  },
  questionCard: {
    padding: 12,
    borderRadius: 12,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  questionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  upvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  upvoteCount: {
    fontSize: 12,
    fontWeight: "800",
  },
  composer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
  },
});
