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
import { fetchSkillProgress } from "@/features/growth/growthApi";

export default function SkillProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
    const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchSkillProgress(id);
      setData(res);
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

  const skill = data?.skill;
  const goals = data?.goals || [];
  const bookings = data?.bookings || [];

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
        <Text style={[styles.navTitle, { color: colors.text }]}>Skill Progress</Text>
      </View>

      <GrowthHero
        eyebrow="SKILL MASTERY"
        title={skill?.name || "Skill Breakdown"}
        subtitle={`Category: ${skill?.category || "General"} • ${data?.total_minutes_studied || 0} minutes dedicated`}
        illustration={growthIllustrations512.progressAnalytics}
        illustrationSize={130}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Linked Goals ({goals.length})
        </Text>
        {goals.map((g: any) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.goalRow, { borderBottomColor: colors.border }]}
            onPress={() => router.push(`/goals/${g.id}` as any)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.goalTitle, { color: colors.text }]}>{g.title}</Text>
              <Text style={[styles.goalProgress, { color: colors.primary }]}>
                {g.progress_percent}% completed ({g.status})
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Sessions ({bookings.length})
        </Text>
        {bookings.map((b: any) => (
          <View key={b.id} style={styles.bookingRow}>
            <Text style={[styles.bookingText, { color: colors.text }]}>
              {new Date(b.start_time).toLocaleDateString()} • {b.duration_minutes}m ({b.status})
            </Text>
          </View>
        ))}
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
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  goalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  goalTitle: { fontSize: 14, fontWeight: "700" },
  goalProgress: { fontSize: 12, marginTop: 2 },
  bookingRow: { paddingVertical: 6 },
  bookingText: { fontSize: 13, fontWeight: "600" },
});
