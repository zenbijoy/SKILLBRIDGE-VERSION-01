import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

type QuizDetail = {
  id: string;
  title: string;
  skill_name: string;
  questions: QuizQuestion[];
};

type QuizSummary = {
  id: string;
  title: string;
  description: string;
  skill_name: string;
  question_count: number;
  reward_points: number;
};

export default function QuizScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  // Mode: "catalog" | "active" | "result"
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean } | null>(null);

  // 1. Catalog Query
  const catalogQuery = useQuery({
    queryKey: ["quiz-catalog"],
    queryFn: () => api<{ quizzes: QuizSummary[] }>("/quiz/catalog"),
  });

  // 2. Active Quiz Query
  const activeQuizQuery = useQuery({
    queryKey: ["quiz-detail", selectedQuizId],
    queryFn: () => api<{ quiz: QuizDetail | null }>(`/quiz/${selectedQuizId}`),
    enabled: Boolean(selectedQuizId),
  });

  // 3. Submit Mutation
  const submit = useMutation({
    mutationFn: () =>
      api<{ score: number; passed: boolean; attemptId: string }>("/quiz/submit", {
        method: "POST",
        body: JSON.stringify({ quizId: selectedQuizId, answers }),
      }),
    onSuccess: (res) => {
      triggerHaptic();
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: any) => Alert.alert("Submission failed", e.message),
  });

  const quiz = activeQuizQuery.data?.quiz;
  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;

  const startQuiz = (id: string) => {
    triggerHaptic();
    setSelectedQuizId(id);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setLastResult(null);
  };

  const resetToCatalog = () => {
    triggerHaptic();
    setSelectedQuizId(null);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setLastResult(null);
  };

  // Render Result View
  if (lastResult) {
    const isPassed = lastResult.passed;
    return (
      <Screen>
        <Card tone={isPassed ? "glow" : "soft"} style={s.resultCard}>
          <MaterialCommunityIcons
            name={isPassed ? "check-decagram" : "refresh"}
            size={64}
            color={isPassed ? colors.primary : colors.muted}
          />
          <H1>{isPassed ? "Skill Verified! 🎓" : "Keep Practicing 💡"}</H1>
          <Text style={[s.scoreText, { color: isPassed ? colors.primary : colors.text }]}>
            {lastResult.score}% Score
          </Text>
          <Muted style={{ textAlign: "center", paddingHorizontal: 20 }}>
            {isPassed
              ? "Congratulations! Your skill has been verified on your campus profile and added to your Skill Passport."
              : "You need 80% or higher to verify this skill. Review study room materials and try again."}
          </Muted>

          {isPassed ? (
            <Row style={{ marginTop: 10 }}>
              <Pill tone="accent">+15 Reputation Points</Pill>
              <Pill tone="success">Verified Badge Added</Pill>
            </Row>
          ) : null}

          <Row style={{ marginTop: 16, gap: 10 }}>
            <Button title="Back to Quizzes" variant="secondary" onPress={resetToCatalog} />
            {!isPassed ? (
              <Button
                title="Retake Quiz"
                variant="primary"
                onPress={() => {
                  setAnswers({});
                  setCurrentQuestionIndex(0);
                  setLastResult(null);
                }}
              />
            ) : null}
          </Row>
        </Card>
      </Screen>
    );
  }

  // Render Active Quiz Screen
  if (selectedQuizId && quiz) {
    const progressPercent = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
    return (
      <Screen>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Pill tone="primary">{quiz.skill_name}</Pill>
          <Pressable onPress={resetToCatalog}>
            <Muted style={{ fontWeight: "700" }}>Exit Quiz</Muted>
          </Pressable>
        </Row>

        <H1>{quiz.title}</H1>

        {/* Progress Bar */}
        <View style={s.progressWrap}>
          <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </Text>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>
              {answeredCount}/{questions.length} Answered
            </Text>
          </Row>
          <View style={[s.progressTrack, { backgroundColor: colors.surface2 }]}>
            <View style={[s.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>

        {/* Current Question Card */}
        {currentQuestion ? (
          <Card tone="glow">
            <Text style={[s.questionPrompt, { color: colors.text }]}>
              {currentQuestionIndex + 1}. {currentQuestion.prompt}
            </Text>

            <View style={{ gap: 8, marginTop: 12 }}>
              {currentQuestion.options.map((option, optIndex) => {
                const isSelected = answers[currentQuestion.id] === optIndex;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      triggerHaptic();
                      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optIndex }));
                    }}
                    style={[
                      s.optionTile,
                      {
                        backgroundColor: isSelected ? colors.primarySoft : colors.surface2,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        s.radioCircle,
                        { borderColor: isSelected ? colors.primary : colors.muted },
                      ]}
                    >
                      {isSelected ? <View style={[s.radioInner, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: isSelected ? "800" : "500",
                        fontSize: 14,
                        flex: 1,
                      }}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Navigation / Submit Controls */}
        <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
          <Button
            title="← Previous"
            variant="ghost"
            disabled={currentQuestionIndex === 0}
            onPress={() => {
              triggerHaptic();
              setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
            }}
          />

          {currentQuestionIndex < questions.length - 1 ? (
            <Button
              title="Next →"
              variant="primary"
              disabled={!currentQuestion || answers[currentQuestion.id] === undefined}
              onPress={() => {
                triggerHaptic();
                setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
              }}
            />
          ) : (
            <Button
              title={submit.isPending ? "Evaluating…" : "Submit Verification 🚀"}
              variant="primary"
              disabled={answeredCount < questions.length || submit.isPending}
              loading={submit.isPending}
              onPress={() => submit.mutate()}
            />
          )}
        </Row>
      </Screen>
    );
  }

  // Render Catalog View
  return (
    <Screen>
      <H1>Skill Verification & Quizzes 🧠</H1>
      <Muted>
        Take peer-reviewed academic assessments to earn verified badges and climb the campus tutor leaderboard.
      </Muted>

      {catalogQuery.isLoading ? (
        <>
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </>
      ) : null}

      {catalogQuery.isError ? (
        <ErrorState detail={(catalogQuery.error as Error).message} onRetry={() => catalogQuery.refetch()} />
      ) : null}

      {catalogQuery.data?.quizzes?.map((q) => (
        <Card key={q.id} tone="soft">
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Pill tone="primary">{q.skill_name}</Pill>
            <Pill tone="accent">+{q.reward_points} REP</Pill>
          </Row>

          <H2>{q.title}</H2>
          <Muted>{q.description}</Muted>

          <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Row style={{ alignItems: "center" }}>
              <MaterialCommunityIcons name="help-circle-outline" size={16} color={colors.muted} />
              <Muted>{q.question_count} Questions</Muted>
            </Row>
            <Button title="Start Assessment →" compact onPress={() => startQuiz(q.id)} />
          </Row>
        </Card>
      ))}

      {catalogQuery.data?.quizzes?.length === 0 && !catalogQuery.isLoading ? (
        <Empty
          title="No quizzes available"
          detail="Check back soon for new topic assessments created by campus faculties."
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  progressWrap: { marginVertical: 8, gap: 4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  questionPrompt: { fontSize: 16, fontWeight: "800", lineHeight: 22 },
  optionTile: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 12,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  resultCard: { alignItems: "center", paddingVertical: 24, gap: 10 },
  scoreText: { fontSize: 32, fontWeight: "900" },
});
