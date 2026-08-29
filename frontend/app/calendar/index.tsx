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
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { GrowthEmptyState } from "@/components/GrowthEmptyState";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchCalendarAgenda,
  fetchReminders,
  dismissReminder,
  snoozeReminder,
  type AgendaItem,
  type CalendarReminder,
} from "@/features/growth/growthApi";
import { API_URL } from "@/lib/config";

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "booking" | "study_block" | "event" | "room_session">("all");

  const loadData = useCallback(async () => {
    try {
      const [agendaData, reminderData] = await Promise.all([
        fetchCalendarAgenda(),
        fetchReminders(),
      ]);
      setAgenda(agendaData);
      setReminders(reminderData);
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

  const handleExportIcs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert(t("common.error"), "You must be logged in to export.");
        return;
      }

      const exportUrl = `${API_URL}/calendar/export/ics`;

      if (Platform.OS === "web") {
        const res = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to export ICS");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "skillbridge_calendar.ics";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const fileUri = `${FileSystem.documentDirectory}skillbridge_calendar.ics`;
        const { uri, status } = await FileSystem.downloadAsync(exportUrl, fileUri, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (status !== 200) throw new Error("Failed to download ICS file");
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Success", "Calendar file saved to device.");
        }
      }
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Could not export calendar.");
    }
  };

  const handleDismissReminder = async (id: string) => {
    try {
      await dismissReminder(id);
      setReminders(reminders.filter((r) => r.id !== id));
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to dismiss reminder");
    }
  };

  const handleSnoozeReminder = async (id: string) => {
    try {
      await snoozeReminder(id, 15);
      Alert.alert("Snoozed", "Reminder snoozed for 15 minutes.");
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to snooze reminder");
    }
  };

  const filteredAgenda = agenda.filter((it) => {
    if (filter === "all") return true;
    return it.entity_type === filter;
  });

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "booking":
        return "person-circle-outline";
      case "study_block":
        return "book-outline";
      case "event":
        return "megaphone-outline";
      case "room_session":
        return "videocam-outline";
      default:
        return "calendar-outline";
    }
  };

  const getEntityColor = (type: string) => {
    switch (type) {
      case "booking":
        return "#3B82F6";
      case "study_block":
        return "#10B981";
      case "event":
        return "#F59E0B";
      case "room_session":
        return "#8B5CF6";
      default:
        return "#6B7280";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t("calendar.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("calendar.subtitle")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }]}
          onPress={handleExportIcs}
          accessibilityRole="button"
          accessibilityLabel={t("calendar.exportIcs")}
        >
          <Ionicons name="download-outline" size={16} color="#FFFFFF" />
          <Text style={styles.exportBtnText}>.ICS</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(
          [
            { key: "all", label: "All" },
            { key: "booking", label: "Bookings" },
            { key: "study_block", label: "Study" },
            { key: "event", label: "Events" },
            { key: "room_session", label: "Rooms" },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterChip,
              filter === tab.key && {
                backgroundColor: colors.primary + "15",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === tab.key ? colors.primary : colors.textSecondary },
                filter === tab.key && { fontWeight: "700" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reminders banner if any */}
      {reminders.length > 0 && (
        <View style={[styles.remindersBanner, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
          <View style={styles.remindersTop}>
            <Ionicons name="alarm-outline" size={18} color="#D97706" />
            <Text style={styles.remindersTitle}>{t("calendar.reminders")} ({reminders.length})</Text>
          </View>
          {reminders.slice(0, 2).map((r) => (
            <View key={r.id} style={styles.reminderRow}>
              <Text style={styles.reminderText} numberOfLines={1}>
                {r.entity_type.replace(/_/g, " ").toUpperCase()} •{" "}
                {new Date(r.reminder_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <View style={styles.reminderActions}>
                <TouchableOpacity onPress={() => handleSnoozeReminder(r.id)}>
                  <Text style={styles.snoozeText}>{t("calendar.snooze")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDismissReminder(r.id)}>
                  <Ionicons name="close" size={16} color="#B45309" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <GrowthHero
            eyebrow="UNIFIED TIMELINE"
            title={t("calendar.title")}
            subtitle={t("calendar.subtitle")}
            illustration={growthIllustrations512.unifiedCalendar}
            illustrationSize={135}
          />

          {filteredAgenda.length === 0 ? (
            <GrowthEmptyState
              illustration={growthIllustrations512.unifiedCalendar}
              title={t("calendar.noEvents")}
              detail="No scheduled events or study blocks for the selected filter. Book a tutor or generate a study plan to populate your schedule."
              actionTitle={t("planner.generate")}
              onAction={() => router.push("/planner" as any)}
            />
          ) : (
            filteredAgenda.map((item) => {
              const startDate = new Date(item.start_time);
              const dateStr = startDate.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = startDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const typeColor = getEntityColor(item.entity_type);

              return (
                <View
                  key={item.id}
                  style={[
                    styles.agendaCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.agendaTop}>
                    <View style={styles.typeBadge}>
                      <Ionicons
                        name={getEntityIcon(item.entity_type) as any}
                        size={14}
                        color={typeColor}
                      />
                      <Text style={[styles.typeText, { color: typeColor }]}>
                        {item.entity_type.replace(/_/g, " ").toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.agendaDate, { color: colors.textSecondary }]}>
                      {dateStr} • {timeStr}
                    </Text>
                  </View>

                  <Text style={[styles.agendaTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>

                  {item.description ? (
                    <Text
                      style={[styles.agendaDesc, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  ) : null}

                  <View style={styles.agendaBottom}>
                    <View
                      style={[
                        styles.modeChip,
                        { backgroundColor: colors.bg },
                      ]}
                    >
                      <Text style={[styles.modeText, { color: colors.textSecondary }]}>
                        {item.mode.toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusChip,
                        item.status === "completed" || item.status === "confirmed"
                          ? { backgroundColor: "#10B98120" }
                          : { backgroundColor: "#3B82F620" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          item.status === "completed" || item.status === "confirmed"
                            ? { color: "#10B981" }
                            : { color: "#3B82F6" },
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
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
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  exportBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterText: { fontSize: 12, fontWeight: "600" },
  remindersBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  remindersTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  remindersTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  reminderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reminderText: { fontSize: 12, color: "#78350F", flex: 1 },
  reminderActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  snoozeText: { fontSize: 11, fontWeight: "700", color: "#B45309", textDecorationLine: "underline" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyCard: { padding: 36, borderRadius: 16, alignItems: "center", gap: 10, marginTop: 40 },
  emptyText: { fontSize: 13, textAlign: "center" },
  agendaCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  agendaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  typeText: { fontSize: 11, fontWeight: "800" },
  agendaDate: { fontSize: 12, fontWeight: "600" },
  agendaTitle: { fontSize: 15, fontWeight: "700" },
  agendaDesc: { fontSize: 13, lineHeight: 18 },
  agendaBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  modeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  modeText: { fontSize: 10, fontWeight: "700" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800" },
});


