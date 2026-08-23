import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import { verifyCertificate, type VerifiedCertificate } from "@/features/growth/growthApi";

export default function VerifyProofScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [cert, setCert] = useState<VerifiedCertificate | null>(null);
  const [status, setStatus] = useState<"valid" | "revoked" | "not_found" | "loading">("loading");

  const loadVerification = useCallback(async () => {
    if (!code) return;
    try {
      const res = await verifyCertificate(code);
      if (res.verified && res.certificate) {
        setCert(res.certificate);
        setStatus("valid");
      } else if (res.status === "revoked") {
        setStatus("revoked");
      } else {
        setStatus("not_found");
      }
    } catch {
      setStatus("not_found");
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVerification();
  }, [loadVerification]);

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
        <Text style={[styles.navTitle, { color: colors.text }]}>
          Proof Verification
        </Text>
      </View>

      <GrowthHero
        eyebrow="CRYPTOGRAPHIC PROOF"
        title="Certificate Verification"
        subtitle="Verifying cryptographic achievement credential authenticity."
        illustration={growthIllustrations512.verifiedAchievement}
        illustrationSize={130}
      />

      {status === "loading" ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Verifying cryptographic proof...
          </Text>
        </View>
      ) : status === "valid" && cert ? (
        <View
          style={[
            styles.certCard,
            { backgroundColor: colors.surface, borderColor: "#10B981" },
          ]}
        >
          <View style={styles.validHeader}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <Text style={styles.validTitle}>{t("achievements.valid")}</Text>
          </View>

          <Text style={[styles.achTitle, { color: colors.text }]}>
            {cert.achievement.title}
          </Text>
          <Text style={[styles.achDesc, { color: colors.textSecondary }]}>
            {cert.achievement.description}
          </Text>

          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                {t("achievements.recipient")}
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {cert.recipient.full_name} (@{cert.recipient.username})
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                {t("achievements.issueDate")}
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {new Date(cert.issued_at).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                Proof Code
              </Text>
              <Text style={[styles.detailValue, { color: "#10B981", fontWeight: "800" }]}>
                {cert.verification_code}
              </Text>
            </View>
          </View>
        </View>
      ) : status === "revoked" ? (
        <View style={[styles.errorCard, { borderColor: "#EF4444" }]}>
          <Ionicons name="close-circle" size={32} color="#EF4444" />
          <Text style={[styles.errorTitle, { color: "#EF4444" }]}>
            {t("achievements.revoked")}
          </Text>
          <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>
            This certificate has been revoked by campus moderation administrators.
          </Text>
        </View>
      ) : (
        <View style={[styles.errorCard, { borderColor: colors.border }]}>
          <Ionicons name="help-circle-outline" size={32} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Invalid or Unknown Code
          </Text>
          <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>
            No verified achievement certificate was found matching code &quot;{code}&quot;.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { paddingVertical: 40, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 13, fontWeight: "600" },
  topNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  navTitle: { fontSize: 18, fontWeight: "800" },
  certCard: { padding: 20, borderRadius: 16, borderWidth: 2, gap: 12, marginTop: 10 },
  validHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  validTitle: { fontSize: 16, fontWeight: "900", color: "#10B981" },
  achTitle: { fontSize: 20, fontWeight: "900" },
  achDesc: { fontSize: 13, lineHeight: 18 },
  detailsBox: { marginTop: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 12, fontWeight: "600" },
  detailValue: { fontSize: 13, fontWeight: "700" },
  errorCard: { padding: 28, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 8, marginTop: 20 },
  errorTitle: { fontSize: 16, fontWeight: "800" },
  errorDetail: { fontSize: 13, textAlign: "center", lineHeight: 18 },
});
