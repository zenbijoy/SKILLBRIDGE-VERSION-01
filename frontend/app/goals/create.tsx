import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import { createGoal } from "@/features/growth/growthApi";

interface MilestoneDraft {
  title: string;
  weight: string;
  description: string;
  target_date: string;
}

export default function CreateGoalScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [weeklyMinutes, setWeeklyMinutes] = useState("120");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [visibility, setVisibility] = useState<"private" | "connections" | "public">("private");
  const [goalType, setGoalType] = useState<"learn" | "teach" | "verify" | "research" | "project">("learn");

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "Complete Foundations & Setup", weight: "50", description: "", target_date: "" },
    { title: "Build Project & Verify Skills", weight: "50", description: "", target_date: "" },
  ]);

  const [saving, setSaving] = useState(false);

  const totalWeight = milestones.reduce((acc, m) => acc + (parseInt(m.weight, 10) || 0), 0);
  const isWeightValid = totalWeight === 100;

  const addMilestoneRow = () => {
    setMilestones([
      ...milestones,
      { title: "", weight: "0", description: "", target_date: "" },
    ]);
  };

  const removeMilestoneRow = (index: number) => {
    if (milestones.length <= 1) return;
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const updateMilestoneField = (index: number, field: keyof MilestoneDraft, value: string) => {
    const updated = [...milestones];
    const current = updated[index];
    if (!current) return;
    updated[index] = { ...current, [field]: value };
    setMilestones(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert(t("common.error"), "Please enter a goal title.");
      return;
    }
    if (!targetDate.trim()) {
      Alert.alert(t("common.error"), "Please enter a valid target date (YYYY-MM-DD).");
      return;
    }
    if (!isWeightValid) {
      Alert.alert(t("common.error"), t("goals.weightWarning"));
      return;
    }

    const invalidMilestones = milestones.some((m) => !m.title.trim());
    if (invalidMilestones) {
      Alert.alert(t("common.error"), "All milestones must have a title.");
      return;
    }

    try {
      setSaving(true);
      await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        goal_type: goalType,
        target_date: targetDate.trim(),
        weekly_target_minutes: parseInt(weeklyMinutes, 10) || 120,
        priority,
        visibility,
        milestones: milestones.map((m) => ({
          title: m.title.trim(),
          weight: parseInt(m.weight, 10) || 0,
          description: m.description.trim() || undefined,
          target_date: m.target_date.trim() || undefined,
        })),
      });

      router.replace("/goals" as any);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || t("common.tryAgain"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("goals.create")}</Text>
      </View>

      <GrowthHero
        eyebrow="NEW MILESTONE ROADMAP"
        title="Design Learning Goal"
        subtitle="Break your target into measurable, weighted steps totaling exactly 100%."
        illustration={growthIllustrations512.learningGoals}
        illustrationSize={125}
      />

      {/* Goal Title */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Goal Title *</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Master Full-Stack Web Development"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Description (Optional)</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Why are you pursuing this goal? What is your roadmap?"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Type & Priority Row */}
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: colors.text }]}>{t("goals.targetDate")}</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: colors.text }]}>{t("goals.weeklyTargetMinutes")}</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
            value={weeklyMinutes}
            onChangeText={setWeeklyMinutes}
            keyboardType="number-pad"
            placeholder="120"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* Priority Picker */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t("goals.priority")}</Text>
        <View style={styles.optionsRow}>
          {(["low", "medium", "high", "urgent"] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.optionChip,
                { borderColor: colors.border },
                priority === p && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setPriority(p)}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: priority === p ? "#FFFFFF" : colors.text },
                ]}
              >
                {p.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Visibility Picker */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t("goals.visibility")}</Text>
        <View style={styles.optionsRow}>
          {(["private", "connections", "public"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.optionChip,
                { borderColor: colors.border },
                visibility === v && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setVisibility(v)}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: visibility === v ? "#FFFFFF" : colors.text },
                ]}
              >
                {v.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Milestones Section */}
      <View style={styles.milestoneHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("goals.milestones")}
          </Text>
          <Text
            style={[
              styles.weightSum,
              { color: isWeightValid ? "#10B981" : "#EF4444" },
            ]}
          >
            Total Weight: {totalWeight}% {isWeightValid ? "✅" : "⚠️ (Must equal 100%)"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addMilestoneBtn, { backgroundColor: colors.primary + "15" }]}
          onPress={addMilestoneRow}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={[styles.addMilestoneText, { color: colors.primary }]}>
            {t("goals.addMilestone")}
          </Text>
        </TouchableOpacity>
      </View>

      {milestones.map((m, idx) => (
        <View
          key={idx}
          style={[
            styles.milestoneCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.milestoneCardTop}>
            <Text style={[styles.milestoneIndex, { color: colors.textSecondary }]}>
              #{idx + 1}
            </Text>
            {milestones.length > 1 && (
              <TouchableOpacity onPress={() => removeMilestoneRow(idx)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 3 }}>
              <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
                {t("goals.milestoneTitle")} *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
                ]}
                value={m.title}
                onChangeText={(val) => updateMilestoneField(idx, "title", val)}
                placeholder="e.g. Finish Module 1"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>
                {t("goals.weight")}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border },
                ]}
                value={m.weight}
                onChangeText={(val) => updateMilestoneField(idx, "weight", val)}
                keyboardType="number-pad"
                placeholder="50"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>
      ))}

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitBtn,
          { backgroundColor: isWeightValid ? colors.primary : "#9CA3AF" },
        ]}
        onPress={handleSubmit}
        disabled={saving || !isWeightValid}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>{t("goals.create")}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  milestoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  weightSum: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  addMilestoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addMilestoneText: {
    fontSize: 12,
    fontWeight: "700",
  },
  milestoneCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  milestoneCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  milestoneIndex: {
    fontSize: 12,
    fontWeight: "700",
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});


