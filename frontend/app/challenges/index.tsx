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
  fetchChallenges,
  claimChallengeReward,
  type Challenge,
} from "@/features/growth/growthApi";

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchChallenges();
      setChallenges(data);
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

  const handleClaim = async (id: string) => {
    try {
      setClaimingId(id);
      const res = await claimChallengeReward(id);
      Alert.alert("🎉 Reward Claimed!", `You earned +${res.points_awarded} momentum points!`);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to claim reward");
    } finally {
      setClaimingId(null);
    }
  };

  const [nowMs] = useState(() => Date.now());

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("challenges.title")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.achievementsBtn, { backgroundColor: colors.primary + "15" }]}
          onPress={() => router.push("/achievements" as any)}
        >
          <Ionicons name="trophy-outline" size={16} color={colors.primary} />
          <Text style={[styles.achievementsBtnText, { color: colors.primary }]}>
            Badges
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GrowthHero
          eyebrow="CAMPUS QUESTS"
          title={t("challenges.title")}
          subtitle={t("challenges.subtitle")}
          illustration={growthIllustrations512.challengesQuests}
          illustrationSize={130}
        />

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : challenges.length === 0 ? (
          <GrowthEmptyState
            illustration={growthIllustrations512.challengesQuests}
            title={t("challenges.noChallenges")}
            detail="New learning challenges and campus quests are posted every Monday. Check back soon!"
            actionTitle={t("goals.create")}
            onAction={() => router.push("/goals/create" as any)}
          />
        ) : (
          <View style={styles.challengesList}>
            {challenges.map((ch) => {
              const currentCount = ch.progress?.current_count || 0;
              const targetCount = ch.target_count || 1;
              const progressPct = Math.min(100, Math.round((currentCount / targetCount) * 100));
              const isClaimed = ch.progress?.status === "claimed";
              const canClaim = ch.progress?.status === "completed_unclaimed";

              const endDate = new Date(ch.end_at);
              const daysLeft = Math.max(
                0,
                Math.ceil((endDate.getTime() - nowMs) / (1000 * 60 * 60 * 24)),
              );

              return (
                <View
                  key={ch.id}
                  style={[
                    styles.challengeCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: canClaim
                        ? "#10B981"
                        : isClaimed
                        ? colors.border
                        : colors.border,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: colors.primary + "15" },
                        ]}
                      >
                        <Text style={[styles.typeText, { color: colors.primary }]}>
                          {ch.challenge_type.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.pointsBadge}>
                        <Ionicons name="sparkles" size={12} color="#F59E0B" />
                        <Text style={styles.pointsText}>+{ch.points_reward} pts</Text>
                      </View>
                    </View>

                    <Text style={[styles.daysLeftText, { color: colors.textSecondary }]}>
                      {daysLeft > 0 ? `${daysLeft}d left` : "Ending soon"}
                    </Text>
                  </View>

                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {ch.title}
                  </Text>
                  <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                    {ch.description}
                  </Text>

                  {/* Progress Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                      <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                        Progress: {currentCount} / {targetCount}
                      </Text>
                      <Text style={[styles.progressPercent, { color: colors.text }]}>
                        {progressPct}%
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.progressBarBg,
                        { backgroundColor: colors.bg },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${progressPct}%`,
                            backgroundColor: canClaim || isClaimed ? "#10B981" : colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Claim Action */}
                  {canClaim ? (
                    <TouchableOpacity
                      style={[styles.claimBtn, { backgroundColor: "#10B981" }]}
                      onPress={() => handleClaim(ch.id)}
                      disabled={claimingId === ch.id}
                    >
                      {claimingId === ch.id ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="gift-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.claimBtnText}>{t("challenges.claimReward")}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : isClaimed ? (
                    <View style={styles.claimedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.claimedBadgeText}>{t("challenges.claimed")}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
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
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  achievementsBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  achievementsBtnText: { fontSize: 12, fontWeight: "700" },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { paddingVertical: 40, justifyContent: "center", alignItems: "center" },
  challengesList: { gap: 12 },
  challengeCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: "800" },
  pointsBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, gap: 3 },
  pointsText: { fontSize: 10, fontWeight: "800", color: "#92400E" },
  daysLeftText: { fontSize: 12, fontWeight: "600" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  progressContainer: { gap: 4, marginTop: 2 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 12, fontWeight: "600" },
  progressPercent: { fontSize: 12, fontWeight: "700" },
  progressBarBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 4 },
  claimBtn: {
    flexDirection: "row",
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  claimBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  claimedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  claimedBadgeText: { fontSize: 13, fontWeight: "700", color: "#10B981" },
});


