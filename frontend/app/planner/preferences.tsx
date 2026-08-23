import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchPlannerPreferences,
  updatePlannerPreferences,
  type PlannerPreferences,
} from "@/features/growth/growthApi";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PlannerPreferencesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dailyMinutes, setDailyMinutes] = useState("60");
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [autoReschedule, setAutoReschedule] = useState(true);
  const [preferredModes, setPreferredModes] = useState<string[]>(["online", "hybrid"]);

  useEffect(() => {
    fetchPlannerPreferences()
      .then((pref) => {
        setPreferredDays(pref.preferred_days || [1, 2, 3, 4, 5]);
        setDailyMinutes(String(pref.preferred_daily_minutes || 60));
        setQuietHoursStart(pref.quiet_hours_start || "22:00");
        setQuietHoursEnd(pref.quiet_hours_end || "07:00");
        setAutoReschedule(pref.auto_reschedule ?? true);
        setPreferredModes(pref.preferred_modes || ["online", "hybrid"]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (dayIndex: number) => {
    if (preferredDays.includes(dayIndex)) {
      if (preferredDays.length > 1) {
        setPreferredDays(preferredDays.filter((d) => d !== dayIndex));
      }
    } else {
      setPreferredDays([...preferredDays, dayIndex].sort());
    }
  };

  const toggleMode = (mode: string) => {
    if (preferredModes.includes(mode)) {
      if (preferredModes.length > 1) {
        setPreferredModes(preferredModes.filter((m) => m !== mode));
      }
    } else {
      setPreferredModes([...preferredModes, mode]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updatePlannerPreferences({
        preferred_days: preferredDays,
        preferred_daily_minutes: parseInt(dailyMinutes, 10) || 60,
        quiet_hours_start: quietHoursStart.trim(),
        quiet_hours_end: quietHoursEnd.trim(),
        auto_reschedule: autoReschedule,
        preferred_modes: preferredModes,
      });
      router.back();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to update preferences");
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
        <Text style={[styles.title, { color: colors.text }]}>
          {t("planner.preferences")}
        </Text>
      </View>

      <GrowthHero
        eyebrow="STUDY PARAMETERS"
        title="Planner Configuration"
        subtitle="Define preferred days, daily targets, quiet hours, and auto-reschedule rules."
        illustration={growthIllustrations512.studyPlanner}
        illustrationSize={125}
      />

      {/* Preferred Days */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("planner.preferredDays")}
        </Text>
        <View style={styles.daysRow}>
          {DAYS.map((name, idx) => {
            const isSelected = preferredDays.includes(idx);
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.dayChip,
                  { borderColor: colors.border },
                  isSelected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => toggleDay(idx)}
              >
                <Text
                  style={[
                    styles.dayChipText,
                    { color: isSelected ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Daily Target Minutes */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("planner.dailyMinutes")}
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={dailyMinutes}
          onChangeText={setDailyMinutes}
          keyboardType="number-pad"
          placeholder="60"
        />
      </View>

      {/* Preferred Modes */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Preferred Collaboration Modes
        </Text>
        <View style={styles.modesRow}>
          {["online", "offline", "hybrid"].map((mode) => {
            const isSelected = preferredModes.includes(mode);
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.modeChip,
                  { borderColor: colors.border },
                  isSelected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => toggleMode(mode)}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    { color: isSelected ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {mode.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Quiet Hours */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("planner.quietHours")}
        </Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>Start Time</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
              ]}
              value={quietHoursStart}
              onChangeText={setQuietHoursStart}
              placeholder="22:00"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>End Time</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
              ]}
              value={quietHoursEnd}
              onChangeText={setQuietHoursEnd}
              placeholder="07:00"
            />
          </View>
        </View>
      </View>

      {/* Auto Reschedule Switch */}
      <View
        style={[
          styles.switchCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.switchTitle, { color: colors.text }]}>
            {t("planner.autoReschedule")}
          </Text>
          <Text style={[styles.switchSubtitle, { color: colors.textSecondary }]}>
            Automatically move missed study sessions to the next available study day.
          </Text>
        </View>
        <Switch
          value={autoReschedule}
          onValueChange={setAutoReschedule}
          trackColor={{ false: "#E5E7EB", true: colors.primary }}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveBtnText}>{t("common.save")}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  miniLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  daysRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  dayChipText: { fontSize: 13, fontWeight: "700" },
  modesRow: { flexDirection: "row", gap: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  modeChipText: { fontSize: 12, fontWeight: "700" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  row: { flexDirection: "row", gap: 12 },
  switchCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  switchTitle: { fontSize: 14, fontWeight: "700" },
  switchSubtitle: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  saveBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 10 },
  saveBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});


