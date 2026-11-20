import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchBooking,
  updateBookingStatus,
  completeBooking,
  submitBookingReview,
  type SessionBooking,
} from "@/features/growth/growthApi";
import { supabase } from "@/lib/supabase";
import { Button, Row, Screen, triggerHaptic } from "@/components/ui";

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [booking, setBooking] = useState<SessionBooking | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

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
    loadData();
  }, [loadData]);

  const handleStatusChange = async (newStatus: "accepted" | "confirmed" | "declined" | "cancelled") => {
    if (!id) return;
    try {
      setActing(true);
      await updateBookingStatus(id, { status: newStatus });
      triggerHaptic();
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
      triggerHaptic();
      Alert.alert("🎉 Session Completed!", "Reputation points have been credited.");
      loadData();
      if (currentUserId === booking?.learner_id) {
        setShowReviewModal(true);
      }
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to complete booking");
    } finally {
      setActing(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      setSubmittingReview(true);
      const res = await submitBookingReview(id, {
        rating,
        comment: reviewComment.trim() || undefined,
      });
      triggerHaptic();
      setHasReviewed(true);
      setShowReviewModal(false);
      Alert.alert(
        "⭐ Review Submitted!",
        `Thank you for rating your peer tutor. ${res.bonus_points ? `Tutor received +${res.bonus_points} bonus points!` : ""}`,
      );
    } catch (err: any) {
      Alert.alert("Review Failed", err.message || "Unable to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Booking not found</Text>
      </View>
    );
  }

  const isTutor = currentUserId === booking.tutor_id;
  const isLearner = currentUserId === booking.learner_id;
  const peer = isTutor ? booking.learner : booking.tutor;
  const peerId = isTutor ? booking.learner_id : booking.tutor_id;
  const peerName = peer?.full_name || (isTutor ? "Learner" : "Tutor");
  const peerAvatar = peer?.avatar_url || "";

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

  const isLiveActive = booking.status === "accepted" || booking.status === "confirmed";

  const handleJoinVideoCall = () => {
    triggerHaptic();
    if (booking.room_id) {
      router.push(`/live/${booking.room_id}` as any);
    } else {
      const nameParam = encodeURIComponent(peerName);
      const avatarParam = encodeURIComponent(peerAvatar);
      router.push(`/call/${peerId}?type=video&name=${nameParam}&avatar=${avatarParam}` as any);
    }
  };

  const handleJoinAudioCall = () => {
    triggerHaptic();
    const nameParam = encodeURIComponent(peerName);
    const avatarParam = encodeURIComponent(peerAvatar);
    router.push(`/call/${peerId}?type=audio&name=${nameParam}&avatar=${avatarParam}` as any);
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
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
          title={booking.skill?.name || "Peer Tutoring Session"}
          subtitle={`${dateFormatted} at ${timeFormatted} (${booking.duration_minutes} min)`}
          illustration={growthIllustrations512.tutorBooking}
          illustrationSize={125}
        />

        {/* Live Call Bridge Card - Prominent CTA when session is confirmed/accepted */}
        {isLiveActive && (
          <View style={[styles.liveCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Row style={{ alignItems: "center", gap: 10 }}>
              <View style={[styles.livePill, { backgroundColor: "#10B981" }]}>
                <Ionicons name="radio" size={14} color="#FFFFFF" />
                <Text style={styles.livePillText}>READY</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 }}>
                Live 1:1 Session Workspace
              </Text>
            </Row>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
              Connect directly with {peerName} using high-definition video, audio, and collaborative notes.
            </Text>

            <Row style={{ gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.callBtn, { backgroundColor: colors.primary }]}
                onPress={handleJoinVideoCall}
              >
                <Ionicons name="videocam" size={18} color="#FFFFFF" />
                <Text style={styles.callBtnText}>Join Video Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callBtnOutline, { borderColor: colors.border }]}
                onPress={handleJoinAudioCall}
              >
                <Ionicons name="call" size={16} color={colors.text} />
                <Text style={[styles.callBtnOutlineText, { color: colors.text }]}>Audio</Text>
              </TouchableOpacity>
            </Row>
          </View>
        )}

        {/* Details Card */}
        <View
          style={[
            styles.detailsCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Tutor</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {booking.tutor?.full_name || "Tutor"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Learner</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {booking.learner?.full_name || "Learner"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Format</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {booking.mode.toUpperCase()}
            </Text>
          </View>

          {booking.learner_note ? (
            <View style={styles.noteBox}>
              <Text style={[styles.noteLabel, { color: colors.muted }]}>Study Goal / Topic:</Text>
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
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>{t("booking.accept") || "Accept Request"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryAction, { borderColor: "#EF4444" }]}
                onPress={() => handleStatusChange("declined")}
                disabled={acting}
              >
                <Text style={[styles.secondaryActionText, { color: "#EF4444" }]}>
                  {t("booking.decline") || "Decline"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isLiveActive && (
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: "#10B981" }]}
              onPress={handleComplete}
              disabled={acting}
            >
              <Ionicons name="trophy-outline" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>{t("booking.markCompleted") || "Mark Session Completed"}</Text>
            </TouchableOpacity>
          )}

          {/* Review Button for completed sessions */}
          {booking.status === "completed" && isLearner && !hasReviewed && (
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: "#F59E0B" }]}
              onPress={() => setShowReviewModal(true)}
            >
              <Ionicons name="star" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Rate & Review Session</Text>
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
                  {t("booking.cancel") || "Cancel Booking"}
                </Text>
              </TouchableOpacity>
            )}
        </View>

        {/* Review Submission Modal */}
        <Modal
          visible={showReviewModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowReviewModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Rate Your Peer Tutor</Text>
                <TouchableOpacity onPress={() => setShowReviewModal(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </Row>

              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                How was your session with {booking.tutor?.full_name}? Your review helps other students.
              </Text>

              {/* Star Rating Picker */}
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => {
                      triggerHaptic();
                      setRating(s);
                    }}
                    style={styles.starBtn}
                  >
                    <Ionicons
                      name={s <= rating ? "star" : "star-outline"}
                      size={32}
                      color={s <= rating ? "#F59E0B" : colors.border}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.reviewInput,
                  { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                ]}
                placeholder="Share your experience (e.g. clear explanations, patient, prepared)..."
                placeholderTextColor={colors.muted}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
                numberOfLines={3}
              />

              <Row style={{ gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => setShowReviewModal(false)}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Button
                    title={submittingReview ? "Submitting..." : "Submit Review"}
                    variant="primary"
                    disabled={submittingReview}
                    onPress={handleSubmitReview}
                  />
                </View>
              </Row>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  topNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  navTitle: { fontSize: 18, fontWeight: "800" },
  liveCard: { padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  livePillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  callBtn: { flex: 2, height: 44, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  callBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  callBtnOutline: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  callBtnOutlineText: { fontSize: 13, fontWeight: "700" },
  detailsCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 13, fontWeight: "600" },
  detailValue: { fontSize: 14, fontWeight: "700" },
  noteBox: { marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB", gap: 4 },
  noteLabel: { fontSize: 12, fontWeight: "600" },
  noteText: { fontSize: 13, lineHeight: 18 },
  actionSection: { gap: 10, marginTop: 8 },
  actionBtnRow: { flexDirection: "row", gap: 10 },
  primaryAction: { height: 48, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  secondaryAction: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  secondaryActionText: { fontSize: 14, fontWeight: "700" },
  cancelAction: { height: 44, borderRadius: 12, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  cancelActionText: { fontSize: 13, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, padding: 20, borderRadius: 20, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginVertical: 16 },
  starBtn: { padding: 4 },
  reviewInput: { minHeight: 80, borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14 },
});
