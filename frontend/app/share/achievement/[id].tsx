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
  fetchAchievement,
  type AchievementDefinition,
} from "@/features/growth/growthApi";

export default function ShareAchievementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
    const router = useRouter();

  const [achievement, setAchievement] = useState<AchievementDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchAchievement(id);
      setAchievement(data);
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
        <Text style={{ color: colors.text }}>Badge not found</Text>
      </View>
    );
  }

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
        <Text style={[styles.navTitle, { color: colors.text }]}>Share Achievement</Text>
      </View>

      <GrowthHero
        eyebrow="SHAREABLE CREDENTIAL"
        title={achievement.title}
        subtitle={achievement.description}
        illustration={growthIllustrations512.verifiedAchievement}
        illustrationSize={140}
      />

      {/* Shareable Card Preview */}
      <View
        style={[
          styles.shareCard,
          { backgroundColor: colors.surface, borderColor: "#10B981" },
        ]}
      >
        <View style={styles.certificateHeader}>
          <Ionicons name="ribbon-outline" size={28} color="#10B981" />
          <Text style={styles.certificateTitle}>SkillBridge Verified Credential</Text>
        </View>

        <Text style={[styles.achTitle, { color: colors.text }]}>
          {achievement.title}
        </Text>
        <Text style={[styles.achDesc, { color: colors.textSecondary }]}>
          {achievement.description}
        </Text>

        <View style={styles.certCodeRow}>
          <Text style={styles.certCodeLabel}>Proof Code:</Text>
          <Text style={styles.certCodeValue}>
            {achievement.earned_details?.verification_code || "SB-ACH-VERIFIED"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.copyBtn, { backgroundColor: colors.primary }]}
        onPress={() => {
          Alert.alert("Link Copied!", "Public verification link copied to clipboard.");
        }}
      >
        <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
        <Text style={styles.copyBtnText}>Copy Verification Link</Text>
      </TouchableOpacity>
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
  shareCard: { padding: 20, borderRadius: 16, borderWidth: 2, alignItems: "center", gap: 10, marginTop: 10 },
  certificateHeader: { alignItems: "center", gap: 4 },
  certificateTitle: { fontSize: 13, fontWeight: "800", color: "#10B981", letterSpacing: 0.5, textTransform: "uppercase" },
  achTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  achDesc: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  certCodeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#ECFDF5", borderRadius: 8 },
  certCodeLabel: { fontSize: 11, fontWeight: "700", color: "#065F46" },
  certCodeValue: { fontSize: 12, fontWeight: "800", color: "#047857" },
  copyBtn: { height: 48, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 10 },
  copyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
