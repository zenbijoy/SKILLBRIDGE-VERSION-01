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
import { fetchMyBookings, type SessionBooking } from "@/features/growth/growthApi";

export default function BookingsListScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [bookings, setBookings] = useState<SessionBooking[]>([]);
  const [role, setRole] = useState<"all" | "learner" | "tutor">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBookings = useCallback(async () => {
    try {
      const data = await fetchMyBookings(role);
      setBookings(data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookings();
  }, [loadBookings]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBookings();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "completed":
        return "#10B981";
      case "accepted":
        return "#3B82F6";
      case "requested":
        return "#F59E0B";
      case "declined":
      case "cancelled":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("booking.myBookings")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.settingsBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/settings/availability" as any)}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Role Tabs */}
      <View style={styles.tabRow}>
        {(
          [
            { key: "all", label: t("common.seeAll") },
            { key: "learner", label: t("booking.learnerTab") },
            { key: "tutor", label: t("booking.tutorTab") },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabBtn,
              role === tab.key && {
                backgroundColor: colors.primary + "15",
                borderColor: colors.primary,
              },
            ]}
            onPress={() => setRole(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                { color: role === tab.key ? colors.primary : colors.textSecondary },
                role === tab.key && { fontWeight: "700" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
            eyebrow="PEER APPOINTMENTS"
            title={t("booking.myBookings")}
            subtitle="Manage your requested, confirmed, and completed 1:1 tutoring sessions."
            illustration={growthIllustrations512.tutorBooking}
            illustrationSize={135}
          />

          {bookings.length === 0 ? (
            <GrowthEmptyState
              illustration={growthIllustrations512.tutorBooking}
              title="No Bookings Found"
              detail="You have no active tutoring requests or confirmed sessions in this view. Discover tutors to book your first session."
              actionTitle={t("common.search")}
              onAction={() => router.push("/(tabs)/discover" as any)}
            />
          ) : (
            bookings.map((b) => {
              const startDate = new Date(b.start_time);
              const dateStr = startDate.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = startDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const statusColor = getStatusColor(b.status);

              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.bookingCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => router.push(`/bookings/${b.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.timeTag}>
                      <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                      <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                        {dateStr} • {timeStr}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusColor + "15" },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {b.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.bookingTitle, { color: colors.text }]}>
                    {b.skill?.name || "Tutoring Session"}
                  </Text>

                  <View style={styles.cardBottom}>
                    <Text style={[styles.participantText, { color: colors.textSecondary }]}>
                      Tutor: {b.tutor?.full_name || "Tutor"} • Learner:{" "}
                      {b.learner?.full_name || "Learner"}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
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
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: { fontSize: 13, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyCard: { padding: 36, borderRadius: 16, alignItems: "center", gap: 10, marginTop: 30 },
  emptyText: { fontSize: 13, textAlign: "center" },
  bookingCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeText: { fontSize: 12, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800" },
  bookingTitle: { fontSize: 16, fontWeight: "700" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  participantText: { fontSize: 12 },
});


