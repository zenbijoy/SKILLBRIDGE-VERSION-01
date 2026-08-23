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
import { GrowthEmptyState } from "@/components/GrowthEmptyState";
import { growthIllustrations512 } from "@/assets/illustrations";
import { fetchActivityTimeline, type ActivityEvent } from "@/features/growth/growthApi";

export default function ActivityTimelineScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchActivityTimeline(40, 0);
      setEvents(data.events || []);
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

  const getEventIcon = (type: string) => {
    switch (type) {
      case "goal_milestone":
        return "flag";
      case "study_session":
        return "book";
      case "room_join":
        return "chatbubbles";
      case "session_taught":
      case "session_attended":
        return "school";
      case "quiz_completed":
        return "help-circle";
      case "skill_verified":
      case "achievement_earned":
        return "trophy";
      case "challenge_claimed":
        return "gift";
      default:
        return "checkmark-circle";
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "achievement_earned":
      case "challenge_claimed":
        return "#F59E0B";
      case "study_session":
      case "session_taught":
        return "#10B981";
      case "room_join":
        return "#8B5CF6";
      default:
        return "#3B82F6";
    }
  };

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
          {t("progress.activityTimeline")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GrowthHero
          eyebrow="ACTIVITY LOG"
          title={t("progress.activityTimeline")}
          subtitle="Verifiable timeline of your study blocks, milestones, and peer sessions."
          illustration={growthIllustrations512.activityTimeline}
          illustrationSize={130}
        />

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : events.length === 0 ? (
          <GrowthEmptyState
            illustration={growthIllustrations512.activityTimeline}
            title="No Activity Logged Yet"
            detail="Your completed study sessions, goal milestones, and tutoring classes will appear in this timeline."
            actionTitle={t("goals.create")}
            onAction={() => router.push("/goals/create" as any)}
          />
        ) : (
          <View style={styles.timelineList}>
            {events.map((ev, index) => {
              const icon = getEventIcon(ev.event_type);
              const color = getEventColor(ev.event_type);
              const isLast = index === events.length - 1;
              const dateStr = new Date(ev.created_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              });
              const timeStr = new Date(ev.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <View key={ev.id} style={styles.timelineRow}>
                  <View style={styles.lineCol}>
                    <View style={[styles.iconCircle, { backgroundColor: color + "20" }]}>
                      <Ionicons name={icon as any} size={16} color={color} />
                    </View>
                    {!isLast && <View style={[styles.verticalLine, { backgroundColor: colors.border }]} />}
                  </View>

                  <View
                    style={[
                      styles.card,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>
                        {ev.event_title}
                      </Text>
                      <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                        {dateStr} • {timeStr}
                      </Text>
                    </View>
                    <Text style={[styles.eventType, { color }]}>
                      {ev.event_type.replace(/_/g, " ").toUpperCase()}
                    </Text>
                  </View>
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
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { paddingVertical: 40, justifyContent: "center", alignItems: "center" },
  timelineList: { gap: 0 },
  timelineRow: { flexDirection: "row", gap: 12 },
  lineCol: { alignItems: "center", width: 32 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  verticalLine: { width: 2, flex: 1, marginVertical: 4 },
  card: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 },
  eventTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  timeText: { fontSize: 11, fontWeight: "500" },
  eventType: { fontSize: 10, fontWeight: "800", marginTop: 2 },
});


