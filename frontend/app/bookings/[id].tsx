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
  fetchBooking,
  updateBookingStatus,
  completeBooking,
  type SessionBooking,
} from "@/features/growth/growthApi";
import { supabase } from "@/lib/supabase";

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [booking, setBooking] = useState<SessionBooking | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const b = await fetchBooking(id);
      setBooking(b);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to load booking");
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleStatusChange = async (newStatus: "accepted" | "confirmed" | "declined" | "cancelled") => {
    if (!id) return;
    try {
      setActing(true);
      await updateBookingStatus(id, { status: newStatus });
      Alert.alert("Status Updated", `Booking is now ${newStatus}`);
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to update booking");
    } finally {
      setActing(false);
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    try {
      setActing(true);
      await completeBooking(id);
      Alert.alert("🎉 Session Completed!", "Points have been credited to both tutor and learner.");
      loadData();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to complete booking");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Booking not found</Text>
      </View>
    );
  }

  const isTutor = currentUserId === booking.tutor_id;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isLearner = currentUserId === booking.learner_id;

  const startDate = new Date(booking.start_time);
  const dateFormatted = startDate.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeFormatted = startDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

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
        <Text style={[styles.navTitle, { color: colors.text }]}>Booking Details</Text>
      </View>

      {/* Hero */}
      <GrowthHero
        eyebrow={booking.status.toUpperCase()}
        title={booking.skill?.name || "Tutoring Session"}
        subtitle={`${dateFormatted} at ${timeFormatted} (${booking.duration_minutes} min)`}
        illustration={growthIllustrations512.tutorBooking}
        illustrationSize={130}
      />

      {/* Details Card */}
      <View
        style={[
          styles.detailsCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Tutor</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {booking.tutor?.full_name || "Tutor"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Learner</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {booking.learner?.full_name || "Learner"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Mode</Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {booking.mode.toUpperCase()}
          </Text>
        </View>

        {booking.learner_note ? (
          <View style={styles.noteBox}>
            <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>Learner Note:</Text>
            <Text style={[styles.noteText, { color: colors.text }]}>{booking.learner_note}</Text>
          </View>
        ) : null}
      </View>

      {/* Action Controls based on role & status */}
      <View style={styles.actionSection}>
        {isTutor && booking.status === "requested" && (
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: "#10B981" }]}
              onPress={() => handleStatusChange("accepted")}
              disabled={acting}
            >
              <Text style={styles.actionText}>{t("booking.accept")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryAction, { borderColor: "#EF4444" }]}
              onPress={() => handleStatusChange("declined")}
              disabled={acting}
            >
              <Text style={[styles.secondaryActionText, { color: "#EF4444" }]}>
                {t("booking.decline")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(booking.status === "accepted" || booking.status === "confirmed") && (
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: "#10B981" }]}
            onPress={handleComplete}
            disabled={acting}
          >
            <Ionicons name="trophy-outline" size={18} color="#FFFFFF" />
            <Text style={styles.actionText}>{t("booking.markCompleted")}</Text>
          </TouchableOpacity>
        )}

        {booking.status !== "completed" &&
          booking.status !== "cancelled" &&
          booking.status !== "declined" && (
            <TouchableOpacity
              style={[styles.cancelAction, { borderColor: colors.border }]}
              onPress={() => handleStatusChange("cancelled")}
              disabled={acting}
            >
              <Text style={[styles.cancelActionText, { color: "#EF4444" }]}>
                {t("booking.cancel")}
              </Text>
            </TouchableOpacity>
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
  detailsCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 13, fontWeight: "600" },
  detailValue: { fontSize: 14, fontWeight: "700" },
  noteBox: { marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", gap: 4 },
  noteLabel: { fontSize: 12, fontWeight: "600" },
  noteText: { fontSize: 13, lineHeight: 18 },
  actionSection: { gap: 10, marginTop: 8 },
  actionBtnRow: { flexDirection: "row", gap: 10 },
  primaryAction: { flex: 1, height: 48, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  secondaryAction: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  secondaryActionText: { fontSize: 14, fontWeight: "700" },
  cancelAction: { height: 44, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  cancelActionText: { fontSize: 13, fontWeight: "700" },
});
