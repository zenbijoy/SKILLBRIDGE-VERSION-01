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
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchProgressSummary,
  type ProgressSummary,
} from "@/features/growth/growthApi";

export default function ProgressScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchProgressSummary();
      setSummary(data);
    } catch {
      // Fallback
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

  const totalHours = summary ? Math.round((summary.stats.total_learning_minutes / 60) * 10) / 10 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("progress.title")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.activityBtn, { backgroundColor: colors.primary + "15" }]}
          onPress={() => router.push("/activity" as any)}
        >
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[styles.activityBtnText, { color: colors.primary }]}>
            Timeline
          </Text>
        </TouchableOpacity>
      </View>

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
            eyebrow="LEARNING METRICS"
            title={t("progress.title")}
            subtitle={t("progress.subtitle")}
            illustration={growthIllustrations512.progressAnalytics}
            illustrationSize={135}
          />

          {/* Primary Streak & Hours Row */}
          <View style={styles.kpiGrid}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: "#F59E0B" },
              ]}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="flame" size={22} color="#F59E0B" />
                <Text style={styles.kpiBadge}>STREAK</Text>
              </View>
              <Text style={[styles.kpiNumber, { color: colors.text }]}>
                {summary?.stats.current_streak_days || 0}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Consecutive Days
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: "#3B82F6" },
              ]}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="time" size={22} color="#3B82F6" />
                <Text style={styles.kpiBadge}>HOURS</Text>
              </View>
              <Text style={[styles.kpiNumber, { color: colors.text }]}>
                {totalHours}h
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Total Time Studied
              </Text>
            </View>
          </View>

          {/* Secondary Stats Grid */}
          <View style={styles.kpiGrid}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.smallNumber, { color: "#10B981" }]}>
                {summary?.stats.goals_completed || 0}/{summary?.stats.goals_total || 0}
              </Text>
              <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>
                Goals Completed
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.smallNumber, { color: "#8B5CF6" }]}>
                {summary?.stats.sessions_taught || 0}
              </Text>
              <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>
                {t("progress.sessionsTaught")}
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.smallNumber, { color: "#EC4899" }]}>
                {summary?.stats.sessions_attended || 0}
              </Text>
              <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>
                {t("progress.sessionsAttended")}
              </Text>
            </View>
          </View>

          {/* Activity Heatmap Preview */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t("progress.heatmap")}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Daily momentum over the last 28 days
            </Text>

            <View style={styles.heatmapRow}>
              {Array.from({ length: 28 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (27 - i));
                const dateKey = d.toISOString().slice(0, 10);
                const count = summary?.activity_heatmap?.[dateKey] || 0;

                const opacity = count === 0 ? 0.15 : count === 1 ? 0.45 : count === 2 ? 0.75 : 1;

                return (
                  <View
                    key={dateKey}
                    style={[
                      styles.heatSquare,
                      {
                        backgroundColor:
                          count > 0 ? colors.primary : colors.border,
                        opacity: count > 0 ? opacity : 0.5,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
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
  activityBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 },
  activityBtnText: { fontSize: 12, fontWeight: "700" },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  kpiGrid: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, gap: 4 },
  kpiIconRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kpiBadge: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  kpiNumber: { fontSize: 26, fontWeight: "900", marginTop: 4 },
  kpiLabel: { fontSize: 12, fontWeight: "600" },
  smallNumber: { fontSize: 18, fontWeight: "800" },
  smallLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSubtitle: { fontSize: 12 },
  heatmapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  heatSquare: { width: 18, height: 18, borderRadius: 4 },
});


