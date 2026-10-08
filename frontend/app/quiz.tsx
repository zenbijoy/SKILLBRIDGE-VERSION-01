import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  SlideInRight,
  ZoomIn,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";

type Difficulty = "easy" | "medium" | "hard";
type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";

interface SkillCatalogItem {
  skill_id: string;
  skill_name: string;
  category: string;
  difficulties: Difficulty[];
  time_limit_seconds: number;
  pass_threshold: number;
  question_count: number;
  reward_points: Record<Difficulty, number>;
}

interface ClientQuestion {
  id: string;
  prompt: string;
  options: string[];
  bloom_level: BloomLevel;
  difficulty: Difficulty;
  topic_tag: string;
}

interface QuizSession {
  session_id: string;
  skill_name: string;
  topic: string;
  difficulty: Difficulty;
  question_count: number;
  time_limit_seconds: number;
  expires_at: string;
  questions: ClientQuestion[];
  max_violations: number;
  already_passed: boolean;
}

interface QuestionResult {
  question_id: string;
  prompt: string;
  your_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
  bloom_level: BloomLevel;
  difficulty: Difficulty;
}

interface GradingResult {
  attempt_id: string;
  score: number;
  passed: boolean;
  correct_count: number;
  total_count: number;
  pass_threshold: number;
  question_results: QuestionResult[];
  bloom_breakdown: Record<BloomLevel, { correct: number; total: number }>;
  skill_name: string;
  difficulty: Difficulty;
  violation_count: number;
  reward_points: number;
}

type Mode = "catalog" | "configure" | "generating" | "quiz" | "review";

const BLOOM_ICON: Record<BloomLevel, string> = {
  remember: "brain",
  understand: "lightbulb-outline",
  apply: "tools",
  analyze: "magnify",
  evaluate: "scale-balance",
  create: "creation",
};

const BLOOM_COLOR: Record<BloomLevel, string> = {
  remember: "#6B7280",
  understand: "#3B82F6",
  apply: "#10B981",
  analyze: "#F59E0B",
  evaluate: "#8B5CF6",
  create: "#EF4444",
};

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: "#10B981",
  medium: "#F59E0B",
  hard: "#EF4444",
};

const DIFF_ICON: Record<Difficulty, string> = {
  easy: "speedometer-slow",
  medium: "speedometer-medium",
  hard: "speedometer",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ":" + s.toString().padStart(2, "0");
}

export default function QuizScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("catalog");
  const [selectedSkill, setSelectedSkill] = useState<SkillCatalogItem | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("medium");
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<GradingResult | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const appStateRef = useRef(AppState.currentState);

  // Stable refs to prevent stale closure on auto-submit (H1 fix)
  const sessionRef = useRef<QuizSession | null>(null);
  const answersRef = useRef<Record<string, number>>({});
  const elapsedSecondsRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const [customSkillInput, setCustomSkillInput] = useState("");
  const [customConditionInput, setCustomConditionInput] = useState("");
  const [customDifficulty, setCustomDifficulty] = useState<Difficulty>("medium");

  const catalogQuery = useQuery({
    queryKey: ["quiz-catalog-v2"],
    queryFn: () => api<{ catalog: SkillCatalogItem[] }>("/quiz/catalog"),
  });

  const passportQuery = useQuery({
    queryKey: ["quiz-passport"],
    queryFn: () => api<{ verified_skills: any[]; stats: any }>("/quiz/passport"),
  });

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleSubmit = useCallback((autoSubmit = false) => {
    const activeSession = sessionRef.current || session;
    if (!activeSession || isSubmittingRef.current || submitMutation.isPending) return;
    isSubmittingRef.current = true;
    if (!autoSubmit) triggerHaptic();
    submitMutation.mutate({
      session_id: activeSession.session_id,
      answers: answersRef.current,
      elapsed: elapsedSecondsRef.current,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const startTimer = useCallback((limitSeconds: number) => {
    stopTimer();
    setTimeLeft(limitSeconds);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
      elapsedSecondsRef.current = elapsed;
      const remaining = limitSeconds - elapsed;
      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setTimeLeft(0);
        Alert.alert("Time is up!", "Your assessment has been auto-submitted.");
        handleSubmit(true);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
  }, [handleSubmit, stopTimer]);

  useEffect(() => {
    if (mode !== "quiz" || !session) return;
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current === "active" && (nextState === "background" || nextState === "inactive")) {
        const newCount = violationCount + 1;
        setViolationCount(newCount);
        try {
          const vr = await api<{ terminated: boolean; violation_count: number }>(
            "/quiz/violation",
            { method: "POST", body: JSON.stringify({ session_id: session.session_id }) }
          );
          if (vr?.violation_count !== undefined) {
            setViolationCount(vr.violation_count);
          }
          if (vr?.terminated) {
            stopTimer();
            Alert.alert("Assessment Terminated", "You left the assessment screen too many times.");
            resetToMenu();
          } else {
            Alert.alert("Warning " + (vr?.violation_count ?? newCount) + "/" + session.max_violations, "Leaving the app counts as a violation.");
          }
        } catch { /* best-effort */ }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToMenu is declared below; listener is keyed on session/violation state
  }, [mode, session, violationCount, stopTimer]);

  const startMutation = useMutation({
    mutationFn: (vars: {
      skill_id?: string;
      custom_skill_name?: string;
      topic?: string;
      difficulty: Difficulty;
      context_info?: string;
    }) =>
      api<QuizSession>("/quiz/start", {
        method: "POST",
        body: JSON.stringify({
          skill_id: vars.skill_id,
          custom_skill_name: vars.custom_skill_name,
          topic: vars.topic,
          difficulty: vars.difficulty,
          context_info: vars.context_info,
          question_count: 10,
        }),
      }),
    onSuccess: (data) => {
      triggerHaptic();
      sessionRef.current = data;
      answersRef.current = {};
      elapsedSecondsRef.current = 0;
      isSubmittingRef.current = false;
      setSession(data);
      setCurrentIdx(0);
      setAnswers({});
      setViolationCount(0);
      setMode("quiz");
      startTimer(data.time_limit_seconds);
    },
    onError: (e: any) => Alert.alert("Could not start assessment", e.message ?? "Please try again."),
  });

  const submitMutation = useMutation({
    mutationFn: (vars: { session_id: string; answers: Record<string, number>; elapsed: number }) =>
      api<GradingResult>("/quiz/submit", {
        method: "POST",
        body: JSON.stringify({ session_id: vars.session_id, answers: vars.answers, elapsed_seconds: vars.elapsed }),
      }),
    onSuccess: (data) => {
      triggerHaptic();
      stopTimer();
      isSubmittingRef.current = false;
      setResult(data);
      setMode("review");
      setReviewIdx(0);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["quiz-passport"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: any) => {
      isSubmittingRef.current = false;
      Alert.alert("Submission failed", e.message ?? "Please try again.");
    },
  });

  const resetToMenu = () => {
    stopTimer();
    setMode("catalog");
    setSession(null);
    setResult(null);
    setSelectedSkill(null);
    setCurrentIdx(0);
    setAnswers({});
    setViolationCount(0);
    setTopic("");
  };

  // Generating loader
  if (mode === "generating" || startMutation.isPending) {
    return (
      <Screen>
        <Animated.View entering={FadeIn} style={s.centeredFull}>
          <Animated.View entering={ZoomIn.delay(200)} style={[s.genIcon, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons name="brain" size={56} color={colors.primary} />
          </Animated.View>
          <H1 style={{ textAlign: "center" }}>Crafting Your Assessment</H1>
          <Muted style={{ textAlign: "center", paddingHorizontal: 32 }}>
            Gemini AI is generating personalised questions with Bloom taxonomy distractor engineering.
          </Muted>
          <Row style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[s.genDot, { backgroundColor: colors.primary, opacity: 0.3 + i * 0.3 }]} />
            ))}
          </Row>
        </Animated.View>
      </Screen>
    );
  }

  // Configure screen
  if (mode === "configure" && selectedSkill) {
    return (
      <Screen>
        <Animated.View entering={SlideInRight.springify()}>
          <Row style={{ alignItems: "center", marginBottom: 4 }}>
            <Pressable onPress={() => setMode("catalog")} style={s.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={colors.muted} />
            </Pressable>
            <Muted>Assessment Setup</Muted>
          </Row>
          <H1>{selectedSkill.skill_name}</H1>
          <Muted style={{ marginBottom: 20 }}>Choose difficulty and enter a specific topic.</Muted>

          <Text style={[s.sectionLabel, { color: colors.text }]}>Difficulty Level</Text>
          <Row style={{ gap: 10, marginBottom: 20 }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
              const sel = selectedDifficulty === d;
              return (
                <Pressable key={d} onPress={() => { triggerHaptic(); setSelectedDifficulty(d); }}
                  style={[s.diffPill, { backgroundColor: sel ? DIFF_COLOR[d] + "22" : colors.surface2, borderColor: sel ? DIFF_COLOR[d] : colors.border }]}>
                  <MaterialCommunityIcons name={DIFF_ICON[d] as any} size={16} color={sel ? DIFF_COLOR[d] : colors.muted} />
                  <Text style={{ color: sel ? DIFF_COLOR[d] : colors.muted, fontWeight: "700", textTransform: "capitalize", fontSize: 13 }}>{d}</Text>
                  <Text style={{ color: sel ? DIFF_COLOR[d] : colors.muted, fontSize: 11 }}>+{selectedSkill.reward_points[d]} pts</Text>
                </Pressable>
              );
            })}
          </Row>

          <Text style={[s.sectionLabel, { color: colors.text }]}>Assessment Topic</Text>
          <View
            style={[
              s.topicInput,
              { backgroundColor: colors.surface2, borderColor: topic.trim() ? colors.primary : colors.border },
            ]}
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={18}
              color={topic.trim() ? colors.primary : colors.muted}
            />
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. 'Linked Lists', 'SQL Joins', 'Hooks'"
              placeholderTextColor={colors.muted}
              style={[s.topicText, { color: colors.text }]}
              autoCapitalize="words"
              returnKeyType="done"
            />
            {topic.length > 0 && (
              <Pressable onPress={() => setTopic("")} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <Row style={{ gap: 8, marginVertical: 14 }}>
            {[
              { icon: "help-circle-outline", label: "10 Questions", color: colors.info },
              { icon: "clock-outline", label: "15 Minutes", color: colors.warning },
              { icon: "check-decagram", label: "80% to Pass", color: colors.success },
            ].map((item) => (
              <View key={item.label} style={[s.infoChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <MaterialCommunityIcons name={item.icon as any} size={15} color={item.color} />
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>{item.label}</Text>
              </View>
            ))}
          </Row>

          <Card tone="soft" style={{ marginBottom: 16 }}>
            <Row style={{ alignItems: "flex-start", gap: 10 }}>
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Secure Server-Side Grading</Text>
                <Muted style={{ fontSize: 12, marginTop: 2 }}>
                  Answer keys never leave the server. Grading is 100% authoritative. Questions are AI-generated with real distractor engineering.
                </Muted>
              </View>
            </Row>
          </Card>

          <Button
            title={topic ? "Start " + selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1) + " Assessment" : "Enter a topic to continue"}
            variant="primary"
            disabled={!topic || startMutation.isPending}
            loading={startMutation.isPending}
            onPress={() => { setMode("generating"); startMutation.mutate({ skill_id: selectedSkill.skill_id, topic, difficulty: selectedDifficulty }); }}
          />
        </Animated.View>
      </Screen>
    );
  }

  // Active quiz
  if (mode === "quiz" && session) {
    const questions = session.questions;
    const question = questions[currentIdx];
    const progress = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0;
    const answeredCount = Object.keys(answers).length;
    const isLastQ = currentIdx === questions.length - 1;
    const allAnswered = answeredCount >= questions.length;
    const isTimeCritical = timeLeft > 0 && timeLeft <= 120;

    return (
      <Screen>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Pill tone="primary">{session.skill_name}</Pill>
          <Row style={{ alignItems: "center", gap: 8 }}>
            {timeLeft > 0 && (
              <View style={[s.timer, { backgroundColor: isTimeCritical ? "#EF444422" : colors.surface2, borderColor: isTimeCritical ? "#EF4444" : colors.border }]}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={isTimeCritical ? "#EF4444" : colors.muted} />
                <Text style={{ color: isTimeCritical ? "#EF4444" : colors.muted, fontWeight: "800", fontSize: 13 }}>{formatTime(timeLeft)}</Text>
              </View>
            )}
            {violationCount > 0 && (
              <View style={[s.violBadge, { backgroundColor: "#F59E0B22", borderColor: "#F59E0B" }]}>
                <MaterialCommunityIcons name="alert" size={12} color="#F59E0B" />
                <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 11 }}>{violationCount}/{session.max_violations}</Text>
              </View>
            )}
            <Pressable onPress={() => Alert.alert("Exit Quiz?", "Progress will be lost.", [
              { text: "Cancel", style: "cancel" },
              { text: "Exit", style: "destructive", onPress: resetToMenu },
            ])}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>
        </Row>

        <View style={s.progressWrap}>
          <Row style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Q{currentIdx + 1}/{questions.length}</Text>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>{answeredCount}/{questions.length} Answered</Text>
          </Row>
          <View style={[s.progressTrack, { backgroundColor: colors.surface2 }]}>
            <View style={[s.progressFill, { width: (progress + "%") as any, backgroundColor: colors.primary }]} />
          </View>
        </View>

        {question && (
          <Row style={{ gap: 6, marginBottom: 8 }}>
            <View style={[s.bloomBadge, { backgroundColor: BLOOM_COLOR[question.bloom_level] + "22" }]}>
              <MaterialCommunityIcons name={BLOOM_ICON[question.bloom_level] as any} size={12} color={BLOOM_COLOR[question.bloom_level]} />
              <Text style={{ color: BLOOM_COLOR[question.bloom_level], fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>{question.bloom_level}</Text>
            </View>
            <View style={[s.bloomBadge, { backgroundColor: DIFF_COLOR[question.difficulty] + "22" }]}>
              <Text style={{ color: DIFF_COLOR[question.difficulty], fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>{question.difficulty}</Text>
            </View>
            <View style={[s.bloomBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{question.topic_tag}</Text>
            </View>
          </Row>
        )}

        {question && (
          <Animated.View key={currentIdx} entering={FadeInRight.duration(250).springify()}>
            <Card tone="glow" style={{ marginBottom: 12 }}>
              <Text style={[s.questionPrompt, { color: colors.text }]}>{currentIdx + 1}. {question.prompt}</Text>
              <View style={{ gap: 8, marginTop: 14 }}>
                {question.options.map((option, optIdx) => {
                  const isSel = answers[question.id] === optIdx;
                  return (
                    <Pressable
                      key={question.id + optIdx}
                      onPress={() => {
                        triggerHaptic();
                        answersRef.current = { ...answersRef.current, [question.id]: optIdx };
                        setAnswers((p) => ({ ...p, [question.id]: optIdx }));
                      }}
                      style={[s.optionTile, { backgroundColor: isSel ? colors.primarySoft : colors.surface2, borderColor: isSel ? colors.primary : colors.border }]}>
                      <View style={[s.optionLetter, { backgroundColor: isSel ? colors.primary : colors.border }]}>
                        <Text style={{ color: isSel ? "#fff" : colors.muted, fontWeight: "800", fontSize: 12 }}>{["A","B","C","D"][optIdx]}</Text>
                      </View>
                      <Text style={{ color: colors.text, fontWeight: isSel ? "700" : "500", fontSize: 14, flex: 1, lineHeight: 20 }}>{option}</Text>
                      {isSel && <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          </Animated.View>
        )}

        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <Button title="Prev" variant="ghost" compact disabled={currentIdx === 0} onPress={() => { triggerHaptic(); setCurrentIdx((p) => Math.max(0, p - 1)); }} />
          {isLastQ ? (
            <Button
              title={submitMutation.isPending ? "Grading..." : allAnswered ? "Submit Assessment" : "Answer all (" + answeredCount + "/" + questions.length + ")"}
              variant="primary" disabled={!allAnswered || submitMutation.isPending} loading={submitMutation.isPending}
              onPress={() => handleSubmit(false)} />
          ) : (
            <Button title="Next" variant="primary" compact onPress={() => { triggerHaptic(); setCurrentIdx((p) => Math.min(questions.length - 1, p + 1)); }} />
          )}
        </Row>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <Row style={{ gap: 6, paddingHorizontal: 2, paddingVertical: 4 }}>
            {questions.map((q, i) => {
              const isAns = answers[q.id] !== undefined;
              const isCur = i === currentIdx;
              return (
                <Pressable key={q.id} onPress={() => setCurrentIdx(i)}
                  style={[s.navDot, { backgroundColor: isCur ? colors.primary : isAns ? colors.success : colors.surface2, borderColor: isCur ? colors.primary : colors.border }]}>
                  <Text style={{ color: isCur || isAns ? "#fff" : colors.muted, fontSize: 10, fontWeight: "800" }}>{i + 1}</Text>
                </Pressable>
              );
            })}
          </Row>
        </ScrollView>
      </Screen>
    );
  }

  // Results Review
  if (mode === "review" && result) {
    const isPassed = result.passed;
    const qr = result.question_results[reviewIdx];
    return (
      <Screen>
        <Animated.View entering={FadeIn} style={[s.scoreHeader, { backgroundColor: isPassed ? colors.success + "22" : colors.danger + "22" }]}>
          <MaterialCommunityIcons name={isPassed ? "check-decagram" : "refresh"} size={44} color={isPassed ? colors.success : colors.danger} />
          <View>
            <Text style={[s.scoreBig, { color: isPassed ? colors.success : colors.danger }]}>{result.score}%</Text>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{isPassed ? "Skill Verified!" : "Keep Practicing"}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200)}>
          <Row style={{ gap: 8, marginVertical: 12 }}>
            {[
              { label: "Correct", value: result.correct_count + "/" + result.total_count, color: colors.success },
              { label: "Threshold", value: result.pass_threshold + "%", color: colors.warning },
              { label: "Points", value: "+" + result.reward_points, color: colors.primary },
            ].map((stat) => (
              <View key={stat.label} style={[s.statCard, { backgroundColor: colors.surface2, borderColor: colors.border, flex: 1 }]}>
                <Text style={{ color: stat.color, fontWeight: "900", fontSize: 16 }}>{stat.value}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{stat.label}</Text>
              </View>
            ))}
          </Row>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(350)}>
          <Card tone="soft" style={{ marginBottom: 12 }}>
            <Text style={[s.sectionLabel, { color: colors.text, marginBottom: 8 }]}>Bloom Taxonomy Breakdown</Text>
            {(Object.entries(result.bloom_breakdown) as [BloomLevel, { correct: number; total: number }][])
              .filter(([, v]) => v.total > 0)
              .map(([level, { correct, total }]) => {
                const pct = Math.round((correct / total) * 100);
                return (
                  <View key={level} style={{ marginBottom: 6 }}>
                    <Row style={{ justifyContent: "space-between", marginBottom: 3 }}>
                      <Row style={{ gap: 5 }}>
                        <MaterialCommunityIcons name={BLOOM_ICON[level] as any} size={13} color={BLOOM_COLOR[level]} />
                        <Text style={{ color: colors.text, fontSize: 12, textTransform: "capitalize" }}>{level}</Text>
                      </Row>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{correct}/{total}</Text>
                    </Row>
                    <View style={[s.bloomTrack, { backgroundColor: colors.border }]}>
                      <View style={[s.bloomFill, { width: (pct + "%") as any, backgroundColor: BLOOM_COLOR[level] }]} />
                    </View>
                  </View>
                );
              })}
          </Card>
        </Animated.View>

        <Text style={[s.sectionLabel, { color: colors.text, marginBottom: 8 }]}>
          Question Review ({reviewIdx + 1}/{result.question_results.length})
        </Text>
        {qr && (
          <Animated.View key={reviewIdx} entering={FadeInRight.duration(200)}>
            <Card tone={qr.is_correct ? "glow" : "soft"} style={{ borderLeftWidth: 4, borderLeftColor: qr.is_correct ? colors.success : colors.danger, marginBottom: 8 }}>
              <Row style={{ alignItems: "center", gap: 8, marginBottom: 6 }}>
                <MaterialCommunityIcons name={qr.is_correct ? "check-circle" : "close-circle"} size={20} color={qr.is_correct ? colors.success : colors.danger} />
                <View style={[s.bloomBadge, { backgroundColor: BLOOM_COLOR[qr.bloom_level] + "22" }]}>
                  <Text style={{ color: BLOOM_COLOR[qr.bloom_level], fontSize: 11, textTransform: "capitalize" }}>{qr.bloom_level}</Text>
                </View>
              </Row>
              <Text style={[s.questionPrompt, { color: colors.text, fontSize: 14, marginBottom: 10 }]}>{qr.prompt}</Text>
              {!qr.is_correct && (
                <View style={[s.answerBox, { backgroundColor: colors.danger + "18", borderColor: colors.danger + "40" }]}>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Your answer:</Text>
                  <Text style={{ color: colors.danger, fontSize: 13 }}>{qr.your_answer}</Text>
                </View>
              )}
              <View style={[s.answerBox, { backgroundColor: colors.success + "18", borderColor: colors.success + "40" }]}>
                <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>Correct answer:</Text>
                <Text style={{ color: colors.success, fontSize: 13 }}>{qr.correct_answer}</Text>
              </View>
              <View style={[s.explanationBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <Row style={{ gap: 6, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="lightbulb-outline" size={14} color={colors.warning} />
                  <Text style={{ color: colors.warning, fontWeight: "700", fontSize: 12 }}>Explanation</Text>
                </Row>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{qr.explanation}</Text>
              </View>
            </Card>
          </Animated.View>
        )}
        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <Button title="Prev" variant="ghost" compact disabled={reviewIdx === 0} onPress={() => setReviewIdx((p) => p - 1)} />
          <Button title="Next" variant="ghost" compact disabled={reviewIdx === result.question_results.length - 1} onPress={() => setReviewIdx((p) => p + 1)} />
        </Row>
        <Row style={{ gap: 10, marginTop: 16 }}>
          <Button title="Back to Skills" variant="secondary" onPress={resetToMenu} />
          {!isPassed && selectedSkill && <Button title="Retry" variant="primary" onPress={() => setMode("configure")} />}
        </Row>
      </Screen>
    );
  }

  // Catalog
  return (
    <Screen>
      <H1>Skill Passport</H1>
      <Muted style={{ marginBottom: 16 }}>Take AI-generated assessments to earn verified skill badges for your campus profile.</Muted>

      {passportQuery.data && passportQuery.data.stats.total_attempts > 0 && (
        <Animated.View entering={FadeInDown.springify()}>
          <Card tone="glow" style={{ marginBottom: 16 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>{passportQuery.data.verified_skills.length} Verified</Text>
                <Muted>Skills in Passport</Muted>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 20 }}>{passportQuery.data.stats.average_score}%</Text>
                <Muted>Avg Score</Muted>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 20 }}>{passportQuery.data.stats.pass_rate}%</Text>
                <Muted>Pass Rate</Muted>
              </View>
            </Row>
          </Card>
        </Animated.View>
      )}

      {/* Custom Skill AI Assessment Card */}
      <Card style={[s.customSkillCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
        <Row style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
          <View style={[s.customSkillIcon, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons name="creation" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>
              Assess Any Skill with AI
            </Text>
            <Muted style={{ fontSize: 11 }}>e.g. Microsoft Excel, AutoCAD, IELTS, React</Muted>
          </View>
        </Row>

        <TextInput
          placeholder="Skill name (e.g. Microsoft Excel, Data Analysis)"
          placeholderTextColor={colors.muted}
          value={customSkillInput}
          onChangeText={setCustomSkillInput}
          style={[s.customInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        />

        <TextInput
          placeholder="Specific conditions/topics (e.g. Pivot Tables, VLOOKUP, Macros)"
          placeholderTextColor={colors.muted}
          value={customConditionInput}
          onChangeText={setCustomConditionInput}
          style={[s.customInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border, marginTop: 6 }]}
        />

        <Row style={{ gap: 6, marginTop: 8, marginBottom: 10 }}>
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
            const isSel = customDifficulty === d;
            return (
              <Pressable
                key={d}
                onPress={() => setCustomDifficulty(d)}
                style={[
                  s.miniDiffBtn,
                  {
                    flex: 1,
                    backgroundColor: isSel ? DIFF_COLOR[d] + "22" : colors.background,
                    borderColor: isSel ? DIFF_COLOR[d] : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: isSel ? DIFF_COLOR[d] : colors.muted, textTransform: "capitalize", textAlign: "center" }}>
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        <Button
          title={startMutation.isPending ? "Generating..." : "⚡ Generate AI Assessment"}
          compact
          disabled={!customSkillInput.trim() || startMutation.isPending}
          loading={startMutation.isPending}
          onPress={() => {
            triggerHaptic();
            setMode("generating");
            startMutation.mutate({
              custom_skill_name: customSkillInput.trim(),
              topic: customConditionInput.trim() || customSkillInput.trim(),
              difficulty: customDifficulty,
              context_info: customConditionInput.trim() || undefined,
            });
          }}
        />
      </Card>

      <Text style={[s.sectionLabel, { color: colors.text, marginBottom: 10 }]}>Explore Pre-Set Skill Tracks</Text>
      {catalogQuery.isLoading && <><Skeleton height={80} /><Skeleton height={80} /><Skeleton height={80} /></>}
      {catalogQuery.isError && <ErrorState detail={(catalogQuery.error as Error).message} onRetry={() => catalogQuery.refetch()} />}
      {catalogQuery.data?.catalog?.map((skill, idx) => {
        const isVerified = passportQuery.data?.verified_skills.some((vs) => vs.skill_id === skill.skill_id);
        return (
          <Animated.View key={skill.skill_id} entering={FadeInUp.delay(idx * 60).springify()}>
            <Pressable onPress={() => { triggerHaptic(); setSelectedSkill(skill); setSelectedDifficulty("medium"); setTopic(""); setMode("configure"); }}>
              <Card tone="soft" style={{ marginBottom: 10 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Row style={{ alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{skill.skill_name}</Text>
                      {isVerified && <MaterialCommunityIcons name="check-decagram" size={16} color={colors.success} />}
                    </Row>
                    <Pill tone="accent">{skill.category}</Pill>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Row style={{ gap: 4 }}>
                      {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                        <View key={d} style={[s.miniDiff, { backgroundColor: DIFF_COLOR[d] + "22" }]}>
                          <Text style={{ color: DIFF_COLOR[d], fontSize: 10, fontWeight: "700" }}>+{skill.reward_points[d]}</Text>
                        </View>
                      ))}
                    </Row>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                  </View>
                </Row>
              </Card>
            </Pressable>
          </Animated.View>
        );
      })}
      {catalogQuery.data?.catalog?.length === 0 && !catalogQuery.isLoading && (
        <Empty title="No skills available" detail="Check back soon." />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  centeredFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24 },
  genIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  genDot: { width: 10, height: 10, borderRadius: 5 },
  backBtn: { padding: 8, marginRight: 4 },
  sectionLabel: { fontWeight: "700", fontSize: 14 },
  diffPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, flex: 1, justifyContent: "center" },
  topicInput: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1.5, marginBottom: 8 },
  topicText: { flex: 1, fontSize: 14 },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, flex: 1, justifyContent: "center" },
  progressWrap: { marginVertical: 10 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1.5 },
  violBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1.5 },
  bloomBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  questionPrompt: { fontSize: 16, fontWeight: "800", lineHeight: 24 },
  optionTile: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: radius.md, borderWidth: 1.5, gap: 12 },
  optionLetter: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  navDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  scoreHeader: { flexDirection: "row", alignItems: "center", gap: 16, padding: 20, borderRadius: radius.lg, marginBottom: 8 },
  scoreBig: { fontSize: 34, fontWeight: "900" },
  statCard: { alignItems: "center", padding: 12, borderRadius: radius.md, borderWidth: 1, gap: 4 },
  bloomTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  bloomFill: { height: 5, borderRadius: 3 },
  answerBox: { padding: 10, borderRadius: radius.sm, borderWidth: 1, marginBottom: 8, gap: 3 },
  explanationBox: { padding: 12, borderRadius: radius.md, borderWidth: 1, marginTop: 4 },
  miniDiff: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  customSkillCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  customSkillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  customInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  miniDiffBtn: {
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
