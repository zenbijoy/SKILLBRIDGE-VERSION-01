import React, { useEffect, useState, useCallback } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { fetchGoal, updateGoal } from "@/features/growth/growthApi";

export default function EditGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState("120");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [visibility, setVisibility] = useState<"private" | "connections" | "public">("private");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadGoal = useCallback(async () => {
    if (!id) return;
    try {
      const g = await fetchGoal(id);
      setTitle(g.title);
      setDescription(g.description || "");
      setTargetDate(g.target_date);
      setWeeklyMinutes(String(g.weekly_target_minutes || 120));
      setPriority(g.priority || "medium");
      setVisibility(g.visibility || "private");
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to load goal");
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGoal();
  }, [loadGoal]);

  const handleSave = async () => {
    if (!id || !title.trim()) return;
    try {
      setSaving(true);
      await updateGoal(id, {
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate.trim(),
        weekly_target_minutes: parseInt(weeklyMinutes, 10) || 120,
        priority,
        visibility,
      });
      router.back();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to update goal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
        <Text style={[styles.title, { color: colors.text }]}>{t("goals.edit")}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Goal Title</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>

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
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{t("common.save")}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  textArea: { minHeight: 80, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14 },
  row: { flexDirection: "row", gap: 12 },
  submitBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 12 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
