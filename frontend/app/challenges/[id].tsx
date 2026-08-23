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
  fetchChallenges,
  claimChallengeReward,
  type Challenge,
} from "@/features/growth/growthApi";

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const all = await fetchChallenges();
      const match = all.find((c) => c.id === id);
      setChallenge(match || null);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleClaim = async () => {
    if (!id) return;
    try {
      setClaiming(true);
      const res = await claimChallengeReward(id);
      Alert.alert("🎉 Reward Claimed!", `You earned +${res.points_awarded} momentum points!`);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to claim reward");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Challenge not found</Text>
      </View>
    );
  }

  const currentCount = challenge.progress?.current_count || 0;
  const targetCount = challenge.target_count || 1;
  const progressPct = Math.min(100, Math.round((currentCount / targetCount) * 100));
  const canClaim = challenge.progress?.status === "completed_unclaimed";
  const isClaimed = challenge.progress?.status === "claimed";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Quest Details</Text>
      </View>

      <GrowthHero
        eyebrow="CAMPUS CHALLENGE"
        title={challenge.title}
        subtitle={`Type: ${challenge.challenge_type.toUpperCase()} • +${challenge.points_reward} Points`}
        illustration={growthIllustrations512.challengesQuests}
        illustrationSize={130}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>Mission Objective</Text>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          {challenge.description}
        </Text>

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

        {canClaim && (
          <TouchableOpacity
            style={[styles.claimBtn, { backgroundColor: "#10B981" }]}
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="gift-outline" size={18} color="#FFFFFF" />
                <Text style={styles.claimBtnText}>{t("challenges.claimReward")}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isClaimed && (
          <View style={styles.claimedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.claimedBadgeText}>{t("challenges.claimed")}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  navTitle: { fontSize: 18, fontWeight: "800" },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardDesc: { fontSize: 14, lineHeight: 20 },
  progressContainer: { gap: 6, marginTop: 4 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 13, fontWeight: "600" },
  progressPercent: { fontSize: 13, fontWeight: "800" },
  progressBarBg: { height: 10, borderRadius: 5, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 5 },
  claimBtn: { height: 48, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 6 },
  claimBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  claimedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, gap: 6 },
  claimedBadgeText: { fontSize: 14, fontWeight: "700", color: "#10B981" },
});
