import React, { useState, useId } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import { createGoal } from "@/features/growth/growthApi";
import { Screen, triggerHaptic } from "@/components/ui";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

interface MilestoneDraft {
  id: string;
  title: string;
  weight: string;
  description: string;
  target_date: string;
  isExpanded?: boolean;
}

type GoalType = "learn" | "project" | "research" | "verify" | "teach";
type Priority = "low" | "medium" | "high" | "urgent";
type Visibility = "private" | "connections" | "public";

const GOAL_TYPES: { id: GoalType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "learn", label: "Learn", icon: "school-outline" },
  { id: "project", label: "Project", icon: "rocket-outline" },
  { id: "research", label: "Research", icon: "flask-outline" },
  { id: "verify", label: "Verify", icon: "shield-checkmark-outline" },
  { id: "teach", label: "Teach", icon: "people-outline" },
];

const STUDY_MODES = [
  { id: "online", label: "Online", icon: "laptop-outline" },
  { id: "hands-on", label: "Hands-on", icon: "construct-outline" },
  { id: "reading", label: "Reading", icon: "book-outline" },
  { id: "peer", label: "Peer Study", icon: "chatbubbles-outline" },
  { id: "mentorship", label: "Mentorship", icon: "ribbon-outline" },
];

const PRESET_TEMPLATES = [
  {
    name: "Full-Stack Dev",
    title: "Full-Stack Web Application Mastery",
    type: "project" as GoalType,
    description: "Design, build, and deploy production-ready full-stack applications with modern architecture.",
    days: 60,
    minutes: 300,
    modes: ["online", "hands-on"],
    priority: "high" as Priority,
    milestones: [
      { title: "Frontend Architecture & Design System", weight: "30", description: "Build scalable UI components with TypeScript", target_date: "" },
      { title: "REST / GraphQL Backend & Database", weight: "35", description: "Secure APIs, auth, transactions, and indexing", target_date: "" },
      { title: "Testing, CI/CD Pipeline & Cloud Deployment", weight: "35", description: "Automated test suites and cloud hosting", target_date: "" },
    ],
  },
  {
    name: "AI & Agents",
    title: "AI & Autonomous Agent Development",
    type: "learn" as GoalType,
    description: "Master LLM orchestration, tool calling, embeddings, RAG pipelines, and multi-agent workflows.",
    days: 45,
    minutes: 240,
    modes: ["hands-on", "reading"],
    priority: "urgent" as Priority,
    milestones: [
      { title: "Prompt Optimization & Evaluation Sets", weight: "30", description: "Systematic prompt evaluation and benchmarks", target_date: "" },
      { title: "RAG & Vector Database Architecture", weight: "35", description: "Semantic search and document chunking pipelines", target_date: "" },
      { title: "Autonomous Agent Tool Calling MVP", weight: "35", description: "Deploy full agent with function calling", target_date: "" },
    ],
  },
  {
    name: "System Design",
    title: "Large-Scale Distributed Systems",
    type: "research" as GoalType,
    description: "Study distributed consensus, partitioning, caching, message queues, and high-availability patterns.",
    days: 90,
    minutes: 180,
    modes: ["reading", "peer"],
    priority: "medium" as Priority,
    milestones: [
      { title: "Scalability, Partitioning & Replication", weight: "30", description: "CAP theorem, sharding, and replication models", target_date: "" },
      { title: "Message Queues & Event Streaming", weight: "35", description: "Kafka/RabbitMQ patterns and idempotency", target_date: "" },
      { title: "Architect End-to-End System Design Case", weight: "35", description: "Produce complete RFC architecture document", target_date: "" },
    ],
  },
];

function formatDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CreateGoalScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("learn");
  const [startDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState(() => formatDaysFromNow(30));
  const [weeklyMinutes, setWeeklyMinutes] = useState("120");
  const [studyModes, setStudyModes] = useState<string[]>(["online", "hands-on"]);
  const [priority, setPriority] = useState<Priority>("medium");
  const [visibility, setVisibility] = useState<Visibility>("private");

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { id: "m1", title: "Complete Foundations & Architecture", weight: "50", description: "", target_date: "", isExpanded: false },
    { id: "m2", title: "Build Project & Verify Skills", weight: "50", description: "", target_date: "", isExpanded: false },
  ]);

  const [saving, setSaving] = useState(false);

  const totalWeight = milestones.reduce((acc, m) => acc + (parseInt(m.weight, 10) || 0), 0);
  const isWeightValid = totalWeight === 100;

  // Quick preset loader
  const applyPreset = (preset: typeof PRESET_TEMPLATES[number]) => {
    triggerHaptic();
    setTitle(preset.title);
    setGoalType(preset.type);
    setDescription(preset.description);
    setTargetDate(formatDaysFromNow(preset.days));
    setWeeklyMinutes(String(preset.minutes));
    setStudyModes(preset.modes);
    setPriority(preset.priority);
    setMilestones(
      preset.milestones.map((m, idx) => ({
        id: `m-preset-${Date.now()}-${idx}`,
        title: m.title,
        weight: m.weight,
        description: m.description,
        target_date: m.target_date,
        isExpanded: false,
      }))
    );
  };

  // Quick duration pills
  const setDurationDays = (days: number) => {
    triggerHaptic();
    setTargetDate(formatDaysFromNow(days));
  };

  // Quick weekly commitment pills
  const setCommitmentMinutes = (mins: number) => {
    triggerHaptic();
    setWeeklyMinutes(String(mins));
  };

  // Toggle study mode
  const toggleStudyMode = (modeId: string) => {
    triggerHaptic();
    setStudyModes((prev) =>
      prev.includes(modeId) ? prev.filter((m) => m !== modeId) : [...prev, modeId]
    );
  };

  // Add new milestone
  const addMilestoneRow = () => {
    triggerHaptic();
    const remaining = Math.max(0, 100 - totalWeight);
    const defaultWeight = remaining > 0 ? String(remaining) : "10";
    setMilestones([
      ...milestones,
      {
        id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: "",
        weight: defaultWeight,
        description: "",
        target_date: "",
        isExpanded: false,
      },
    ]);
  };

  // Auto-balance weights evenly across all milestones to sum to exactly 100%
  const autoBalanceWeights = () => {
    triggerHaptic();
    const count = milestones.length;
    if (count === 0) return;

    const baseWeight = Math.floor(100 / count);
    const remainder = 100 - baseWeight * count;

    const updated = milestones.map((m, idx) => {
      // Allocate remainder to first milestones
      const weight = idx < remainder ? baseWeight + 1 : baseWeight;
      return { ...m, weight: String(weight) };
    });

    setMilestones(updated);
  };

  // Adjust individual milestone weight by delta (+5 or -5)
  const adjustMilestoneWeight = (index: number, delta: number) => {
    triggerHaptic();
    const updated = [...milestones];
    const current = updated[index];
    if (!current) return;
    const currentVal = parseInt(current.weight, 10) || 0;
    const nextVal = Math.max(1, Math.min(100, currentVal + delta));
    updated[index] = { ...current, weight: String(nextVal) };
    setMilestones(updated);
  };

  const removeMilestoneRow = (index: number) => {
    if (milestones.length <= 1) return;
    triggerHaptic();
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const moveMilestone = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= milestones.length) return;
    triggerHaptic();
    const updated = [...milestones];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setMilestones(updated);
  };

  const toggleMilestoneExpand = (index: number) => {
    triggerHaptic();
    const updated = [...milestones];
    if (!updated[index]) return;
    updated[index] = { ...updated[index], isExpanded: !updated[index].isExpanded };
    setMilestones(updated);
  };

  const updateMilestoneField = (index: number, field: keyof MilestoneDraft, value: string) => {
    const updated = [...milestones];
    const current = updated[index];
    if (!current) return;
    updated[index] = { ...current, [field]: value };
    setMilestones(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim() || title.trim().length < 2) {
      Alert.alert(t("common.error"), "Please enter a goal title (at least 2 characters).");
      return;
    }
    if (!targetDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
      Alert.alert(t("common.error"), "Please enter a valid target date in YYYY-MM-DD format.");
      return;
    }
    if (targetDate.trim() < startDate) {
      Alert.alert(t("common.error"), "Target date cannot precede today's date.");
      return;
    }
    if (!isWeightValid) {
      Alert.alert(
        t("common.error"),
        `Milestone weights must total exactly 100% (currently ${totalWeight}%). Tap 'Auto-Balance' to distribute automatically.`
      );
      return;
    }

    const invalidMilestones = milestones.some((m) => !m.title.trim());
    if (invalidMilestones) {
      Alert.alert(t("common.error"), "All milestones must have a title.");
      return;
    }

    const zeroWeight = milestones.some((m) => (parseInt(m.weight, 10) || 0) < 1);
    if (zeroWeight) {
      Alert.alert(t("common.error"), "Each milestone must have at least 1% weight.");
      return;
    }

    try {
      setSaving(true);
      await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        goal_type: goalType,
        start_date: startDate,
        target_date: targetDate.trim(),
        weekly_target_minutes: parseInt(weeklyMinutes, 10) || 120,
        preferred_study_modes: studyModes.length > 0 ? studyModes : ["online", "hands-on"],
        priority,
        visibility,
        milestones: milestones.map((m, idx) => ({
          title: m.title.trim(),
          weight: parseInt(m.weight, 10) || 1,
          description: m.description.trim() || undefined,
          target_date: m.target_date.trim() || undefined,
        })),
      });

      triggerHaptic();
      router.replace("/goals" as any);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || t("common.tryAgain"));
    } finally {
      setSaving(false);
    }
  };

  const getPriorityTheme = (p: Priority) => {
    switch (p) {
      case "urgent":
        return { color: "#EF4444", bg: "#EF444418", border: "#EF444440" };
      case "high":
        return { color: "#F59E0B", bg: "#F59E0B18", border: "#F59E0B40" };
      case "medium":
        return { color: "#3B82F6", bg: "#3B82F618", border: "#3B82F640" };
      default:
        return { color: colors.textSecondary, bg: colors.border + "30", border: colors.border };
    }
  };

  const getVisibilityIcon = (v: Visibility): keyof typeof Ionicons.glyphMap => {
    switch (v) {
      case "private":
        return "lock-closed-outline";
      case "connections":
        return "people-outline";
      case "public":
        return "globe-outline";
    }
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.bg }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 80 + (keyboardHeight > 0 ? keyboardHeight : 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Compact Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              router.back();
            }}
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.title, { color: colors.text }]}>{t("goals.create")}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Plan measurable milestones & learning momentum
            </Text>
          </View>
        </View>

        {/* Compact Hero Banner */}
        <GrowthHero
          compact
          eyebrow="MILESTONE ROADMAP"
          title="Design Learning Goal"
          subtitle="Break targets into measurable steps totaling 100%."
          illustration={growthIllustrations512.learningGoals}
          illustrationSize={54}
        />

        {/* Quick Starter Templates */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.primary + "16" }]}>
              <Ionicons name="flash-outline" size={15} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Quick Starter Roadmap</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateList}>
            {PRESET_TEMPLATES.map((tmpl) => (
              <TouchableOpacity
                key={tmpl.name}
                style={[styles.templateChip, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => applyPreset(tmpl)}
              >
                <Ionicons name="sparkles" size={12} color={colors.primary} />
                <Text style={[styles.templateText, { color: colors.text }]}>{tmpl.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Goal Overview Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.primary + "16" }]}>
              <Ionicons name="compass-outline" size={15} color={colors.primary} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Goal Objective & Type</Text>
          </View>

          {/* Goal Title */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>
              Goal Title <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Master Full-Stack Web Development"
              placeholderTextColor={colors.textSecondary}
              maxLength={200}
            />
          </View>

          {/* Goal Type Selector */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Category / Mode</Text>
            <View style={styles.chipsRow}>
              {GOAL_TYPES.map((gt) => {
                const isSelected = goalType === gt.id;
                return (
                  <TouchableOpacity
                    key={gt.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.bg,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setGoalType(gt.id);
                    }}
                  >
                    <Ionicons
                      name={gt.icon}
                      size={13}
                      color={isSelected ? "#FFFFFF" : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {gt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Description (Optional)</Text>
            <TextInput
              style={[
                styles.textArea,
                { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Why are you pursuing this goal? Outline key deliverables..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
              maxLength={2000}
            />
          </View>
        </View>

        {/* Timeline & Commitment Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: "#10B98118" }]}>
              <Ionicons name="calendar-outline" size={15} color="#10B981" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Timeline & Commitment</Text>
          </View>

          {/* Target Date with Presets */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                {t("goals.targetDate")} <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                {targetDate ? targetDate : "YYYY-MM-DD"}
              </Text>
            </View>
            <View style={styles.inputWithIcon}>
              <Ionicons
                name="calendar-clear-outline"
                size={16}
                color={colors.textSecondary}
                style={styles.leadingIcon}
              />
              <TextInput
                style={[
                  styles.inputInner,
                  { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
                ]}
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                maxLength={10}
              />
            </View>
            <View style={styles.presetPillsRow}>
              {[
                { label: "+2 Wks", days: 14 },
                { label: "+1 Mo", days: 30 },
                { label: "+3 Mo", days: 90 },
                { label: "+6 Mo", days: 180 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.smallPill, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  onPress={() => setDurationDays(p.days)}
                >
                  <Text style={[styles.smallPillText, { color: colors.textSecondary }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Weekly Commitment with Presets */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>
                {t("goals.weeklyTargetMinutes")}
              </Text>
              <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
                ≈ {Math.round((parseInt(weeklyMinutes, 10) || 0) / 60 * 10) / 10} hrs / week
              </Text>
            </View>
            <View style={styles.inputWithIcon}>
              <Ionicons
                name="time-outline"
                size={16}
                color={colors.textSecondary}
                style={styles.leadingIcon}
              />
              <TextInput
                style={[
                  styles.inputInner,
                  { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
                ]}
                value={weeklyMinutes}
                onChangeText={setWeeklyMinutes}
                keyboardType="number-pad"
                placeholder="120"
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
            </View>
            <View style={styles.presetPillsRow}>
              {[
                { label: "1h/wk", mins: 60 },
                { label: "2h/wk", mins: 120 },
                { label: "5h/wk", mins: 300 },
                { label: "10h/wk", mins: 600 },
              ].map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[styles.smallPill, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  onPress={() => setCommitmentMinutes(c.mins)}
                >
                  <Text style={[styles.smallPillText, { color: colors.textSecondary }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Study Modes Multi-select */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Preferred Learning Modes</Text>
            <View style={styles.chipsRow}>
              {STUDY_MODES.map((sm) => {
                const isSelected = studyModes.includes(sm.id);
                return (
                  <TouchableOpacity
                    key={sm.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected ? colors.primary + "1A" : colors.bg,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => toggleStudyMode(sm.id)}
                  >
                    <Ionicons
                      name={sm.icon as any}
                      size={13}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? colors.primary : colors.text },
                      ]}
                    >
                      {sm.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Priority & Visibility Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: "#8B5CF618" }]}>
              <Ionicons name="options-outline" size={15} color="#8B5CF6" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Priority & Visibility</Text>
          </View>

          {/* Priority */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("goals.priority")}</Text>
            <View style={styles.optionsRow}>
              {(["low", "medium", "high", "urgent"] as const).map((p) => {
                const isSelected = priority === p;
                const pTheme = getPriorityTheme(p);
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: isSelected ? pTheme.bg : colors.bg,
                        borderColor: isSelected ? pTheme.color : colors.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setPriority(p);
                    }}
                  >
                    <View
                      style={[
                        styles.priorityDot,
                        { backgroundColor: isSelected ? pTheme.color : colors.textSecondary },
                      ]}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? pTheme.color : colors.text },
                      ]}
                    >
                      {p.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Visibility */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("goals.visibility")}</Text>
            <View style={styles.optionsRow}>
              {(["private", "connections", "public"] as const).map((v) => {
                const isSelected = visibility === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: isSelected ? colors.primary + "18" : colors.bg,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setVisibility(v);
                    }}
                  >
                    <Ionicons
                      name={getVisibilityIcon(v)}
                      size={13}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? colors.primary : colors.text },
                      ]}
                    >
                      {v.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Milestones & Allocation Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Milestone Section Header with Auto-Balance */}
          <View style={styles.milestoneSectionHeader}>
            <View style={styles.milestoneTitleWrap}>
              <View style={[styles.cardIconWrap, { backgroundColor: colors.primary + "16" }]}>
                <Ionicons name="flag-outline" size={15} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {t("goals.milestones")}
                </Text>
                <Text style={[styles.milestoneCountSubtitle, { color: colors.textSecondary }]}>
                  {milestones.length} milestone{milestones.length === 1 ? "" : "s"} · Total Weight:{" "}
                  <Text
                    style={{
                      fontWeight: "800",
                      color: isWeightValid ? "#10B981" : totalWeight > 100 ? "#EF4444" : "#F59E0B",
                    }}
                  >
                    {totalWeight}%
                  </Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.autoBalanceBtn, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "30" }]}
              onPress={autoBalanceWeights}
              accessibilityRole="button"
              accessibilityLabel="Auto balance milestone weights to 100%"
            >
              <Ionicons name="flash" size={13} color={colors.primary} />
              <Text style={[styles.autoBalanceText, { color: colors.primary }]}>Auto-Balance</Text>
            </TouchableOpacity>
          </View>

          {/* Visual Weight Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBarBg, { backgroundColor: colors.border + "60" }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, totalWeight)}%`,
                    backgroundColor: isWeightValid
                      ? "#10B981"
                      : totalWeight > 100
                      ? "#EF4444"
                      : "#F59E0B",
                  },
                ]}
              />
            </View>
            <View style={styles.weightStatusRow}>
              <Text
                style={[
                  styles.weightStatusText,
                  { color: isWeightValid ? "#10B981" : totalWeight > 100 ? "#EF4444" : "#F59E0B" },
                ]}
              >
                {isWeightValid
                  ? "✅ 100% Allocated (Ready)"
                  : totalWeight < 100
                  ? `⚠️ ${100 - totalWeight}% remaining to reach 100%`
                  : `⚠️ ${totalWeight - 100}% over limit (must equal 100%)`}
              </Text>
            </View>
          </View>

          {/* Milestone List */}
          <View style={styles.milestonesList}>
            {milestones.map((m, idx) => {
              const parsedWeight = parseInt(m.weight, 10) || 0;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.milestoneCard,
                    { backgroundColor: colors.bg, borderColor: colors.border },
                  ]}
                >
                  {/* Top Bar of Milestone Card */}
                  <View style={styles.milestoneTopBar}>
                    <View style={styles.milestoneBadgeRow}>
                      <View style={[styles.stepBadge, { backgroundColor: colors.primary + "1A" }]}>
                        <Text style={[styles.stepBadgeText, { color: colors.primary }]}>
                          #{idx + 1}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleMilestoneExpand(idx)}
                        style={styles.expandToggleBtn}
                        hitSlop={8}
                      >
                        <Text style={[styles.expandToggleText, { color: colors.textSecondary }]}>
                          {m.isExpanded ? "Less" : "Details"}
                        </Text>
                        <Ionicons
                          name={m.isExpanded ? "chevron-up" : "chevron-down"}
                          size={12}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Order & Remove actions */}
                    <View style={styles.milestoneActions}>
                      {idx > 0 && (
                        <TouchableOpacity
                          onPress={() => moveMilestone(idx, "up")}
                          style={styles.miniActionBtn}
                          hitSlop={6}
                        >
                          <Ionicons name="arrow-up" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      {idx < milestones.length - 1 && (
                        <TouchableOpacity
                          onPress={() => moveMilestone(idx, "down")}
                          style={styles.miniActionBtn}
                          hitSlop={6}
                        >
                          <Ionicons name="arrow-down" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      {milestones.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeMilestoneRow(idx)}
                          style={[styles.miniActionBtn, { marginLeft: 4 }]}
                          hitSlop={6}
                        >
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Title & Weight Row */}
                  <View style={styles.milestoneMainRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
                        {t("goals.milestoneTitle")} *
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                        ]}
                        value={m.title}
                        onChangeText={(val) => updateMilestoneField(idx, "title", val)}
                        placeholder={`e.g. Milestone #${idx + 1} deliverables`}
                        placeholderTextColor={colors.textSecondary}
                        maxLength={200}
                      />
                    </View>

                    {/* Weight Controls */}
                    <View style={styles.weightControlBlock}>
                      <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>Weight</Text>
                      <View style={styles.stepperContainer}>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          onPress={() => adjustMilestoneWeight(idx, -5)}
                          hitSlop={4}
                        >
                          <Ionicons name="remove" size={12} color={colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={[
                            styles.stepperInput,
                            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                          ]}
                          value={m.weight}
                          onChangeText={(val) => updateMilestoneField(idx, "weight", val)}
                          keyboardType="number-pad"
                          placeholder="50"
                          placeholderTextColor={colors.textSecondary}
                          maxLength={3}
                        />
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          onPress={() => adjustMilestoneWeight(idx, +5)}
                          hitSlop={4}
                        >
                          <Ionicons name="add" size={12} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Optional Milestone Details */}
                  {m.isExpanded && (
                    <View style={styles.milestoneExtraFields}>
                      <View style={{ gap: 4 }}>
                        <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
                          Key Result / Description (Optional)
                        </Text>
                        <TextInput
                          style={[
                            styles.textAreaCompact,
                            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                          ]}
                          value={m.description}
                          onChangeText={(val) => updateMilestoneField(idx, "description", val)}
                          placeholder="Specific deliverables or criteria to verify this step..."
                          placeholderTextColor={colors.textSecondary}
                          multiline
                          numberOfLines={2}
                          maxLength={1000}
                        />
                      </View>
                      <View style={{ gap: 4 }}>
                        <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
                          Milestone Deadline (Optional)
                        </Text>
                        <TextInput
                          style={[
                            styles.inputCompact,
                            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                          ]}
                          value={m.target_date}
                          onChangeText={(val) => updateMilestoneField(idx, "target_date", val)}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textSecondary}
                          maxLength={10}
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Add Milestone Button */}
          <TouchableOpacity
            style={[styles.addStepButton, { borderColor: colors.primary, backgroundColor: colors.primary + "0D" }]}
            onPress={addMilestoneRow}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.addStepText, { color: colors.primary }]}>
              {t("goals.addMilestone")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit Action Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            {
              backgroundColor: isWeightValid && title.trim() ? colors.primary : isDark ? "#2A364F" : "#CBD5E1",
              shadowColor: colors.primary,
            },
          ]}
          onPress={handleSubmit}
          disabled={saving || !isWeightValid || !title.trim()}
          accessibilityRole="button"
          accessibilityLabel={t("goals.create")}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <View style={styles.submitBtnContent}>
              <Ionicons
                name={isWeightValid ? "checkmark-circle" : "alert-circle-outline"}
                size={18}
                color={isWeightValid && title.trim() ? "#FFFFFF" : colors.textSecondary}
              />
              <Text
                style={[
                  styles.submitBtnText,
                  { color: isWeightValid && title.trim() ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {!title.trim()
                  ? "Enter Goal Title"
                  : !isWeightValid
                  ? `Weights Must Total 100% (${totalWeight}%)`
                  : t("goals.create")}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  templateList: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  templateText: {
    fontSize: 11,
    fontWeight: "700",
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldHint: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
    fontSize: 13,
  },
  inputCompact: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  inputWithIcon: {
    position: "relative",
    justifyContent: "center",
  },
  leadingIcon: {
    position: "absolute",
    left: 10,
    zIndex: 1,
  },
  inputInner: {
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    paddingLeft: 34,
    paddingRight: 11,
    fontSize: 13,
  },
  textArea: {
    minHeight: 56,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: "top",
  },
  textAreaCompact: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    textAlignVertical: "top",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  presetPillsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  smallPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  optionsRow: {
    flexDirection: "row",
    gap: 6,
  },
  optionChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  optionText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  milestoneSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  milestoneTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  milestoneCountSubtitle: {
    fontSize: 11,
    fontWeight: "600",
  },
  autoBalanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  autoBalanceText: {
    fontSize: 11,
    fontWeight: "800",
  },
  progressContainer: {
    gap: 4,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  weightStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weightStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  milestonesList: {
    gap: 8,
  },
  milestoneCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  milestoneTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  milestoneBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  expandToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  expandToggleText: {
    fontSize: 10,
    fontWeight: "600",
  },
  milestoneActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniActionBtn: {
    padding: 4,
    borderRadius: 4,
  },
  milestoneMainRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 3,
    textTransform: "uppercase",
  },
  weightControlBlock: {
    width: 106,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  stepperBtn: {
    width: 28,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperInput: {
    flex: 1,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 2,
  },
  milestoneExtraFields: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F030",
    gap: 6,
  },
  addStepButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 6,
  },
  addStepText: {
    fontSize: 12,
    fontWeight: "800",
  },
  submitBtn: {
    height: 46,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
