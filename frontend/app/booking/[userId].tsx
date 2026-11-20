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
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchTutorAvailability,
  requestBooking,
  type TutorSlot,
} from "@/features/growth/growthApi";
import { api } from "@/lib/api";
import { Row, Screen, triggerHaptic } from "@/components/ui";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

const COMMON_HOURS = [
  { label: "10:00 AM", hour: 10 },
  { label: "12:00 PM", hour: 12 },
  { label: "02:00 PM", hour: 14 },
  { label: "04:00 PM", hour: 16 },
  { label: "06:00 PM", hour: 18 },
  { label: "08:00 PM", hour: 20 },
];

export default function BookTutorScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();

  const [tutorProfile, setTutorProfile] = useState<any>(null);
  const [slots, setSlots] = useState<TutorSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TutorSlot | null>(null);
  const [bookingType, setBookingType] = useState<"slot" | "custom">("slot");
  const [sessionMode, setSessionMode] = useState<"online" | "offline" | "hybrid">("online");
  const [learnerNote, setLearnerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Custom proposal state
  const [customDaysAhead, setCustomDaysAhead] = useState(1); // 1 = Tomorrow
  const [customHour, setCustomHour] = useState(16); // 4 PM default
  const [customDuration, setCustomDuration] = useState(60);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [availData, profData] = await Promise.all([
        fetchTutorAvailability(userId, undefined, 14).catch(() => ({ slots: [] })),
        api<any>(`/profiles/${userId}`).catch(() => null),
      ]);

      const resolvedSlots = Array.isArray(availData) ? availData : (availData?.slots ?? []);
      setSlots(resolvedSlots);
      if (resolvedSlots.length > 0) {
        setSelectedSlot(resolvedSlots[0]);
        setBookingType("slot");
      } else {
        setBookingType("custom");
      }

      if (profData?.profile) {
        setTutorProfile(profData.profile);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBookingSubmit = async () => {
    if (!userId) {
      Alert.alert(t("common.error"), "Invalid tutor reference.");
      return;
    }

    let startTime: string;
    let endTime: string;

    if (bookingType === "slot") {
      if (!selectedSlot) {
        Alert.alert(t("common.error"), "Please select a time slot or propose a custom time.");
        return;
      }
      startTime = selectedSlot.start_time;
      endTime = selectedSlot.end_time;
    } else {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + customDaysAhead);
      targetDate.setHours(customHour, 0, 0, 0);
      const endDate = new Date(targetDate.getTime() + customDuration * 60 * 1000);
      startTime = targetDate.toISOString();
      endTime = endDate.toISOString();
    }

    try {
      setSubmitting(true);
      const res = await requestBooking({
        tutor_id: userId,
        start_time: startTime,
        end_time: endTime,
        mode: sessionMode,
        learner_note: learnerNote.trim() || undefined,
        is_custom_proposal: bookingType === "custom",
      });

      Alert.alert(
        "Booking Requested! 📅",
        bookingType === "custom"
          ? "Your custom time proposal has been sent to the tutor for confirmation."
          : "Your session booking request has been sent to the tutor.",
        [
          {
            text: "View My Sessions",
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
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isSubmitDisabled = submitting || (bookingType === "slot" && !selectedSlot);

  return (
    <Screen scroll={false}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 60 + (keyboardHeight > 0 ? keyboardHeight : 20) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t("booking.title") || "Book Peer Session"}</Text>
        </View>

        {/* Tutor Mini Card */}
        {tutorProfile && (
          <View style={[styles.tutorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ alignItems: "center", gap: 12 }}>
              <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                {tutorProfile.avatar_url ? (
                  <Image source={{ uri: tutorProfile.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>
                    {tutorProfile.full_name?.[0] || "T"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }} numberOfLines={1}>
                  {tutorProfile.full_name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                  {[tutorProfile.department, tutorProfile.university].filter(Boolean).join(" • ") || "Peer Tutor"}
                </Text>
              </View>
            </Row>
          </View>
        )}

        <GrowthHero
          eyebrow="1:1 PEER LEARNING"
          title="Schedule Session"
          subtitle="Choose an open slot or propose a custom time that fits your study schedule."
          illustration={growthIllustrations512.tutorBooking}
          illustrationSize={120}
        />

        {/* Schedule Mode Selector: Open Slots vs Custom Time */}
        <View style={[styles.scheduleTypeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.scheduleTypeBtn,
              bookingType === "slot" && { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              triggerHaptic();
              setBookingType("slot");
            }}
          >
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={16}
                color={bookingType === "slot" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.scheduleTypeText,
                  { color: bookingType === "slot" ? "#FFFFFF" : colors.text },
                ]}
              >
                Open Slots ({slots.length})
              </Text>
            </Row>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scheduleTypeBtn,
              bookingType === "custom" && { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              triggerHaptic();
              setBookingType("custom");
            }}
          >
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons
                name="clock-edit-outline"
                size={16}
                color={bookingType === "custom" ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.scheduleTypeText,
                  { color: bookingType === "custom" ? "#FFFFFF" : colors.text },
                ]}
              >
                Propose Time
              </Text>
            </Row>
          </TouchableOpacity>
        </View>

        {/* Schedule Content */}
        {bookingType === "slot" ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("booking.slots") || "Available Slots"}
            </Text>

            {slots.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No preset slots right now. Switch to &ldquo;Propose Time&rdquo; to suggest a meeting!
                </Text>
                <TouchableOpacity
                  style={[styles.switchCustomBtn, { backgroundColor: colors.primarySoft }]}
                  onPress={() => setBookingType("custom")}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
                    Propose Custom Time ⏱️
                  </Text>
                </TouchableOpacity>
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
                        isSelected && { backgroundColor: colors.primarySoft },
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
        ) : (
          /* Custom Proposal Section */
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>When would you like to meet?</Text>

            {/* Day Selector */}
            <View style={styles.daysRow}>
              {[
                { label: "Today", days: 0 },
                { label: "Tomorrow", days: 1 },
                { label: "+2 Days", days: 2 },
                { label: "+3 Days", days: 3 },
              ].map((d) => (
                <TouchableOpacity
                  key={d.days}
                  style={[
                    styles.dayChip,
                    { borderColor: colors.border },
                    customDaysAhead === d.days && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setCustomDaysAhead(d.days)}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      { color: customDaysAhead === d.days ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hour Selector */}
            <Text style={[styles.subLabel, { color: colors.muted, marginTop: 8 }]}>Preferred Time</Text>
            <View style={styles.hoursGrid}>
              {COMMON_HOURS.map((h) => (
                <TouchableOpacity
                  key={h.hour}
                  style={[
                    styles.hourChip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    customHour === h.hour && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setCustomHour(h.hour)}
                >
                  <Text
                    style={[
                      styles.hourChipText,
                      { color: customHour === h.hour ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {h.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Duration Selector */}
            <Text style={[styles.subLabel, { color: colors.muted, marginTop: 8 }]}>Duration</Text>
            <View style={styles.durationRow}>
              {[30, 45, 60, 90].map((dur) => (
                <TouchableOpacity
                  key={dur}
                  style={[
                    styles.durationChip,
                    { borderColor: colors.border },
                    customDuration === dur && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setCustomDuration(dur)}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      { color: customDuration === dur ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {dur} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Mode Picker */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("booking.mode") || "Session Format"}
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
            {t("booking.note") || "Topic & Study Goals"}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
            value={learnerNote}
            onChangeText={setLearnerNote}
            placeholder="e.g. Need help reviewing binary search trees and recursion for tomorrow's midterm."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: !isSubmitDisabled ? colors.primary : "#9CA3AF" },
          ]}
          onPress={handleBookingSubmit}
          disabled={isSubmitDisabled}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {bookingType === "custom" ? "Propose Session Time" : (t("booking.submit") || "Confirm Request")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 18, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  tutorCard: { padding: 12, borderRadius: 12, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  scheduleTypeRow: { flexDirection: "row", padding: 4, borderRadius: 12, borderWidth: 1, gap: 6 },
  scheduleTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  scheduleTypeText: { fontSize: 13, fontWeight: "700" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  subLabel: { fontSize: 12, fontWeight: "600" },
  emptyCard: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  switchCustomBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginTop: 4 },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slotCard: { width: "48%", padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  slotDate: { fontSize: 11, fontWeight: "600" },
  slotTime: { fontSize: 15, fontWeight: "800" },
  slotDuration: { fontSize: 10, fontWeight: "600" },
  daysRow: { flexDirection: "row", gap: 8 },
  dayChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  dayChipText: { fontSize: 12, fontWeight: "700" },
  hoursGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hourChip: { width: "31%", paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  hourChipText: { fontSize: 12, fontWeight: "700" },
  durationRow: { flexDirection: "row", gap: 8 },
  durationChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  durationChipText: { fontSize: 12, fontWeight: "700" },
  modesRow: { flexDirection: "row", gap: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  modeChipText: { fontSize: 12, fontWeight: "700" },
  textArea: { minHeight: 80, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14 },
  submitBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 10 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
