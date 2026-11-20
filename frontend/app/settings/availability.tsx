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
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchTutorRules,
  saveTutorRules,
  addTutorException,
  deleteTutorException,
  type TutorAvailabilityRule,
  type TutorAvailabilityException,
} from "@/features/growth/growthApi";
import { Row, Screen, triggerHaptic } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TutorAvailabilitySettingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [rules, setRules] = useState<TutorAvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<TutorAvailabilityException[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New exception form state
  const [newExceptionDate, setNewExceptionDate] = useState("");
  const [newExceptionReason, setNewExceptionReason] = useState("");

  const loadData = useCallback(async () => {
    try {
      const data = await fetchTutorRules();
      setRules(data.rules || []);
      setExceptions(data.exceptions || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick 1-Click Schedule Presets
  const applyPreset = (type: "weekday_evenings" | "weekend_mornings" | "full_week") => {
    triggerHaptic();
    if (type === "weekday_evenings") {
      // Mon (1) to Fri (5): 18:00 to 21:00 UTC
      const newRules: TutorAvailabilityRule[] = [1, 2, 3, 4, 5].map((d) => ({
        day_of_week: d,
        start_time_utc: "18:00",
        end_time_utc: "21:00",
        slot_duration_minutes: 60,
        buffer_minutes: 15,
        mode: "online",
        is_active: true,
      }));
      setRules(newRules);
    } else if (type === "weekend_mornings") {
      // Sat (6) & Sun (0): 10:00 to 14:00 UTC
      const newRules: TutorAvailabilityRule[] = [6, 0].map((d) => ({
        day_of_week: d,
        start_time_utc: "10:00",
        end_time_utc: "14:00",
        slot_duration_minutes: 60,
        buffer_minutes: 15,
        mode: "online",
        is_active: true,
      }));
      setRules(newRules);
    } else if (type === "full_week") {
      // Mon (1) to Sun (0): 14:00 to 18:00 UTC
      const newRules: TutorAvailabilityRule[] = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
        day_of_week: d,
        start_time_utc: "14:00",
        end_time_utc: "18:00",
        slot_duration_minutes: 60,
        buffer_minutes: 15,
        mode: "online",
        is_active: true,
      }));
      setRules(newRules);
    }
    Alert.alert("Preset Applied!", "Review the slots below and click 'Save Weekly Schedule' to publish.");
  };

  const addRuleRow = () => {
    setRules([
      ...rules,
      {
        day_of_week: 1,
        start_time_utc: "14:00",
        end_time_utc: "18:00",
        slot_duration_minutes: 60,
        buffer_minutes: 15,
        mode: "online",
        is_active: true,
      },
    ]);
  };

  const removeRuleRow = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleSaveRules = async () => {
    try {
      setSaving(true);
      await saveTutorRules(rules);
      triggerHaptic();
      Alert.alert("Saved! ✅", "Your weekly availability rules have been updated and are now live for learners.");
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to save rules");
    } finally {
      setSaving(false);
    }
  };

  const handleAddException = async () => {
    if (!newExceptionDate.trim()) {
      Alert.alert(t("common.error"), "Please enter a valid date (YYYY-MM-DD)");
      return;
    }
    try {
      setSaving(true);
      await addTutorException({
        exception_date: newExceptionDate.trim(),
        is_blackout: true,
        reason: newExceptionReason.trim() || undefined,
      });
      triggerHaptic();
      setNewExceptionDate("");
      setNewExceptionReason("");
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to add blackout exception");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteException = async (id?: string) => {
    if (!id) return;
    try {
      await deleteTutorException(id);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to remove exception");
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("booking.availabilitySettings") || "Tutor Schedule & Rules"}
          </Text>
        </View>

        <GrowthHero
          eyebrow="TUTOR AVAILABILITY"
          title="Office Hours & Slots"
          subtitle="Define when learners can book 1:1 sessions with you. Times are automatically adjusted to each student's timezone."
          illustration={growthIllustrations512.tutorBooking}
          illustrationSize={120}
        />

        {/* 1-Tap Quick Presets */}
        <View style={[styles.presetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.presetTitle, { color: colors.text }]}>⚡ 1-Tap Schedule Presets</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            Quickly fill your schedule with common student tutoring blocks:
          </Text>

          <Row style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.primarySoft }]}
              onPress={() => applyPreset("weekday_evenings")}
            >
              <Text style={[styles.presetBtnText, { color: colors.primary }]}>Weekday Evenings (6-9 PM)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.primarySoft }]}
              onPress={() => applyPreset("weekend_mornings")}
            >
              <Text style={[styles.presetBtnText, { color: colors.primary }]}>Weekend Mornings (10 AM-2 PM)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.primarySoft }]}
              onPress={() => applyPreset("full_week")}
            >
              <Text style={[styles.presetBtnText, { color: colors.primary }]}>All Week (2-6 PM)</Text>
            </TouchableOpacity>
          </Row>
        </View>

        {/* Rules Section Header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("booking.rules") || "Active Rules"} ({rules.length})
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>24h format (UTC)</Text>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primarySoft }]}
            onPress={addRuleRow}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>
              {t("booking.addRule") || "Add Day"}
            </Text>
          </TouchableOpacity>
        </View>

        {rules.map((rule, idx) => (
          <View
            key={idx}
            style={[
              styles.ruleCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.ruleTop}>
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="calendar" size={16} color={colors.primary} />
                <Text style={[styles.dayLabel, { color: colors.primary }]}>
                  {DAYS[rule.day_of_week]}
                </Text>
              </Row>
              <TouchableOpacity onPress={() => removeRuleRow(idx)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.miniLabel, { color: colors.muted }]}>Start (UTC)</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={rule.start_time_utc}
                  onChangeText={(val) => {
                    const updated = [...rules];
                    const r = updated[idx];
                    if (r) r.start_time_utc = val;
                    setRules(updated);
                  }}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.miniLabel, { color: colors.muted }]}>End (UTC)</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={rule.end_time_utc}
                  onChangeText={(val) => {
                    const updated = [...rules];
                    const r = updated[idx];
                    if (r) r.end_time_utc = val;
                    setRules(updated);
                  }}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.miniLabel, { color: colors.muted }]}>Slot Duration</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={String(rule.slot_duration_minutes)}
                  keyboardType="number-pad"
                  onChangeText={(val) => {
                    const updated = [...rules];
                    const r = updated[idx];
                    if (r) r.slot_duration_minutes = parseInt(val, 10) || 60;
                    setRules(updated);
                  }}
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSaveRules}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>{t("common.save") || "Save Weekly Schedule"}</Text>
          )}
        </TouchableOpacity>

        {/* Blackout Exceptions Section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("booking.exceptions") || "Blackout Days"}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>Dates you are unavailable (e.g. exams, travel)</Text>
          </View>
        </View>

        <View
          style={[
            styles.exceptionInputCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
            ]}
            value={newExceptionDate}
            onChangeText={setNewExceptionDate}
            placeholder="YYYY-MM-DD (e.g. 2026-11-25)"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
            ]}
            value={newExceptionReason}
            onChangeText={setNewExceptionReason}
            placeholder="Reason (e.g. Midterm week, Traveling)"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity
            style={[styles.addExceptionBtn, { backgroundColor: colors.primary }]}
            onPress={handleAddException}
          >
            <Text style={styles.addExceptionBtnText}>{t("booking.addException") || "Add Blackout Date"}</Text>
          </TouchableOpacity>
        </View>

        {exceptions.map((exc) => (
          <View
            key={exc.id}
            style={[
              styles.exceptionItem,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.exceptionDate, { color: colors.text }]}>
                {exc.exception_date} (Unavailable)
              </Text>
              {exc.reason ? (
                <Text style={[styles.exceptionReason, { color: colors.muted }]}>
                  {exc.reason}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => handleDeleteException(exc.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  presetCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  presetTitle: { fontSize: 14, fontWeight: "800" },
  presetBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 },
  presetBtnText: { fontSize: 12, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: "700" },
  ruleCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  ruleTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayLabel: { fontSize: 13, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  miniLabel: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  input: { height: 42, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, fontSize: 13 },
  saveBtn: { height: 46, borderRadius: 10, justifyContent: "center", alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  exceptionInputCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  addExceptionBtn: { height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  addExceptionBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  exceptionItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1 },
  exceptionDate: { fontSize: 13, fontWeight: "700" },
  exceptionReason: { fontSize: 12, marginTop: 2 },
});
