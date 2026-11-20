import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Button,
  Card,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { api } from "@/lib/api";
import { LocalDB } from "@/lib/database";
import { growthIllustrations } from "@/assets/illustrations";
import { nextGenFeatureCards, nextGenBadges } from "@/assets/nextgen";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StudyBlock {
  dayOrBlock: string;
  topic: string;
  sessionType: "deep_theory" | "numerical_practice" | "formula_drill" | "past_paper_simulation" | "speed_review";
  durationMinutes: number;
  priority: "high" | "medium" | "low";
  focus: string;
  practiceQuestionsCount: number;
  activeRecallPrompt?: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  topic?: string;
  priority?: "high" | "medium" | "low";
  estMinutes?: number;
  completed: boolean;
}

export interface CheatsheetItem {
  id?: string;
  topic: string;
  concept?: string;
  title?: string;
  formulaOrRule?: string;
  formulaOrKeyRule?: string;
  mnemonicOrTip?: string;
  explanation?: string;
  examTip?: string;
}

export interface ExamTrap {
  topic: string;
  commonMistake: string;
  howToAvoid: string;
}

export interface MockQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: string;
}

export interface CTPlan {
  id: string;
  subject: string;
  examDate: string;
  topics: string[];
  checklist: ChecklistItem[];
  schedule?: StudyBlock[];
  cheatsheet?: CheatsheetItem[];
  aiTips?: string[];
  examTraps?: ExamTrap[];
  mockQuiz?: MockQuestion[];
  progressPercent: number;
  studyMinutesSpent?: number;
  targetScore?: string;
  status?: string;
  createdAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Utilities & Quick Presets
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT_PRESETS = [
  "Data Structures & Algorithms",
  "Computer Networks",
  "Database Systems",
  "Operating Systems",
  "Discrete Mathematics",
  "Digital Logic Design",
  "Electrical Circuit Analysis",
  "Microprocessor 8086",
];

const TARGET_GOAL_OPTIONS = [
  { key: "ace", label: "🎯 100% Ace", desc: "Tricky derivations & numericals" },
  { key: "mastery", label: "⚡ 85%+ High Yield", desc: "Core concepts & exam patterns" },
  { key: "pass", label: "🛡️ Safe Pass", desc: "Crucial definitions & formulas" },
  { key: "revision", label: "🚀 Speed Drill", desc: "Rapid recall & self-test" },
] as const;

const MASTERY_LEVEL_OPTIONS = [
  { key: "beginner", label: "🌱 Starting Out" },
  { key: "intermediate", label: "⚖️ Moderate" },
  { key: "advanced", label: "🔥 Confident" },
] as const;

function formatCountdown(targetDateIso: string): string {
  const diffMs = new Date(targetDateIso).getTime() - Date.now();
  if (diffMs <= 0) return "Exam Day / Completed";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: CTPrepScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function CTPrepScreen() {
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  // Plans state
  const [plans, setPlans] = useState<CTPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Expanded plan state for viewing full study block breakdown
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [planDetailTab, setPlanDetailTab] = useState<"schedule" | "cheatsheet" | "traps" | "tips">("schedule");

  // New Plan / AI Generator state
  const [showAiModal, setShowAiModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [availableHours, setAvailableHours] = useState("6");
  const [targetGoal, setTargetGoal] = useState<"ace" | "mastery" | "pass" | "revision">("mastery");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [examDateDays, setExamDateDays] = useState("3");
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any | null>(null);

  // New Task Inline input state
  const [newTaskInput, setNewTaskInput] = useState<Record<string, string>>({});

  // Interactive Mock Quiz Modal state
  const [showMockQuizModal, setShowMockQuizModal] = useState(false);
  const [quizPlan, setQuizPlan] = useState<CTPlan | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<MockQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);

  // Pomodoro Focus Timer Modal state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerPlan, setTimerPlan] = useState<CTPlan | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInitialMinutes, setTimerInitialMinutes] = useState(25);
  const timerIntervalRef = useRef<any>(null);

  // Cheatsheet viewer modal state
  const [showCheatsheetModal, setShowCheatsheetModal] = useState(false);
  const [activeCheatsheetPlan, setActiveCheatsheetPlan] = useState<CTPlan | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Data Loading & Persistence
  // ───────────────────────────────────────────────────────────────────────────

  const loadPlans = useCallback(async () => {
    // 1. Instant local render from offline cache
    const cached = await LocalDB.getCachedCTPlans();
    if (cached && cached.length) {
      setPlans(cached);
      setLoading(false);
    }

    // 2. Fresh fetch from backend
    try {
      const res = await api<{ plans: CTPlan[] }>("/ct/plans");
      const fetched = res.plans || [];
      setPlans(fetched);
      await LocalDB.setCachedCTPlans(fetched);
    } catch {
      // Offline fallback already loaded
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Pomodoro Timer Interval Effect
  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setTimerRunning(false);
            triggerHaptic();
            Alert.alert(
              "Pomodoro Completed! 🏆",
              `Great job! You studied for ${timerInitialMinutes} minutes. Logging your progress now...`,
            );
            if (timerPlan) {
              void handleLogStudy(timerPlan.id, timerInitialMinutes);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning, timerInitialMinutes, timerPlan]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  async function handleGenerateAiPlan() {
    if (!subject.trim()) {
      Alert.alert("Missing Subject", "Please enter or select a course subject name.");
      return;
    }
    if (!topicsInput.trim()) {
      Alert.alert("Missing Topics", "Please enter at least one topic to study.");
      return;
    }

    triggerHaptic();
    setGenerating(true);
    try {
      const parsedTopics = topicsInput
        .split(/[\n,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const daysAhead = parseInt(examDateDays, 10) || 3;
      const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

      const res = await api<any>("/ct/ai/generate-plan", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          topics: parsedTopics,
          availableHours: parseFloat(availableHours) || 6,
          examDate: targetDate,
          targetGoal,
          difficulty,
        }),
      });

      setGeneratedResult(res);
      triggerHaptic();
    } catch (err: any) {
      Alert.alert("AI Generator Notice", err?.message || "Could not generate AI study plan. Please retry.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveGeneratedPlan() {
    if (!generatedResult) return;
    triggerHaptic();
    try {
      const daysAhead = parseInt(examDateDays, 10) || 3;
      const examDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

      const created = await api<{ plan: CTPlan }>("/ct/plans", {
        method: "POST",
        body: JSON.stringify({
          subject: generatedResult.subject,
          examDate,
          topics: (generatedResult.schedule || []).map((s: any) => s.topic),
          checklist: generatedResult.recommendedChecklist || [],
          schedule: generatedResult.schedule || [],
          cheatsheet: generatedResult.cheatsheet || [],
          aiTips: generatedResult.aiTips || [],
          examTraps: generatedResult.examTraps || [],
          targetScore: targetGoal,
        }),
      });

      const updated = [created.plan, ...plans.filter((p) => p.id !== created.plan.id)];
      setPlans(updated);
      await LocalDB.setCachedCTPlans(updated);

      setShowAiModal(false);
      setGeneratedResult(null);
      setSubject("");
      setTopicsInput("");

      Alert.alert("CT Plan Activated! 🎉", "Your AI preparation roadmap is live and synced.");
    } catch (err: any) {
      Alert.alert("Save Error", err?.message || "Could not save CT plan.");
    }
  }

  const toggleChecklistItem = async (planId: string, itemId: string) => {
    triggerHaptic();

    // Optimistic UI update
    let updatedChecklist: ChecklistItem[] = [];
    let updatedPercent = 0;

    const newPlans = plans.map((p) => {
      if (p.id !== planId) return p;
      const nextChecklist = p.checklist.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item,
      );
      const completedCount = nextChecklist.filter((c) => c.completed).length;
      const pct = Math.round((completedCount / (nextChecklist.length || 1)) * 100);

      updatedChecklist = nextChecklist;
      updatedPercent = pct;

      return { ...p, checklist: nextChecklist, progressPercent: pct };
    });

    setPlans(newPlans);
    await LocalDB.setCachedCTPlans(newPlans);

    // Persist to backend database via PATCH
    try {
      await api(`/ct/plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({
          checklist: updatedChecklist,
          progressPercent: updatedPercent,
        }),
      });
    } catch {
      // Offline fallback already preserved locally
    }
  };

  const handleAddNewTask = async (planId: string) => {
    const text = (newTaskInput[planId] || "").trim();
    if (!text) return;

    triggerHaptic();
    const newTask: ChecklistItem = {
      id: `custom_${Date.now()}`,
      title: text,
      completed: false,
      priority: "medium",
      estMinutes: 20,
    };

    let updatedList: ChecklistItem[] = [];
    let pct = 0;

    const updated = plans.map((p) => {
      if (p.id !== planId) return p;
      const nextList = [...p.checklist, newTask];
      const completedCount = nextList.filter((c) => c.completed).length;
      pct = Math.round((completedCount / (nextList.length || 1)) * 100);
      updatedList = nextList;
      return { ...p, checklist: nextList, progressPercent: pct };
    });

    setPlans(updated);
    setNewTaskInput((prev) => ({ ...prev, [planId]: "" }));
    await LocalDB.setCachedCTPlans(updated);

    try {
      await api(`/ct/plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({ checklist: updatedList, progressPercent: pct }),
      });
    } catch {
      // Local state preserved
    }
  };

  const handleDeletePlan = (planId: string) => {
    triggerHaptic();
    Alert.alert(
      "Delete CT Study Plan?",
      "Are you sure you want to remove this Class Test plan? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const remaining = plans.filter((p) => p.id !== planId);
            setPlans(remaining);
            await LocalDB.setCachedCTPlans(remaining);
            try {
              await api(`/ct/plans/${planId}`, { method: "DELETE" });
            } catch {
              // Ignore
            }
          },
        },
      ],
    );
  };

  const handleLogStudy = async (planId: string, minutes: number) => {
    try {
      await api(`/ct/plans/${planId}/log-study`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, studyMinutesSpent: (p.studyMinutesSpent || 0) + minutes } : p)),
      );
    } catch {
      // Ignore
    }
  };

  // Mock Quiz Workflow
  const handleOpenMockQuiz = async (plan: CTPlan) => {
    triggerHaptic();
    setQuizPlan(plan);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setShowMockQuizModal(true);

    if (plan.mockQuiz && plan.mockQuiz.length > 0) {
      setQuizQuestions(plan.mockQuiz);
      return;
    }

    setQuizLoading(true);
    try {
      const res = await api<{ questions: MockQuestion[] }>("/ct/ai/mock-quiz", {
        method: "POST",
        body: JSON.stringify({
          subject: plan.subject,
          topics: plan.topics.length > 0 ? plan.topics : [plan.subject],
          questionCount: 5,
          difficulty: "medium",
        }),
      });
      setQuizQuestions(res.questions || []);
    } catch {
      Alert.alert("Quiz Error", "Could not generate mock questions. Please retry.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectAnswer = (questionIndex: number, optionIndex: number) => {
    if (quizSubmitted) return;
    triggerHaptic();
    setQuizAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  };

  // Pomodoro Timer Controls
  const handleStartTimer = (plan: CTPlan, minutes: number = 25) => {
    triggerHaptic();
    setTimerPlan(plan);
    setTimerInitialMinutes(minutes);
    setTimerSecondsLeft(minutes * 60);
    setTimerRunning(true);
    setShowTimerModal(true);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Computed Telemetry
  // ───────────────────────────────────────────────────────────────────────────

  const telemetry = useMemo(() => {
    const totalPlans = plans.length;
    if (totalPlans === 0) {
      return { totalPlans: 0, avgProgress: 0, totalHoursLogged: 0, nextCtDays: null };
    }
    const sumProgress = plans.reduce((acc, p) => acc + (p.progressPercent || 0), 0);
    const avgProgress = Math.round(sumProgress / totalPlans);
    const totalMinutes = plans.reduce((acc, p) => acc + (p.studyMinutesSpent || 0), 0);
    const totalHoursLogged = (totalMinutes / 60).toFixed(1);

    const sortedByDate = [...plans].sort(
      (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime(),
    );
    const earliest = sortedByDate[0];
    const countdown = earliest ? formatCountdown(earliest.examDate) : null;

    return { totalPlans, avgProgress, totalHoursLogged, nextCtDays: countdown };
  }, [plans]);

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Screen onRefresh={loadPlans} refreshing={refreshing}>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Hero Banner & Performance Telemetry Card */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Card tone="glow" style={styles.heroCard}>
        <Row style={{ alignItems: "center", gap: 14 }}>
          <Image
            source={growthIllustrations.studyPlanner}
            style={styles.heroIllustration}
            resizeMode="contain"
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <Pill tone="primary">AI ACADEMIC CO-PILOT</Pill>
              {telemetry.nextCtDays ? (
                <Pill tone="accent">⏳ {telemetry.nextCtDays}</Pill>
              ) : null}
            </Row>
            <H1 style={{ fontSize: 22, lineHeight: 28 }}>CT Preparation & Study Hub</H1>
            <Muted style={{ fontSize: 13, lineHeight: 18 }}>
              Smart syllabus decomposition, high-yield Pomodoro blocks, and instant AI mock tests.
            </Muted>
          </View>
        </Row>

        {/* Telemetry Stats Bar */}
        <View style={[styles.statsRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{telemetry.totalPlans}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Active CTs</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: colors.accent }]}>{telemetry.avgProgress}%</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Avg Preparedness</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBox}>
            <Row style={{ alignItems: "center", gap: 4 }}>
              <Image source={nextGenBadges.streak} style={{ width: 16, height: 16 }} />
              <Text style={[styles.statNumber, { color: colors.text }]}>{telemetry.totalHoursLogged}h</Text>
            </Row>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Hours Studied</Text>
          </View>
        </View>

        {/* Action Button */}
        <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <Button
            title="✨ Generate AI CT Roadmap"
            variant="primary"
            onPress={() => {
              triggerHaptic();
              setShowAiModal(true);
            }}
          />
        </Row>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* AI Roadmap Generator Modal / Composer */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showAiModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={[
              styles.modalOverlay,
              Platform.OS === "android" && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
            ]}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <Image source={nextGenFeatureCards.studyPlan} style={{ width: 28, height: 28, borderRadius: 6 }} />
                  <H2 style={{ fontSize: 18 }}>AI Class Test Study Generator</H2>
                </Row>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setShowAiModal(false);
                  }}
                >
                  <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </Row>

              <ScrollView
                style={{ maxHeight: "85%", marginTop: 8 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
              <View style={{ gap: 12 }}>
                {/* Course Presets */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Course / Subject Name</Text>
                  <TextInput
                    placeholder="e.g. Data Structures & Algorithms, Computer Networks"
                    placeholderTextColor={colors.muted}
                    value={subject}
                    onChangeText={setSubject}
                    style={[
                      styles.input,
                      { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border },
                    ]}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <Row style={{ gap: 6 }}>
                      {SUBJECT_PRESETS.map((p) => (
                        <TouchableOpacity
                          key={p}
                          onPress={() => {
                            triggerHaptic();
                            setSubject(p);
                          }}
                        >
                          <Pill tone={subject === p ? "primary" : "default"}>{p}</Pill>
                        </TouchableOpacity>
                      ))}
                    </Row>
                  </ScrollView>
                </View>

                {/* Topics Input */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Topics to Cover in this CT</Text>
                  <TextInput
                    placeholder="Enter topics separated by comma or new lines (e.g. B-Trees, AVL Trees, Dijkstra Algorithm)"
                    placeholderTextColor={colors.muted}
                    value={topicsInput}
                    onChangeText={setTopicsInput}
                    multiline
                    numberOfLines={3}
                    style={[
                      styles.input,
                      styles.multilineInput,
                      { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border },
                    ]}
                  />
                </View>

                {/* Study Hours & Target Date */}
                <Row style={{ gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Study Budget (Hours)</Text>
                    <TextInput
                      placeholder="e.g. 6"
                      placeholderTextColor={colors.muted}
                      value={availableHours}
                      onChangeText={setAvailableHours}
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border },
                      ]}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Exam In (Days)</Text>
                    <TextInput
                      placeholder="e.g. 3"
                      placeholderTextColor={colors.muted}
                      value={examDateDays}
                      onChangeText={setExamDateDays}
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border },
                      ]}
                    />
                  </View>
                </Row>

                {/* Target Goal Selector */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Preparation Goal</Text>
                  <Row style={{ flexWrap: "wrap", gap: 8 }}>
                    {TARGET_GOAL_OPTIONS.map((g) => (
                      <Pressable
                        key={g.key}
                        onPress={() => {
                          triggerHaptic();
                          setTargetGoal(g.key);
                        }}
                        style={[
                          styles.chipOption,
                          {
                            backgroundColor: targetGoal === g.key ? colors.primarySoft : colors.surface2,
                            borderColor: targetGoal === g.key ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: targetGoal === g.key ? colors.primary : colors.text,
                          }}
                        >
                          {g.label}
                        </Text>
                      </Pressable>
                    ))}
                  </Row>
                </View>

                {/* Mastery Level */}
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Current Confidence Level</Text>
                  <Row style={{ gap: 8 }}>
                    {MASTERY_LEVEL_OPTIONS.map((m) => (
                      <Pressable
                        key={m.key}
                        onPress={() => {
                          triggerHaptic();
                          setDifficulty(m.key);
                        }}
                        style={[
                          styles.chipOption,
                          {
                            backgroundColor: difficulty === m.key ? colors.primarySoft : colors.surface2,
                            borderColor: difficulty === m.key ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: difficulty === m.key ? colors.primary : colors.muted,
                          }}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    ))}
                  </Row>
                </View>

                {/* Submit Action */}
                <Button
                  title={generating ? "AI is Analyzing Syllabus & Weightage…" : "✨ Synthesize Custom CT Roadmap"}
                  disabled={generating}
                  onPress={handleGenerateAiPlan}
                />

                {/* Generated AI Result Preview */}
                {generatedResult ? (
                  <View style={[styles.resultBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.resultTitle, { color: colors.primary }]}>
                        Generated Plan ({generatedResult.totalHours}h Study Plan)
                      </Text>
                      <Pill tone={generatedResult.isAiGenerated ? "primary" : "default"}>
                        {generatedResult.isAiGenerated ? "⚡ Gemini Powered" : "Smart Heuristic"}
                      </Pill>
                    </Row>

                    {generatedResult.overallStrategy ? (
                      <View style={[styles.strategyCard, { backgroundColor: colors.surface }]}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent }}>
                          💡 Master Exam Strategy:
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.text, marginTop: 2, lineHeight: 17 }}>
                          {generatedResult.overallStrategy}
                        </Text>
                      </View>
                    ) : null}

                    {/* Schedule Blocks */}
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 8 }}>
                      Recommended Study Blocks ({generatedResult.schedule?.length || 0}):
                    </Text>

                    {(generatedResult.schedule || []).map((block: any, idx: number) => (
                      <View key={idx} style={[styles.blockItem, { backgroundColor: colors.surface }]}>
                        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text }}>
                            {block.dayOrBlock}: {block.topic}
                          </Text>
                          <Pill tone={block.priority === "high" ? "accent" : "default"}>
                            {block.priority?.toUpperCase()}
                          </Pill>
                        </Row>
                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{block.focus}</Text>
                        {block.activeRecallPrompt ? (
                          <Text style={{ fontSize: 11, fontStyle: "italic", color: colors.primary, marginTop: 3 }}>
                            🎯 Self-Test: {block.activeRecallPrompt}
                          </Text>
                        ) : null}
                      </View>
                    ))}

                    <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                      <Button
                        title="Save to My Plans →"
                        variant="primary"
                        onPress={handleSaveGeneratedPlan}
                      />
                    </Row>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Active Plans List */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={{ marginTop: 16, gap: 12 }}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <H2 style={{ fontSize: 18 }}>My Class Test Roadmaps ({plans.length})</H2>
          <Muted>Check off tasks as you finish</Muted>
        </Row>

        {loading ? (
          <>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </>
        ) : plans.length === 0 ? (
          <Card style={{ alignItems: "center", padding: 28, gap: 10 }}>
            <Image
              source={growthIllustrations.learningGoals}
              style={{ width: 100, height: 100, opacity: 0.9 }}
              resizeMode="contain"
            />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
              No Class Test Plans Created Yet
            </Text>
            <Muted style={{ textAlign: "center", maxWidth: 300 }}>
              Prepare ahead of time! Generate an intelligent syllabus breakdown and practice checklist for your next CT.
            </Muted>
            <Button
              title="✨ Create Your First CT Plan"
              variant="primary"
              onPress={() => {
                triggerHaptic();
                setShowAiModal(true);
              }}
            />
          </Card>
        ) : (
          plans.map((plan) => {
            const isExpanded = expandedPlanId === plan.id;
            return (
              <Card key={plan.id} tone={plan.progressPercent >= 100 ? "glow" : "default"} style={{ gap: 12 }}>
                {/* Plan Header */}
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.planTitle, { color: colors.text }]}>{plan.subject}</Text>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pill tone="accent">📅 {formatCountdown(plan.examDate)}</Pill>
                      {plan.studyMinutesSpent ? (
                        <Pill tone="default">⏱️ {plan.studyMinutesSpent}m Studied</Pill>
                      ) : null}
                    </Row>
                  </View>

                  <Row style={{ alignItems: "center", gap: 8 }}>
                    <Pill tone={plan.progressPercent >= 80 ? "primary" : "default"}>
                      {plan.progressPercent}% Ready
                    </Pill>
                    <Pressable onPress={() => handleDeletePlan(plan.id)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.muted} />
                    </Pressable>
                  </Row>
                </Row>

                {/* Progress Bar */}
                <View style={[styles.progressTrack, { backgroundColor: colors.surface2 }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: plan.progressPercent >= 100 ? "#10B981" : colors.primary,
                        width: `${Math.min(100, plan.progressPercent)}%`,
                      },
                    ]}
                  />
                </View>

                {/* Interactive Checklist Items */}
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>
                    REVISION CHECKLIST ({plan.checklist.filter((c) => c.completed).length}/{plan.checklist.length}):
                  </Text>

                  {plan.checklist.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleChecklistItem(plan.id, item.id)}
                      style={[
                        styles.checkRow,
                        {
                          backgroundColor: item.completed ? colors.surface2 : "transparent",
                          borderRadius: 8,
                          padding: 4,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.completed ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                        size={20}
                        color={item.completed ? "#10B981" : colors.muted}
                      />
                      <Text
                        style={[
                          styles.checkTitle,
                          {
                            color: item.completed ? colors.muted : colors.text,
                            textDecorationLine: item.completed ? "line-through" : "none",
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      {item.estMinutes ? (
                        <Text style={{ fontSize: 11, color: colors.muted }}>{item.estMinutes}m</Text>
                      ) : null}
                    </Pressable>
                  ))}

                  {/* Add Custom Task Input */}
                  <Row style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                    <TextInput
                      placeholder="+ Add custom revision task..."
                      placeholderTextColor={colors.muted}
                      value={newTaskInput[plan.id] || ""}
                      onChangeText={(val) => setNewTaskInput((prev) => ({ ...prev, [plan.id]: val }))}
                      onSubmitEditing={() => handleAddNewTask(plan.id)}
                      style={[
                        styles.miniInput,
                        { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border },
                      ]}
                    />
                    <Button
                      title="Add"
                      compact
                      variant="secondary"
                      onPress={() => handleAddNewTask(plan.id)}
                    />
                  </Row>
                </View>

                {/* Expand / Collapse Study Breakdown */}
                {isExpanded ? (
                  <View style={[styles.expandedDrawer, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                    <Row style={{ gap: 6, marginBottom: 8 }}>
                      <Pressable
                        onPress={() => setPlanDetailTab("schedule")}
                        style={[
                          styles.tabPill,
                          {
                            backgroundColor: planDetailTab === "schedule" ? colors.primary : colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: planDetailTab === "schedule" ? "#FFF" : colors.text,
                          }}
                        >
                          🕒 Study Blocks
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setPlanDetailTab("cheatsheet")}
                        style={[
                          styles.tabPill,
                          {
                            backgroundColor: planDetailTab === "cheatsheet" ? colors.primary : colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: planDetailTab === "cheatsheet" ? "#FFF" : colors.text,
                          }}
                        >
                          📐 Formulas
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setPlanDetailTab("traps")}
                        style={[
                          styles.tabPill,
                          {
                            backgroundColor: planDetailTab === "traps" ? colors.primary : colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: planDetailTab === "traps" ? "#FFF" : colors.text,
                          }}
                        >
                          ⚠️ Traps
                        </Text>
                      </Pressable>
                    </Row>

                    {planDetailTab === "schedule" && plan.schedule?.length ? (
                      plan.schedule.map((block, idx) => (
                        <View key={idx} style={[styles.drawerItem, { backgroundColor: colors.surface }]}>
                          <Text style={{ fontWeight: "700", fontSize: 12, color: colors.text }}>
                            {block.dayOrBlock}: {block.topic}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{block.focus}</Text>
                          {block.activeRecallPrompt ? (
                            <Text style={{ fontSize: 11, color: colors.primary, marginTop: 2 }}>
                              🎯 {block.activeRecallPrompt}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    ) : null}

                    {planDetailTab === "cheatsheet" && plan.cheatsheet?.length ? (
                      plan.cheatsheet.map((c, idx) => (
                        <View key={idx} style={[styles.drawerItem, { backgroundColor: colors.surface }]}>
                          <Text style={{ fontWeight: "700", fontSize: 12, color: colors.primary }}>
                            {c.concept || c.title || c.topic}
                          </Text>
                          <Text style={{ fontSize: 12, fontFamily: "monospace", color: colors.text, marginTop: 2 }}>
                            {c.formulaOrRule || c.formulaOrKeyRule}
                          </Text>
                          {c.mnemonicOrTip || c.examTip ? (
                            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                              💡 {c.mnemonicOrTip || c.examTip}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    ) : null}

                    {planDetailTab === "traps" && plan.examTraps?.length ? (
                      plan.examTraps.map((t, idx) => (
                        <View key={idx} style={[styles.drawerItem, { backgroundColor: colors.surface }]}>
                          <Text style={{ fontWeight: "700", fontSize: 12, color: "#EF4444" }}>
                            ⚠️ {t.topic}: {t.commonMistake}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                            Fix: {t.howToAvoid}
                          </Text>
                        </View>
                      ))
                    ) : null}
                  </View>
                ) : null}

                {/* Plan Bottom Action Toolbar */}
                <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setExpandedPlanId(isExpanded ? null : plan.id);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                      {isExpanded ? "▲ Hide Strategy" : "▼ View Full Strategy & Formulas"}
                    </Text>
                  </Pressable>

                  <Row style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {plan.cheatsheet && plan.cheatsheet.length > 0 ? (
                      <Button
                        title="📐 Formulas"
                        compact
                        variant="secondary"
                        onPress={() => {
                          triggerHaptic();
                          setActiveCheatsheetPlan(plan);
                          setShowCheatsheetModal(true);
                        }}
                      />
                    ) : null}
                    <Button
                      title="⏱️ Focus"
                      compact
                      variant="secondary"
                      onPress={() => handleStartTimer(plan, 25)}
                    />
                    <Button
                      title="📝 Mock CT"
                      compact
                      variant="primary"
                      onPress={() => handleOpenMockQuiz(plan)}
                    />
                    <Button
                      title="🏫 Room"
                      compact
                      variant="secondary"
                      onPress={() => {
                        triggerHaptic();
                        router.push("/rooms" as any);
                      }}
                    />
                  </Row>
                </Row>
              </Card>
            );
          })
        )}
      </View>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Interactive Mock Quiz Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showMockQuizModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <H2 style={{ fontSize: 18 }}>📝 Diagnostic CT Mock Quiz</H2>
                <Muted>{quizPlan?.subject}</Muted>
              </View>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowMockQuizModal(false);
                }}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>

            {quizLoading ? (
              <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  Generating personalized CT exam questions with Gemini AI...
                </Text>
              </View>
            ) : quizQuestions.length === 0 ? (
              <View style={{ padding: 30, alignItems: "center" }}>
                <Text style={{ color: colors.muted }}>No mock questions generated. Please retry.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: "85%", marginTop: 12 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 16 }}>
                  {quizQuestions.map((q, qIdx) => {
                    const selected = quizAnswers[qIdx];
                    const isAnswered = selected !== undefined;
                    const isCorrect = isAnswered && selected === q.correctIndex;

                    return (
                      <View key={q.id || qIdx} style={[styles.quizCard, { backgroundColor: colors.surface2 }]}>
                        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <Pill tone="default">Question {qIdx + 1}</Pill>
                          <Pill tone="accent">{q.topic}</Pill>
                        </Row>

                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 4 }}>
                          {q.question}
                        </Text>

                        {/* Options */}
                        <View style={{ gap: 6, marginTop: 8 }}>
                          {q.options.map((opt, optIdx) => {
                            let optBg = colors.surface;
                            let optBorder = colors.border;

                            if (quizSubmitted) {
                              if (optIdx === q.correctIndex) {
                                optBg = "#10B98122";
                                optBorder = "#10B981";
                              } else if (selected === optIdx) {
                                optBg = "#EF444422";
                                optBorder = "#EF4444";
                              }
                            } else if (selected === optIdx) {
                              optBg = colors.primarySoft;
                              optBorder = colors.primary;
                            }

                            return (
                              <Pressable
                                key={optIdx}
                                onPress={() => handleSelectAnswer(qIdx, optIdx)}
                                style={[styles.quizOption, { backgroundColor: optBg, borderColor: optBorder }]}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
                                    color: colors.text,
                                    fontWeight: selected === optIdx ? "700" : "500",
                                  }}
                                >
                                  {opt}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {/* Explanation reveal */}
                        {quizSubmitted ? (
                          <View
                            style={[
                              styles.explanationBox,
                              { backgroundColor: isCorrect ? "#10B98115" : "#EF444415" },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "800",
                                color: isCorrect ? "#10B981" : "#EF4444",
                              }}
                            >
                              {isCorrect ? "✓ Correct!" : "✗ Review Needed"}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.text, marginTop: 2 }}>{q.explanation}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  {/* Submit / Reset Score */}
                  {!quizSubmitted ? (
                    <Button
                      title="Submit Answers & Grade CT"
                      variant="primary"
                      disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                      onPress={() => {
                        triggerHaptic();
                        setQuizSubmitted(true);
                      }}
                    />
                  ) : (
                    <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                        Score:{" "}
                        {
                          Object.entries(quizAnswers).filter(
                            ([idx, ans]) => ans === quizQuestions[parseInt(idx, 10)]?.correctIndex,
                          ).length
                        }{" "}
                        / {quizQuestions.length}
                      </Text>
                      <Button
                        title="Close Quiz"
                        variant="secondary"
                        onPress={() => setShowMockQuizModal(false)}
                      />
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Pomodoro Focus Timer Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showTimerModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.timerContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <Pill tone="primary">FOCUS POMODORO</Pill>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowTimerModal(false);
                  setTimerRunning(false);
                }}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>

            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 8 }}>
              {timerPlan?.subject}
            </Text>
            <Muted>Keep your screen on and stay deeply focused</Muted>

            {/* Countdown Digits */}
            <View style={[styles.timerCircle, { borderColor: colors.primary }]}>
              <Text style={[styles.timerDigits, { color: colors.text }]}>
                {Math.floor(timerSecondsLeft / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(timerSecondsLeft % 60).toString().padStart(2, "0")}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                {timerRunning ? "FOCUS TIME" : "PAUSED"}
              </Text>
            </View>

            {/* Controls */}
            <Row style={{ gap: 12, marginTop: 12 }}>
              <Button
                title={timerRunning ? "Pause ⏸️" : "Start Focus ▶️"}
                variant="primary"
                onPress={() => {
                  triggerHaptic();
                  setTimerRunning(!timerRunning);
                }}
              />
              <Button
                title="Reset 🔄"
                variant="secondary"
                onPress={() => {
                  triggerHaptic();
                  setTimerRunning(false);
                  setTimerSecondsLeft(timerInitialMinutes * 60);
                }}
              />
            </Row>

            {/* Fast Presets */}
            <Row style={{ gap: 8, marginTop: 8 }}>
              {[15, 25, 45, 60].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    triggerHaptic();
                    setTimerInitialMinutes(m);
                    setTimerSecondsLeft(m * 60);
                    setTimerRunning(false);
                  }}
                  style={[
                    styles.timerPresetBtn,
                    {
                      backgroundColor: timerInitialMinutes === m ? colors.primarySoft : colors.surface2,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: timerInitialMinutes === m ? colors.primary : colors.muted,
                    }}
                  >
                    {m}m
                  </Text>
                </Pressable>
              ))}
            </Row>
          </View>
        </View>
      </Modal>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Cheatsheet / Formula Flashcards Modal */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showCheatsheetModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <H2 style={{ fontSize: 18 }}>📐 High-Yield Formula Sheet</H2>
                <Muted>{activeCheatsheetPlan?.subject}</Muted>
              </View>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowCheatsheetModal(false);
                }}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>

            <ScrollView style={{ maxHeight: "85%", marginTop: 12 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10 }}>
                {(activeCheatsheetPlan?.cheatsheet || []).map((card, idx) => (
                  <Card key={idx} tone="soft" style={{ gap: 4 }}>
                    <Pill tone="primary">{card.topic}</Pill>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>
                      {card.concept || card.title}
                    </Text>
                    <View style={{ backgroundColor: colors.surface2, padding: 8, borderRadius: 6, marginVertical: 4 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 13, color: colors.accent, fontWeight: "700" }}>
                        {card.formulaOrRule || card.formulaOrKeyRule}
                      </Text>
                    </View>
                    {card.mnemonicOrTip || card.examTip ? (
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        💡 {card.mnemonicOrTip || card.examTip}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroCard: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  heroIllustration: {
    width: 68,
    height: 68,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  statBox: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  multilineInput: {
    height: 70,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  miniInput: {
    flex: 1,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  chipOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  resultBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    gap: 6,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  strategyCard: {
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  blockItem: {
    padding: 10,
    borderRadius: 8,
    marginVertical: 3,
    gap: 2,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkTitle: {
    fontSize: 13,
    flex: 1,
  },
  expandedDrawer: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
    gap: 6,
  },
  tabPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  drawerItem: {
    padding: 8,
    borderRadius: 6,
    gap: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  timerContent: {
    width: "90%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  timerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 5,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  timerDigits: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 2,
  },
  timerPresetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  quizCard: {
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  quizOption: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  explanationBox: {
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
});
