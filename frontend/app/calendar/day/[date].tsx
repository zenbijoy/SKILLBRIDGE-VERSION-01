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
import { fetchDayView } from "@/features/growth/growthApi";

export default function DayScheduleScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!date) return;
    try {
      const data = await fetchDayView(date);
      setItems(data.items || []);
      setConflicts(data.conflicts || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

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
          {t("calendar.dayView")} ({date})
        </Text>
      </View>

      <GrowthHero
        eyebrow="DAILY AGENDA"
        title={`Schedule for ${date}`}
        subtitle="Chronological breakdown with real-time overlap conflict detection."
        illustration={growthIllustrations512.unifiedCalendar}
        illustrationSize={120}
        style={{ marginHorizontal: 20, marginTop: 14 }}
      />

      {conflicts.length > 0 && (
        <View style={[styles.conflictBanner, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
          <Ionicons name="warning-outline" size={18} color="#B91C1C" />
          <View style={{ flex: 1 }}>
            <Text style={styles.conflictTitle}>{t("calendar.conflicts")}</Text>
            {conflicts.map((c, i) => (
              <Text key={i} style={styles.conflictText}>
                Overlap between &quot;{c.title_a}&quot; and &quot;{c.title_b}&quot;
              </Text>
            ))}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {items.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("calendar.noEvents")}
              </Text>
            </View>
          ) : (
            items.map((it) => (
              <View
                key={it.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardType, { color: colors.primary }]}>
                    {it.type.toUpperCase()}
                  </Text>
                  <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
                    {new Date(it.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {new Date(it.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{it.title}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  conflictBanner: { flexDirection: "row", padding: 12, margin: 20, borderRadius: 12, borderWidth: 1, gap: 8 },
  conflictTitle: { fontSize: 13, fontWeight: "800", color: "#B91C1C" },
  conflictText: { fontSize: 12, color: "#991B1B", marginTop: 2 },
  scrollContent: { padding: 20, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyCard: { padding: 36, borderRadius: 16, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  cardType: { fontSize: 11, fontWeight: "800" },
  cardTime: { fontSize: 12, fontWeight: "600" },
  cardTitle: { fontSize: 15, fontWeight: "700" },
});
