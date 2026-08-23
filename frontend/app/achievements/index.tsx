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
  fetchAchievements,
  type AchievementDefinition,
} from "@/features/growth/growthApi";

export default function AchievementsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [achievements, setAchievements] = useState<AchievementDefinition[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      const data = await fetchAchievements();
      setAchievements(data.achievements || []);
      setEarnedCount(data.earned_count || 0);
      setTotalPoints(data.total_points_earned || 0);
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

  const filteredAchievements = achievements.filter((a) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "earned") return a.is_earned;
    return a.category === categoryFilter;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("achievements.title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GrowthHero
          eyebrow="VERIFIED CREDENTIALS"
          title={t("achievements.title")}
          subtitle={`${earnedCount} badges earned • ${totalPoints} total reputation points`}
          illustration={growthIllustrations512.verifiedAchievement}
          illustrationSize={130}
        />

        {/* Category Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {["all", "earned", "skill", "goal", "tutoring", "learning", "community"].map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                categoryFilter === cat && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setCategoryFilter(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: categoryFilter === cat ? "#FFFFFF" : colors.textSecondary },
                  categoryFilter === cat && { fontWeight: "700" },
                ]}
              >
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Achievements Grid */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredAchievements.map((ach) => (
              <TouchableOpacity
                key={ach.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: ach.is_earned ? "#10B981" : colors.border,
                  },
                ]}
                onPress={() => router.push(`/achievements/${ach.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: ach.is_earned ? "#10B98115" : colors.bg,
                      },
                    ]}
                  >
                    <Ionicons
                      name={ach.is_earned ? "trophy" : "lock-closed-outline"}
                      size={24}
                      color={ach.is_earned ? "#10B981" : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.pointsBadge}>
                    <Text style={styles.pointsText}>+{ach.points_reward} pts</Text>
                  </View>
                </View>

                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {ach.title}
                </Text>
                <Text
                  style={[styles.cardDesc, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {ach.description}
                </Text>

                {ach.is_earned && ach.earned_details && (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 60 },
  filterScroll: { gap: 8, paddingVertical: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  filterChipText: { fontSize: 11, fontWeight: "600" },
  centerContainer: { paddingVertical: 40, justifyContent: "center", alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "48%",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconCircle: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  pointsBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pointsText: { fontSize: 10, fontWeight: "800", color: "#92400E" },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  cardDesc: { fontSize: 12, lineHeight: 16 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  verifiedText: { fontSize: 11, fontWeight: "700", color: "#10B981" },
});


