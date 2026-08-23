import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { GrowthEmptyState } from "@/components/GrowthEmptyState";
import { growthIllustrations512 } from "@/assets/illustrations";
import { fetchGoals, type LearningGoal } from "@/features/growth/growthApi";

export default function GoalsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "completed">("active");

  const loadGoals = useCallback(async () => {
    try {
      const data = await fetchGoals();
      setGoals(data);
    } catch {
      // Handled by UI fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGoals();
  }, [loadGoals]);

  const onRefresh = () => {
    setRefreshing(true);
    loadGoals();
  };

  const filteredGoals = goals.filter((g) => {
    if (filter === "all") return true;
    return g.status === filter;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "#EF4444";
      case "high":
        return "#F59E0B";
      case "medium":
        return "#3B82F6";
      default:
        return "#6B7280";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>{t("goals.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("goals.subtitle")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/goals/create" as any)}
          accessibilityRole="button"
          accessibilityLabel={t("goals.create")}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.createButtonText}>{t("goals.create")}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        {(["active", "draft", "completed", "all"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              filter === tab && {
                backgroundColor: colors.primary + "15",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setFilter(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: filter === tab ? colors.primary : colors.textSecondary },
                filter === tab && { fontWeight: "700" },
              ]}
            >
              {tab === "all" ? t("common.seeAll") : t(`goals.${tab}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
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
            eyebrow="LEARNING OBJECTIVES"
            title={t("goals.title")}
            subtitle={t("goals.subtitle")}
            illustration={growthIllustrations512.learningGoals}
            illustrationSize={135}
          />

          {filteredGoals.length === 0 ? (
            <GrowthEmptyState
              illustration={growthIllustrations512.learningGoals}
              title={t("goals.noGoals")}
              detail="Set clear, weighted milestones and track your skill growth with verified proofs."
              actionTitle={t("goals.create")}
              onAction={() => router.push("/goals/create" as any)}
            />
          ) : (
            filteredGoals.map((goal) => (
              <TouchableOpacity
                key={goal.id}
                style={[
                  styles.goalCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => router.push(`/goals/${goal.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.goalCardHeader}>
                  <View style={styles.goalTitleRow}>
                    <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(goal.priority) + "20" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          { color: getPriorityColor(goal.priority) },
                        ]}
                      >
                        {goal.priority.toUpperCase()}
                      </Text>
                    </View>
                  </View>
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
                </View>

                {goal.description ? (
                  <Text
                    style={[styles.goalDescription, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {goal.description}
                  </Text>
                ) : null}

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
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

                {/* Meta details */}
                <View style={styles.goalMetaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {goal.target_date}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {goal.weekly_target_minutes} min/wk
                    </Text>
                  </View>
                  {goal.skill ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="school-outline" size={14} color={colors.primary} />
                      <Text style={[styles.metaText, { color: colors.primary }]}>
                        {goal.skill.name}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    maxWidth: 240,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyAction: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  goalCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  goalDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressContainer: {
    gap: 6,
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  goalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
});


