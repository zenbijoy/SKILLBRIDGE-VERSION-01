import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { api } from "@/lib/api";
import { LocalDB } from "@/lib/database";

interface CTPlan {
  id: string;
  subject: string;
  examDate: string;
  topics: string[];
  checklist: Array<{ id: string; title: string; completed: boolean }>;
  progressPercent: number;
}

export default function CTPrepScreen() {
  const { colors } = useTheme();
  const [plans, setPlans] = useState<CTPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // New Plan / AI Generator state
  const [showAiModal, setShowAiModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [availableHours, setAvailableHours] = useState("6");
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    // 1. Instant local render
    const cached = await LocalDB.getCachedCTPlans();
    if (cached && cached.length) {
      setPlans(cached);
      setLoading(false);
    }

    // 2. Fetch fresh from backend
    try {
      const res = await api<{ plans: CTPlan[] }>("/ct/plans");
      setPlans(res.plans || []);
      await LocalDB.setCachedCTPlans(res.plans || []);
    } catch {
      // Offline fallback already loaded from cache
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateAiPlan() {
    if (!subject.trim() || !topicsInput.trim()) {
      Alert.alert("Missing Details", "Please enter a subject and at least one topic.");
      return;
    }

    triggerHaptic();
    setGenerating(true);
    try {
      const topics = topicsInput.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
      const res = await api<any>("/ct/ai/generate-plan", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          topics,
          availableHours: parseInt(availableHours, 10) || 6,
        }),
      });
      setGeneratedResult(res);
    } catch (err: any) {
      Alert.alert("AI Plan Generation Failed", err?.message || "Could not reach AI guide.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSavePlan() {
    if (!generatedResult) return;
    triggerHaptic();
    try {
      const examDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const created = await api<{ plan: CTPlan }>("/ct/plans", {
        method: "POST",
        body: JSON.stringify({
          subject: generatedResult.subject,
          examDate,
          topics: generatedResult.schedule.map((s: any) => s.topic),
          checklist: generatedResult.recommendedChecklist,
        }),
      });

      const updated = [created.plan, ...plans];
      setPlans(updated);
      await LocalDB.setCachedCTPlans(updated);

      setShowAiModal(false);
      setGeneratedResult(null);
      setSubject("");
      setTopicsInput("");
      Alert.alert("Plan Saved! 🎉", "Your personalized CT preparation roadmap is active.");
    } catch (err: any) {
      Alert.alert("Save Failed", err?.message || "Could not save CT plan.");
    }
  }

  const toggleChecklistItem = (planId: string, itemId: string) => {
    triggerHaptic();
    setPlans((prev) => {
      const updated = prev.map((p) => {
        if (p.id !== planId) return p;
        const newChecklist = p.checklist.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item,
        );
        const completedCount = newChecklist.filter((c) => c.completed).length;
        const pct = Math.round((completedCount / (newChecklist.length || 1)) * 100);
        return { ...p, checklist: newChecklist, progressPercent: pct };
      });
      void LocalDB.setCachedCTPlans(updated);
      return updated;
    });
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <H1>CT Preparation & AI Guide 🎯</H1>
          <Muted>Smart syllabus tracking, offline revision checklists, and AI study schedules.</Muted>
        </View>

        <Button
          title="✨ AI Study Plan"
          compact
          onPress={() => {
            triggerHaptic();
            setShowAiModal(true);
          }}
        />
      </Row>

      {/* AI Generator Modal / Card */}
      {showAiModal ? (
        <Card tone="glow" style={{ marginTop: 12, gap: 10 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <H2 style={{ fontSize: 16 }}>✨ Generate AI CT Study Roadmap</H2>
            <Pressable onPress={() => setShowAiModal(false)}>
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          </Row>

          <TextInput
            placeholder="Course / Subject Name (e.g. Discrete Mathematics)"
            placeholderTextColor={colors.muted}
            value={subject}
            onChangeText={setSubject}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
          />

          <TextInput
            placeholder="Topics to study (comma or newline separated, e.g. Graph Theory, Trees, Recurrence)"
            placeholderTextColor={colors.muted}
            value={topicsInput}
            onChangeText={setTopicsInput}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multilineInput, { color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
          />

          <Row style={{ alignItems: "center", gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Study Budget:</Text>
            <TextInput
              placeholder="Hours"
              placeholderTextColor={colors.muted}
              value={availableHours}
              onChangeText={setAvailableHours}
              keyboardType="numeric"
              style={[styles.input, { width: 80, height: 36, color: colors.text, backgroundColor: colors.surface2, borderColor: colors.border }]}
            />
            <Text style={{ color: colors.muted, fontSize: 13 }}>Hours available</Text>
          </Row>

          <Button
            title={generating ? "Analyzing Syllabus with AI…" : "Generate Revision Schedule"}
            disabled={generating}
            onPress={handleGenerateAiPlan}
          />

          {generatedResult ? (
            <View style={[styles.aiResultBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[styles.resultHeading, { color: colors.primary }]}>
                Recommended Study Breakdown ({generatedResult.totalHours}h):
              </Text>
              {generatedResult.schedule.map((block: any, idx: number) => (
                <View key={idx} style={{ gap: 2, marginVertical: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
                    {block.dayOrBlock}: {block.topic}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{block.focus}</Text>
                </View>
              ))}

              <Row style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <Button title="Save to My CT Plans →" compact variant="primary" onPress={handleSavePlan} />
              </Row>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Existing CT Preparation Plans List */}
      <View style={{ marginTop: 16, gap: 12 }}>
        <H2 style={{ fontSize: 18 }}>My Upcoming Class Tests ({plans.length})</H2>

        {loading ? (
          <>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </>
        ) : plans.length === 0 ? (
          <Card style={{ alignItems: "center", padding: 24, gap: 8 }}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={48} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>No CT Plans Created Yet</Text>
            <Muted style={{ textAlign: "center" }}>
              Tap "✨ AI Study Plan" to generate an intelligent study schedule and checklist for your next class test.
            </Muted>
          </Card>
        ) : (
          plans.map((plan) => (
            <Card key={plan.id} style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.planTitle, { color: colors.text }]}>{plan.subject}</Text>
                  <Muted>
                    Target Exam: {new Date(plan.examDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </Muted>
                </View>
                <Pill tone="primary">{plan.progressPercent}% Ready</Pill>
              </Row>

              {/* Progress Bar */}
              <View style={[styles.progressTrack, { backgroundColor: colors.surface2 }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${plan.progressPercent}%` }]} />
              </View>

              {/* Checklist items */}
              <View style={{ gap: 6, marginTop: 4 }}>
                {plan.checklist.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleChecklistItem(plan.id, item.id)}
                    style={styles.checkRow}
                  >
                    <MaterialCommunityIcons
                      name={item.completed ? "checkbox-marked" : "checkbox-blank-outline"}
                      size={20}
                      color={item.completed ? colors.primary : colors.muted}
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
                  </Pressable>
                ))}
              </View>

              {/* Action Buttons */}
              <Row style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <Button
                  title="Practice Quiz 📝"
                  compact
                  variant="secondary"
                  onPress={() => {
                    triggerHaptic();
                    router.push("/quiz" as any);
                  }}
                />
                <Button
                  title="Join Study Room 🏫"
                  compact
                  variant="primary"
                  onPress={() => {
                    triggerHaptic();
                    router.push("/rooms" as any);
                  }}
                />
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  multilineInput: {
    height: 70,
    paddingTop: 8,
    textAlignVertical: "top",
  },
  aiResultBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  resultHeading: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
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
    paddingVertical: 2,
  },
  checkTitle: {
    fontSize: 13,
    flex: 1,
  },
});
