import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Pill, Row, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import type { RoomAssignment, RoomAssignmentSubmission } from "@/types";

interface TeacherGradingModalProps {
  visible: boolean;
  roomId: string;
  assignment: RoomAssignment | null;
  onClose: () => void;
}

export function TeacherGradingModal({
  visible,
  roomId,
  assignment,
  onClose,
}: TeacherGradingModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  // Selected submission being actively graded
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [gradeInput, setGradeInput] = useState<string>("");
  const [feedbackInput, setFeedbackInput] = useState<string>("");

  // Query submissions roster for this assignment
  const submissionsQuery = useQuery<RoomAssignmentSubmission[]>({
    queryKey: ["room-assignment-submissions", roomId, assignment?.id],
    queryFn: async () => {
      if (!assignment) return [];
      const res = await api<{ submissions: RoomAssignmentSubmission[] }>(
        `/rooms/${roomId}/assignments/${assignment.id}/submissions`
      );
      return res.submissions ?? [];
    },
    enabled: Boolean(visible && assignment?.id),
  });

  // Open & preview student file from R2
  const handleOpenSubmissionFile = async (sub: RoomAssignmentSubmission) => {
    try {
      triggerHaptic("selection");
      const ticketRes = await api<{ url: string }>(
        `/rooms/${roomId}/assignments/${assignment?.id}/submissions/${sub.id}/download`
      );
      const targetUrl = ticketRes.url || sub.file_url;
      const canOpen = await Linking.canOpenURL(targetUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(targetUrl);
      } else {
        await Linking.openURL(sub.file_url);
      }
    } catch (err: any) {
      Alert.alert("Could not open file", err.message || "Failed to access submission");
    }
  };

  // Grade submission mutation
  const gradeMutation = useMutation({
    mutationFn: async (subId: string) => {
      const numericGrade = parseFloat(gradeInput);
      if (isNaN(numericGrade) || numericGrade < 0) {
        throw new Error("Please enter a valid numeric grade.");
      }

      return api(
        `/rooms/${roomId}/assignments/${assignment?.id}/submissions/${subId}/grade`,
        {
          method: "PATCH",
          body: JSON.stringify({
            grade: numericGrade,
            feedback: feedbackInput.trim() || undefined,
          }),
        }
      );
    },
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-assignment-submissions", roomId, assignment?.id] });
      qc.invalidateQueries({ queryKey: ["room-assignments", roomId] });
      setActiveSubId(null);
      setGradeInput("");
      setFeedbackInput("");
      Alert.alert("Grade Published! 🌟", "The student has been notified with their score and feedback.");
    },
    onError: (err: any) => {
      Alert.alert("Grading Failed", err.message || "Could not save grade");
    },
  });

  const submissions = submissionsQuery.data ?? [];

  if (!assignment) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.headerRow}>
            <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
              <MaterialCommunityIcons name="check-decagram-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[s.modalTitle, { color: colors.text }]}>
                  Grade Submissions
                </Text>
                <Text numberOfLines={1} style={[s.subTitle, { color: colors.muted }]}>
                  {assignment.title} • {submissions.length} Submissions
                </Text>
              </View>
            </Row>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Submissions Roster */}
          {submissionsQuery.isLoading ? (
            <View style={{ padding: 36, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={{ marginTop: 8, fontSize: 13, color: colors.muted }}>Loading submissions...</Text>
            </View>
          ) : submissions.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="file-document-outline" size={44} color={colors.muted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>No Submissions Yet</Text>
              <Text style={[s.emptySub, { color: colors.muted }]}>
                Students have not submitted their solutions for this assignment yet.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 12 }}>
              {submissions.map((sub) => {
                const isExpanded = activeSubId === sub.id;
                const studentName = sub.student?.full_name || sub.student?.username || "Student";
                const isGraded = sub.status === "graded";
                const isLate = new Date(sub.submitted_at) > new Date(assignment.due_date);

                return (
                  <Card key={sub.id} style={[s.subCard, { borderColor: isExpanded ? colors.primary : colors.border }]}>
                    {/* Top Row: Student info & Status */}
                    <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <Row style={{ alignItems: "center", gap: 10 }}>
                        <View style={[s.avatarCircle, { backgroundColor: colors.primary }]}>
                          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
                            {studentName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={[s.studentName, { color: colors.text }]}>{studentName}</Text>
                          <Row style={{ alignItems: "center", gap: 6, marginTop: 2 }}>
                            <Text style={[s.dateText, { color: colors.muted }]}>
                              {new Date(sub.submitted_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                            {isLate && (
                              <View style={[s.badgeLate, { backgroundColor: "#EF444420" }]}>
                                <Text style={{ color: "#EF4444", fontSize: 9, fontWeight: "700" }}>LATE</Text>
                              </View>
                            )}
                          </Row>
                        </View>
                      </Row>

                      {/* Status / Grade Badge */}
                      {isGraded ? (
                        <View style={[s.gradedPill, { backgroundColor: "#10B98120" }]}>
                          <Text style={{ color: "#10B981", fontWeight: "800", fontSize: 12 }}>
                            {sub.grade} / {assignment.total_points}
                          </Text>
                        </View>
                      ) : (
                        <View style={[s.gradedPill, { backgroundColor: "#F59E0B20" }]}>
                          <Text style={{ color: "#F59E0B", fontWeight: "700", fontSize: 11 }}>
                            Needs Grade
                          </Text>
                        </View>
                      )}
                    </Row>

                    {/* Student Comments */}
                    {Boolean(sub.student_notes) && (
                      <Text style={[s.notesBox, { color: colors.text, backgroundColor: colors.surface }]}>
                        "{sub.student_notes}"
                      </Text>
                    )}

                    {/* File Attachment & Actions */}
                    <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      <Row style={{ alignItems: "center", gap: 6, flex: 1 }}>
                        <MaterialCommunityIcons name="file-pdf-box" size={20} color="#DC2626" />
                        <Text numberOfLines={1} style={[s.fileText, { color: colors.text }]}>
                          {sub.file_name || "homework.pdf"}
                        </Text>
                      </Row>

                      <Row style={{ gap: 8 }}>
                        <Pressable
                          onPress={() => handleOpenSubmissionFile(sub)}
                          style={[s.openBtn, { borderColor: colors.border }]}
                        >
                          <MaterialCommunityIcons name="download" size={14} color={colors.primary} />
                          <Text style={[s.openBtnText, { color: colors.primary }]}>View</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            if (isExpanded) {
                              setActiveSubId(null);
                            } else {
                              setActiveSubId(sub.id);
                              setGradeInput(sub.grade !== null && sub.grade !== undefined ? String(sub.grade) : "");
                              setFeedbackInput(sub.feedback || "");
                            }
                          }}
                          style={[s.gradeToggleBtn, { backgroundColor: colors.primary }]}
                        >
                          <Text style={s.gradeToggleText}>
                            {isExpanded ? "Close" : isGraded ? "Edit Grade" : "Grade"}
                          </Text>
                        </Pressable>
                      </Row>
                    </Row>

                    {/* Inline Grading Form */}
                    {isExpanded && (
                      <View style={[s.gradeForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[s.formLabel, { color: colors.muted }]}>
                          Score (out of {assignment.total_points}):
                        </Text>
                        <TextInput
                          style={[s.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2 }]}
                          placeholder={`Score (0 - ${assignment.total_points})`}
                          placeholderTextColor={colors.muted}
                          value={gradeInput}
                          onChangeText={setGradeInput}
                          keyboardType="numeric"
                        />

                        <Text style={[s.formLabel, { color: colors.muted }]}>Teacher Feedback:</Text>
                        <TextInput
                          style={[
                            s.input,
                            s.textArea,
                            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2 },
                          ]}
                          placeholder="Write constructive remarks or praise for the student..."
                          placeholderTextColor={colors.muted}
                          value={feedbackInput}
                          onChangeText={setFeedbackInput}
                          multiline
                          numberOfLines={2}
                        />

                        <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                          <Pressable onPress={() => setActiveSubId(null)} style={s.cancelFormBtn}>
                            <Text style={{ color: colors.muted }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => gradeMutation.mutate(sub.id)}
                            disabled={gradeMutation.isPending || !gradeInput.trim()}
                            style={[
                              s.saveGradeBtn,
                              { backgroundColor: colors.primary, opacity: gradeInput.trim() ? 1 : 0.5 },
                            ]}
                          >
                            {gradeMutation.isPending ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text style={s.saveGradeText}>Publish Grade</Text>
                            )}
                          </Pressable>
                        </Row>
                      </View>
                    )}
                  </Card>
                );
              })}
            </ScrollView>
          )}
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
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyBox: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  subCard: {
    padding: 14,
    borderRadius: radius.md,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  studentName: {
    fontSize: 13,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 11,
  },
  badgeLate: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  gradedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  notesBox: {
    fontSize: 12,
    fontStyle: "italic",
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 8,
  },
  fileText: {
    fontSize: 12,
    fontWeight: "500",
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  openBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  gradeToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  gradeToggleText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  gradeForm: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 12,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    marginBottom: 8,
  },
  textArea: {
    height: 50,
    textAlignVertical: "top",
  },
  cancelFormBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saveGradeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  saveGradeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
});
