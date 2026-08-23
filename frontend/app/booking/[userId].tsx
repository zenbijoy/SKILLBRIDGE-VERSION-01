import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
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
  fetchTutorAvailability,
  requestBooking,
  type TutorSlot,
} from "@/features/growth/growthApi";

export default function BookTutorScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [slots, setSlots] = useState<TutorSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TutorSlot | null>(null);
  const [sessionMode, setSessionMode] = useState<"online" | "offline" | "hybrid">("online");
  const [learnerNote, setLearnerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadSlots = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchTutorAvailability(userId, undefined, 14);
      setSlots(data);
      if (data.length > 0) setSelectedSlot(data[0] || null);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSlots();
  }, [loadSlots]);

  const handleBookingSubmit = async () => {
    if (!userId || !selectedSlot) {
      Alert.alert(t("common.error"), "Please select a time slot.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await requestBooking({
        tutor_id: userId,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        mode: sessionMode,
        learner_note: learnerNote.trim() || undefined,
      });

      Alert.alert(
        "Booking Requested!",
        "Your session booking request has been sent to the tutor.",
        [
          {
            text: "View My Bookings",
            onPress: () => router.replace(`/bookings/${res.booking_id}` as any),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to submit booking");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("booking.title")}</Text>
      </View>

      <GrowthHero
        eyebrow="PEER TUTORING"
        title="Schedule 1:1 Session"
        subtitle="Select a verified open slot from the tutor's live availability calendar."
        illustration={growthIllustrations512.tutorBooking}
        illustrationSize={125}
      />

      {/* Slots Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("booking.slots")} ({slots.length})
        </Text>

        {slots.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("booking.noSlots")}
            </Text>
          </View>
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map((slot, i) => {
              const isSelected = selectedSlot?.start_time === slot.start_time;
              const dateStr = new Date(slot.start_time).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = new Date(slot.start_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.slotCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                    isSelected && { backgroundColor: colors.primary + "10" },
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text
                    style={[
                      styles.slotDate,
                      { color: isSelected ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {dateStr}
                  </Text>
                  <Text
                    style={[
                      styles.slotTime,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {timeStr}
                  </Text>
                  <Text style={[styles.slotDuration, { color: colors.textSecondary }]}>
                    {slot.duration_minutes} min • {slot.mode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Mode Picker */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("booking.mode")}
        </Text>
        <View style={styles.modesRow}>
          {(["online", "offline", "hybrid"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeChip,
                { borderColor: colors.border },
                sessionMode === m && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setSessionMode(m)}
            >
              <Text
                style={[
                  styles.modeChipText,
                  { color: sessionMode === m ? "#FFFFFF" : colors.text },
                ]}
              >
                {m.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Learner Note */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t("booking.note")}
        </Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={learnerNote}
          onChangeText={setLearnerNote}
          placeholder="What would you like help with during this session?"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitBtn,
          { backgroundColor: selectedSlot ? colors.primary : "#9CA3AF" },
        ]}
        onPress={handleBookingSubmit}
        disabled={submitting || !selectedSlot}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>{t("booking.submit")}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 18, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  emptyCard: { padding: 24, borderRadius: 12, alignItems: "center", gap: 6 },
  emptyText: { fontSize: 13, textAlign: "center" },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slotCard: { width: "48%", padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  slotDate: { fontSize: 11, fontWeight: "600" },
  slotTime: { fontSize: 15, fontWeight: "800" },
  slotDuration: { fontSize: 10, fontWeight: "600" },
  modesRow: { flexDirection: "row", gap: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  modeChipText: { fontSize: 12, fontWeight: "700" },
  textArea: { minHeight: 80, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14 },
  submitBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 10 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
