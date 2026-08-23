import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchAchievement,
  toggleAchievementVisibility,
  type AchievementDefinition,
} from "@/features/growth/growthApi";

export default function AchievementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [achievement, setAchievement] = useState<AchievementDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchAchievement(id);
      setAchievement(data);
      if (data.earned_details) {
        setIsPublic(data.earned_details.is_public ?? true);
      }
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

  const handleToggleVisibility = async (val: boolean) => {
    if (!id) return;
    setIsPublic(val);
    try {
      await toggleAchievementVisibility(id, val);
    } catch {
      setIsPublic(!val);
      Alert.alert(t("common.error"), "Failed to update visibility");
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!achievement) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Achievement not found</Text>
      </View>
    );
  }

  const isEarned = achievement.is_earned;
  const earnedDetails = achievement.earned_details;

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
        <Text style={[styles.navTitle, { color: colors.text }]}>Badge Credential</Text>
      </View>

      <GrowthHero
        eyebrow={isEarned ? "VERIFIED ACHIEVEMENT" : "BADGE CATALOG"}
        title={achievement.title}
        subtitle={`Category: ${achievement.category.toUpperCase()} • +${achievement.points_reward} Points`}
        illustration={growthIllustrations512.verifiedAchievement}
        illustrationSize={130}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
        <Text style={[styles.value, { color: colors.text }]}>{achievement.description}</Text>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 8 }]}>
          Criteria
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {achievement.criteria_description}
        </Text>

        {isEarned && earnedDetails && (
          <View style={styles.proofSection}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Verification Code
            </Text>
            <View
              style={[
                styles.codeBox,
                { backgroundColor: colors.bg, borderColor: "#10B981" },
              ]}
            >
              <Ionicons name="shield-checkmark" size={16} color="#10B981" />
              <Text style={styles.codeText}>{earnedDetails.verification_code}</Text>
            </View>
            <Text style={[styles.issueDateText, { color: colors.textSecondary }]}>
              Issued on: {new Date(earnedDetails.issued_at).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>

      {/* Visibility Toggle if Earned */}
      {isEarned && (
        <View
          style={[
            styles.switchCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: colors.text }]}>
              {t("achievements.publicToggle")}
            </Text>
            <Text style={[styles.switchSubtitle, { color: colors.textSecondary }]}>
              Allow others to view and verify this badge on your public profile.
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={handleToggleVisibility}
            trackColor={{ false: "#E5E7EB", true: colors.primary }}
          />
        </View>
      )}

      {/* Share / Verify Actions */}
      {isEarned && earnedDetails && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/share/achievement/${id}` as any)}
          >
            <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>{t("achievements.shareProof")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.verifyBtn, { borderColor: colors.border }]}
            onPress={() => router.push(`/verify/${earnedDetails.verification_code}` as any)}
          >
            <Ionicons name="checkmark-done" size={18} color={colors.text} />
            <Text style={[styles.verifyBtnText, { color: colors.text }]}>
              {t("achievements.verifyProof")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 6 },
  label: { fontSize: 12, fontWeight: "600" },
  value: { fontSize: 14, lineHeight: 20 },
  proofSection: { marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", gap: 6 },
  codeBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, borderWidth: 1, gap: 8 },
  codeText: { fontSize: 13, fontWeight: "800", color: "#10B981" },
  issueDateText: { fontSize: 11 },
  switchCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  switchTitle: { fontSize: 14, fontWeight: "700" },
  switchSubtitle: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  actionRow: { gap: 10, marginTop: 6 },
  shareBtn: { height: 48, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  shareBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  verifyBtn: { height: 48, borderRadius: 12, borderWidth: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  verifyBtnText: { fontSize: 14, fontWeight: "700" },
});
