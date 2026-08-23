import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import { fetchPlannerWeek, type StudyPlanBlock } from "@/features/growth/growthApi";

export default function PlannerWeekScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [blocks, setBlocks] = useState<StudyPlanBlock[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0); // 0=Mon..6=Sun

  const loadData = useCallback(async () => {
    try {
      const data = await fetchPlannerWeek();
      setBlocks(data.blocks || []);
      setBookings(data.bookings || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Compute Monday of current week
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      date: d,
      dateStr: d.toISOString().slice(0, 10),
      dayName: d.toLocaleDateString([], { weekday: "short" }),
      dayNum: d.getDate(),
    };
  });

  const currentDayStr = weekDays[selectedDay]?.dateStr;

  const dayBlocks = blocks.filter(
    (b) => b.start_time.slice(0, 10) === currentDayStr,
  );
  const dayBookings = bookings.filter(
    (b) => b.start_time.slice(0, 10) === currentDayStr,
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("planner.weekView")}
        </Text>
      </View>

      <GrowthHero
        eyebrow="WEEKLY PACING"
        title="7-Day Study Timeline"
        subtitle="Daily distribution of study blocks and peer tutoring commitments."
        illustration={growthIllustrations512.studyPlanner}
        illustrationSize={120}
      />

      {/* Week Day Strip */}
      <View style={styles.dayStrip}>
        {weekDays.map((d, idx) => {
          const isSelected = selectedDay === idx;
          const hasItems =
            blocks.some((b) => b.start_time.slice(0, 10) === d.dateStr) ||
            bookings.some((b) => b.start_time.slice(0, 10) === d.dateStr);

          return (
            <TouchableOpacity
              key={d.dateStr}
              style={[
                styles.dayCell,
                { borderColor: colors.border },
                isSelected && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setSelectedDay(idx)}
            >
              <Text
                style={[
                  styles.dayName,
                  { color: isSelected ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {d.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNum,
                  { color: isSelected ? "#FFFFFF" : colors.text },
                ]}
              >
                {d.dayNum}
              </Text>
              {hasItems && (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isSelected ? "#FFFFFF" : colors.primary },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.dayHeaderTitle, { color: colors.text }]}>
            {weekDays[selectedDay]?.dayName},{" "}
            {weekDays[selectedDay]?.date.toLocaleDateString([], {
              month: "long",
              day: "numeric",
            })}
          </Text>

          {dayBlocks.length === 0 && dayBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No scheduled sessions on this day.
              </Text>
            </View>
          ) : null}

          {/* Bookings on this day */}
          {dayBookings.map((b) => (
            <View
              key={b.id}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: "#3B82F6" },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTag, { color: "#3B82F6" }]}>TUTORING SESSION</Text>
                <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
                  {new Date(b.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {b.skill?.name || "Session with " + (b.tutor?.full_name || "Tutor")}
              </Text>
            </View>
          ))}

          {/* Study blocks on this day */}
          {dayBlocks.map((b) => (
            <View
              key={b.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: b.is_completed ? "#10B981" : colors.border,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text
                  style={[
                    styles.cardTag,
                    { color: b.is_completed ? "#10B981" : colors.primary },
                  ]}
                >
                  {b.is_completed ? "COMPLETED STUDY" : "STUDY SESSION"}
                </Text>
                <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
                  {new Date(b.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ({b.duration_minutes}m)
                </Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{b.title}</Text>
              {b.description ? (
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                  {b.description}
                </Text>
              ) : null}
            </View>
          ))}
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
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  dayStrip: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  dayCell: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  dayName: { fontSize: 11, fontWeight: "600" },
  dayNum: { fontSize: 15, fontWeight: "800" },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  dayHeaderTitle: { fontSize: 16, fontWeight: "800", marginTop: 6, marginBottom: 4 },
  emptyCard: { padding: 32, borderRadius: 16, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTag: { fontSize: 10, fontWeight: "800" },
  cardTime: { fontSize: 12, fontWeight: "600" },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
});


