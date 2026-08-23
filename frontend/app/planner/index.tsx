import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { GrowthEmptyState } from "@/components/GrowthEmptyState";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchPlannerWeek,
  generatePlannerSchedule,
  completeStudyBlock,
  skipStudyBlock,
  type StudyPlanBlock,
} from "@/features/growth/growthApi";

export default function PlannerScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [blocks, setBlocks] = useState<StudyPlanBlock[]>([]);
  const [activeGoals, setActiveGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchPlannerWeek();
      setBlocks(data.blocks || []);
      setActiveGoals(data.active_goals || []);
    } catch {
      // Handled by fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleGenerate = async () => {
    if (activeGoals.length === 0) {
      Alert.alert(
        "No Active Goals",
        "Please create and activate at least one learning goal before generating a study plan.",
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("goals.create"), onPress: () => router.push("/goals/create" as any) },
        ],
      );
      return;
    }

    try {
      setGenerating(true);
      const res = await generatePlannerSchedule();
      Alert.alert("Schedule Generated", `Generated ${res.generated_count} optimized study sessions for your week!`);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  const handleCompleteBlock = async (id: string) => {
    try {
      await completeStudyBlock(id);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to complete study block");
    }
  };

  const handleSkipBlock = async (id: string) => {
    try {
      await skipStudyBlock(id);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to skip study block");
    }
  };

  const completedCount = blocks.filter((b) => b.is_completed).length;
  const totalMinutes = blocks.reduce((acc, b) => acc + (b.is_completed ? b.duration_minutes : 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t("planner.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("planner.subtitle")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.prefBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/planner/preferences" as any)}
          accessibilityRole="button"
          accessibilityLabel={t("planner.preferences")}
        >
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Action Row & Stats */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.generateBtn, { backgroundColor: colors.primary }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
              <Text style={styles.generateBtnText}>{t("planner.generate")}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.weekBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/planner/week" as any)}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.text} />
          <Text style={[styles.weekBtnText, { color: colors.text }]}>
            {t("planner.weekView")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary KPI Cards */}
      <View style={styles.kpiContainer}>
        <View
          style={[
            styles.kpiCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.kpiValue, { color: colors.primary }]}>
            {completedCount}/{blocks.length}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
            Sessions Done
          </Text>
        </View>
        <View
          style={[
            styles.kpiCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.kpiValue, { color: "#10B981" }]}>{totalMinutes}m</Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
            Studied This Week
          </Text>
        </View>
      </View>

      {/* Blocks List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <GrowthHero
            eyebrow="STUDY COMPASS"
            title={t("planner.title")}
            subtitle={t("planner.subtitle")}
            illustration={growthIllustrations512.studyPlanner}
            illustrationSize={135}
          />

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 10 }]}>
            {t("planner.studyBlocks")} ({blocks.length})
          </Text>

          {blocks.length === 0 ? (
            <GrowthEmptyState
              illustration={growthIllustrations512.studyPlanner}
              title={t("planner.noBlocks")}
              detail="Click 'Generate Schedule' to calculate an optimized, deterministic study schedule based on your active goals."
              actionTitle={t("planner.generate")}
              onAction={handleGenerate}
            />
          ) : (
            blocks.map((block) => {
              const startFormatted = new Date(block.start_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const dateFormatted = new Date(block.start_time).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });

              return (
                <View
                  key={block.id}
                  style={[
                    styles.blockCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: block.is_completed
                        ? "#10B981"
                        : block.is_skipped
                        ? "#EF4444"
                        : colors.border,
                    },
                  ]}
                >
                  <View style={styles.blockTopRow}>
                    <View style={styles.timeTag}>
                      <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                      <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                        {dateFormatted} • {startFormatted} ({block.duration_minutes}m)
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.modeBadge,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text style={[styles.modeBadgeText, { color: colors.primary }]}>
                        {block.study_mode.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.blockTitle,
                      { color: colors.text },
                      block.is_completed && { textDecorationLine: "line-through", color: "#10B981" },
                    ]}
                  >
                    {block.title}
                  </Text>

                  {block.description ? (
                    <Text
                      style={[styles.blockDesc, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {block.description}
                    </Text>
                  ) : null}

                  {/* Actions */}
                  {!block.is_completed && !block.is_skipped ? (
                    <View style={styles.blockActions}>
                      <TouchableOpacity
                        style={[styles.completeAction, { backgroundColor: "#10B981" }]}
                        onPress={() => handleCompleteBlock(block.id)}
                      >
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        <Text style={styles.completeActionText}>
                          {t("planner.markComplete")}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.skipAction, { borderColor: colors.border }]}
                        onPress={() => handleSkipBlock(block.id)}
                      >
                        <Text style={[styles.skipActionText, { color: colors.textSecondary }]}>
                          {t("planner.skipBlock")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.statusDoneRow}>
                      <Ionicons
                        name={block.is_completed ? "checkmark-circle" : "close-circle"}
                        size={16}
                        color={block.is_completed ? "#10B981" : "#EF4444"}
                      />
                      <Text
                        style={[
                          styles.statusDoneText,
                          { color: block.is_completed ? "#10B981" : "#EF4444" },
                        ]}
                      >
                        {block.is_completed ? "Completed & Verified" : "Skipped"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  prefBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  generateBtn: {
    flex: 1,
    flexDirection: "row",
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  generateBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  weekBtn: {
    flexDirection: "row",
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  weekBtnText: { fontSize: 13, fontWeight: "600" },
  kpiContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyCard: { padding: 32, borderRadius: 16, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  blockCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  blockTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeText: { fontSize: 12, fontWeight: "600" },
  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modeBadgeText: { fontSize: 10, fontWeight: "800" },
  blockTitle: { fontSize: 15, fontWeight: "700" },
  blockDesc: { fontSize: 13, lineHeight: 18 },
  blockActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  completeAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  completeActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  skipAction: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  skipActionText: { fontSize: 12, fontWeight: "600" },
  statusDoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusDoneText: { fontSize: 12, fontWeight: "700" },
});


