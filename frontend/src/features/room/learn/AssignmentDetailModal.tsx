import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Card, Pill, Row, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import type { RoomAssignment } from "@/types";

interface AssignmentDetailModalProps {
  visible: boolean;
  assignment: RoomAssignment | null;
  onClose: () => void;
  onOpenSubmit: () => void;
}

export function AssignmentDetailModal({
  visible,
  assignment,
  onClose,
  onOpenSubmit,
}: AssignmentDetailModalProps) {
  const { colors } = useTheme();

  if (!assignment) return null;

  const mySub = assignment.mySubmission;
  const isSubmitted = Boolean(mySub);
  const isGraded = mySub?.status === "graded";
  const isPastDue = new Date() > new Date(assignment.due_date);

  const handleOpenReference = async () => {
    if (!assignment.attachment_url) return;
    try {
      triggerHaptic("selection");
      await Linking.openURL(assignment.attachment_url);
    } catch {
      Alert.alert("Cannot open link", assignment.attachment_url);
    }
  };

  const handleOpenSubmittedFile = async () => {
    if (!mySub?.file_url) return;
    try {
      triggerHaptic("selection");
      await Linking.openURL(mySub.file_url);
    } catch {
      Alert.alert("Cannot open file", mySub.file_url);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.headerRow}>
            <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
              <MaterialCommunityIcons name="book-open-variant" size={22} color={colors.primary} />
              <Text numberOfLines={1} style={[s.modalTitle, { color: colors.text }]}>
                Assignment Details
              </Text>
            </Row>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>
            {/* Title & Metadata Card */}
            <View style={[s.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.assignmentTitle, { color: colors.text }]}>{assignment.title}</Text>
              
              <Row style={{ alignItems: "center", gap: 12, marginTop: 8 }}>
                <View style={[s.pointPill, { backgroundColor: `${colors.primary}15` }]}>
                  <Text style={[s.pointText, { color: colors.primary }]}>
                    {assignment.total_points} Total Points
                  </Text>
                </View>

                <Row style={{ alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color={isPastDue ? "#EF4444" : colors.muted} />
                  <Text style={[s.dateText, { color: isPastDue ? "#EF4444" : colors.muted }]}>
                    {isPastDue ? "Due Date Passed" : `Due ${new Date(assignment.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </Text>
                </Row>
              </Row>
            </View>

            {/* Description / Instructions */}
            {Boolean(assignment.description) && (
              <View>
                <Text style={[s.sectionTitle, { color: colors.muted }]}>INSTRUCTIONS</Text>
                <Text style={[s.descText, { color: colors.text }]}>{assignment.description}</Text>
              </View>
            )}

            {/* Reference Attachment (if teacher attached) */}
            {Boolean(assignment.attachment_url) && (
              <Pressable
                onPress={handleOpenReference}
                style={[s.refCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons name="file-pdf-box" size={24} color="#DC2626" />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.refTitle, { color: colors.text }]}>
                        Question Sheet / Reference Material
                      </Text>
                      <Text style={[s.refSub, { color: colors.muted }]}>Cloudflare R2 Stored Document</Text>
                    </View>
                  </Row>
                  <MaterialCommunityIcons name="open-in-new" size={18} color={colors.primary} />
                </Row>
              </Pressable>
            )}

            {/* Student's Submission Status */}
            <View>
              <Text style={[s.sectionTitle, { color: colors.muted }]}>YOUR SUBMISSION</Text>
              {isGraded ? (
                /* Graded Banner & Feedback */
                <Card style={[s.gradeResultCard, { borderColor: "#10B981" }]}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="check-decagram" size={24} color="#10B981" />
                      <Text style={[s.gradeScoreText, { color: colors.text }]}>
                        Score: {mySub?.grade} / {assignment.total_points}
                      </Text>
                    </Row>
                    <View style={[s.statusBadge, { backgroundColor: "#10B98120" }]}>
                      <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>GRADED</Text>
                    </View>
                  </Row>

                  {Boolean(mySub?.feedback) && (
                    <View style={[s.feedbackBox, { backgroundColor: colors.surface }]}>
                      <Text style={[s.feedbackLabel, { color: colors.muted }]}>Teacher Feedback:</Text>
                      <Text style={[s.feedbackContent, { color: colors.text }]}>
                        {mySub?.feedback}
                      </Text>
                    </View>
                  )}

                  <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                    <Text numberOfLines={1} style={[s.submittedFileName, { color: colors.muted }]}>
                      📎 {mySub?.file_name || "homework.pdf"}
                    </Text>
                    <Pressable onPress={handleOpenSubmittedFile}>
                      <Text style={[s.viewFileLink, { color: colors.primary }]}>View File</Text>
                    </Pressable>
                  </Row>
                </Card>
              ) : isSubmitted ? (
                /* Submitted (Pending Grade) */
                <Card style={s.submittedCard}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                      <Text style={[s.submittedTitle, { color: colors.text }]}>
                        Submitted for Review
                      </Text>
                    </Row>
                    <View style={[s.statusBadge, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>PENDING</Text>
                    </View>
                  </Row>

                  <Text style={[s.submitDateText, { color: colors.muted }]}>
                    Submitted {new Date(mySub!.submitted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>

                  {Boolean(mySub?.student_notes) && (
                    <Text style={[s.subNotes, { color: colors.text, backgroundColor: colors.surface }]}>
                      "{mySub?.student_notes}"
                    </Text>
                  )}

                  <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <Pressable onPress={handleOpenSubmittedFile} style={[s.viewBtn, { borderColor: colors.border }]}>
                      <MaterialCommunityIcons name="file-pdf-box" size={16} color="#DC2626" />
                      <Text style={[s.viewBtnText, { color: colors.text }]}>View Submitted File</Text>
                    </Pressable>

                    {assignment.status !== "closed" && (
                      <Pressable
                        onPress={() => {
                          onClose();
                          onOpenSubmit();
                        }}
                        style={[s.resubmitBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Text style={[s.resubmitText, { color: colors.primary }]}>Resubmit</Text>
                      </Pressable>
                    )}
                  </Row>
                </Card>
              ) : (
                /* Not Submitted Yet */
                <Card style={s.notSubmittedCard}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#F59E0B" />
                  <Text style={[s.notSubTitle, { color: colors.text }]}>You haven't submitted this assignment yet</Text>
                  <Text style={[s.notSubDesc, { color: colors.muted }]}>
                    Complete your work and upload a PDF or clear scanned photos before the deadline.
                  </Text>
                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenSubmit();
                    }}
                    style={[s.submitActionBtn, { backgroundColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="upload" size={16} color="#FFFFFF" />
                    <Text style={s.submitActionText}>Submit Homework Now</Text>
                  </Pressable>
                </Card>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    maxHeight: "88%",
  },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  metaCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
  },
  assignmentTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  pointPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pointText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
  },
  refCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  refTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  refSub: {
    fontSize: 11,
    marginTop: 1,
  },
  gradeResultCard: {
    padding: 14,
    borderWidth: 1.5,
    borderRadius: radius.md,
  },
  gradeScoreText: {
    fontSize: 16,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  feedbackBox: {
    padding: 10,
    borderRadius: radius.sm,
    marginTop: 10,
  },
  feedbackLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  feedbackContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  submittedFileName: {
    fontSize: 12,
    flex: 1,
  },
  viewFileLink: {
    fontSize: 12,
    fontWeight: "700",
  },
  submittedCard: {
    padding: 14,
    borderRadius: radius.md,
  },
  submittedTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  submitDateText: {
    fontSize: 11,
    marginTop: 4,
  },
  subNotes: {
    fontSize: 12,
    fontStyle: "italic",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 8,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  resubmitBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  resubmitText: {
    fontSize: 12,
    fontWeight: "700",
  },
  notSubmittedCard: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  notSubTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  notSubDesc: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  submitActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  submitActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
