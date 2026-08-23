import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchGoal,
  activateGoal,
  completeMilestone,
  deleteGoal,
  type LearningGoal,
} from "@/features/growth/growthApi";

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadGoal = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchGoal(id);
      setGoal(data);
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

  const handleActivate = async () => {
    if (!id) return;
    try {
      setActionInProgress(true);
      await activateGoal(id);
      loadGoal();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to activate goal");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCompleteMilestone = async (milestoneId: string) => {
    if (!id) return;
    try {
      setActionInProgress(true);
      const res = await completeMilestone(id, milestoneId);
      if (res.goal_completed) {
        Alert.alert("🎉 Goal Completed!", "Congratulations! You've completed all milestones and earned momentum points!");
      }
      loadGoal();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to complete milestone");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t("goals.deleteGoal"),
      "Are you sure you want to delete this goal?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("goals.deleteGoal"),
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            try {
              await deleteGoal(id);
              router.replace("/goals" as any);
            } catch (err: any) {
              Alert.alert(t("common.error"), err.message || "Failed to delete goal");
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Goal not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.iconBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.iconBtn, { borderColor: "#EF4444" }]}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <GrowthHero
        eyebrow={goal.status.toUpperCase()}
        title={goal.title}
        subtitle={`${goal.progress_percent}% completed • Target: ${new Date(goal.target_date).toLocaleDateString()}`}
        illustration={growthIllustrations512.learningGoals}
        illustrationSize={125}
      />

      {/* Goal Header Card */}
      <View
        style={[
          styles.mainCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.statusBadge,
              goal.status === "completed"
                ? { backgroundColor: "#10B98120" }
                : goal.status === "active"
                ? { backgroundColor: "#3B82F620" }
                : { backgroundColor: "#6B728020" },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                goal.status === "completed"
                  ? { color: "#10B981" }
                  : goal.status === "active"
                  ? { color: "#3B82F6" }
                  : { color: "#6B7280" },
              ]}
            >
              {t(`goals.${goal.status}`)}
            </Text>
          </View>
          <Text style={[styles.targetDateText, { color: colors.textSecondary }]}>
            Target: {goal.target_date}
          </Text>
        </View>

        <Text style={[styles.goalTitle, { color: colors.text }]}>{goal.title}</Text>

        {goal.description ? (
          <Text style={[styles.goalDescription, { color: colors.textSecondary }]}>
            {goal.description}
          </Text>
        ) : null}

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {t("goals.progress")}
            </Text>
            <Text style={[styles.progressPercent, { color: colors.text }]}>
              {goal.progress_percent}%
            </Text>
          </View>
          <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, goal.progress_percent)}%`,
                  backgroundColor:
                    goal.progress_percent === 100 ? "#10B981" : colors.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* Activate Button if Draft */}
        {goal.status === "draft" && (
          <TouchableOpacity
            style={[styles.activateBtn, { backgroundColor: colors.primary }]}
            onPress={handleActivate}
            disabled={actionInProgress}
          >
            {actionInProgress ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="play" size={16} color="#FFFFFF" />
                <Text style={styles.activateBtnText}>{t("goals.activate")}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Milestones Checklist */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("goals.milestones")}
        </Text>
      </View>

      {(goal.milestones || []).map((m) => (
        <View
          key={m.id}
          style={[
            styles.milestoneCard,
            {
              backgroundColor: colors.surface,
              borderColor: m.is_completed ? "#10B981" : colors.border,
            },
          ]}
        >
          <View style={styles.milestoneMain}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                m.is_completed
                  ? { backgroundColor: "#10B981", borderColor: "#10B981" }
                  : { borderColor: colors.border },
              ]}
              onPress={() => !m.is_completed && handleCompleteMilestone(m.id)}
              disabled={m.is_completed || actionInProgress}
            >
              {m.is_completed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.milestoneTitle,
                  { color: colors.text },
                  m.is_completed && { textDecorationLine: "line-through", color: colors.textSecondary },
                ]}
              >
                {m.title}
              </Text>
              {m.description ? (
                <Text style={[styles.milestoneDesc, { color: colors.textSecondary }]}>
                  {m.description}
                </Text>
              ) : null}
            </View>

            <View style={styles.weightBadge}>
              <Text style={styles.weightBadgeText}>{m.weight}%</Text>
            </View>
          </View>
        </View>
      ))}
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mainCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  targetDateText: {
    fontSize: 12,
    fontWeight: "500",
  },
  goalTitle: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
  },
  goalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  progressSection: {
    gap: 6,
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  activateBtn: {
    flexDirection: "row",
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  activateBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  milestoneCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  milestoneMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  milestoneTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  milestoneDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  weightBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  weightBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
  },
});
