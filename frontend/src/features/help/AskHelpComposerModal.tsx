import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { Button, H2, Muted, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { Room } from "@/types";
import { DOUBT_REWARDS, resolveQuestionPayload } from "./helpUtils";

type AskHelpComposerModalProps = {
  visible: boolean;
  defaultRoomId?: string;
  defaultSubject?: string;
  onClose: () => void;
  onSuccess?: (question: any) => void;
};

type UrgencyLevel = "normal" | "today" | "exam_soon";

const SUGGESTED_SUBJECTS = [
  "Numerical Methods",
  "Calculus",
  "Algorithms",
  "Linear Algebra",
  "Data Structures",
  "Physics",
  "Discrete Math",
  "Database Systems",
];

export function AskHelpComposerModal({
  visible,
  defaultRoomId,
  defaultSubject,
  onClose,
  onSuccess,
}: AskHelpComposerModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const keyboardHeight = useKeyboardHeight();

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(defaultSubject || "");
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("normal");
  const [targetType, setTargetType] = useState<"campus" | "room">(defaultRoomId ? "room" : "campus");
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(defaultRoomId);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch user's joined rooms for target selection
  const myRoomsQuery = useQuery({
    queryKey: ["my-rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms/mine"),
    enabled: visible,
  });

  const joinedRooms = myRoomsQuery.data?.rooms ?? [];

  // Compute effective text to avoid empty body blocks
  const resolved = useMemo(() => resolveQuestionPayload(title, body), [title, body]);

  const createQuestionMutation = useMutation({
    mutationFn: async () => {
      const payload = resolveQuestionPayload(title, body);
      return api<{ question: any; reward?: { points: number; awarded: boolean } }>("/help/questions", {
        method: "POST",
        body: JSON.stringify({
          title: payload.title || undefined,
          body: payload.body,
          subject: subject.trim() || undefined,
          topic: topic.trim() || undefined,
          urgency,
          target: targetType,
          roomId: targetType === "room" ? selectedRoomId : undefined,
        }),
      });
    },
    onSuccess: (res) => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["help-questions"] });
      qc.invalidateQueries({ queryKey: ["room-questions"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      onClose();
      resetForm();
      if (onSuccess) onSuccess(res.question);
      const pointsWon = res.reward?.points ?? DOUBT_REWARDS.ASK_DOUBT;
      Alert.alert(
        "Doubt Published! 🎓",
        `Your question is now visible to campus peers. You earned +${pointsWon} Reputation!`,
      );
    },
    onError: (err: any) => {
      Alert.alert("Could not post question", err.message || "Failed to submit help question.");
    },
  });

  const resetForm = () => {
    setStep(1);
    setTitle("");
    setBody("");
    setSubject(defaultSubject || "");
    setTopic("");
    setUrgency("normal");
    setTargetType(defaultRoomId ? "room" : "campus");
    setSelectedRoomId(defaultRoomId);
    setValidationError(null);
  };

  const validateAndProceed = () => {
    const payload = resolveQuestionPayload(title, body);
    if (!payload.isValid) {
      triggerHaptic("notificationWarning");
      setValidationError("Please describe your question or concept (at least 5 characters).");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleNext = () => {
    triggerHaptic();
    if (!validateAndProceed()) return;

    if (step === 1) {
      setStep(2);
    } else {
      createQuestionMutation.mutate();
    }
  };

  const handleQuickPost = () => {
    triggerHaptic();
    if (!validateAndProceed()) return;
    createQuestionMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.keyboardView}
        >
          <View
            style={[
              s.container,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(keyboardHeight > 0 ? 12 : 24, 16),
              },
            ]}
          >
            {/* Drag handle */}
            <View style={[s.grabber, { backgroundColor: colors.borderStrong }]} />

            {/* Header */}
            <Row style={s.header}>
              <View style={{ flex: 1 }}>
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <View style={[s.headerIcon, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons name="help-circle-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <H2 style={s.modalTitle}>Ask a Doubt</H2>
                    <Muted style={s.modalSubtitle}>
                      Step {step} of 2 · {step === 1 ? "Question details" : "Urgency & destination"}
                    </Muted>
                  </View>
                </Row>
              </View>
              <Pressable
                onPress={() => {
                  onClose();
                  resetForm();
                }}
                hitSlop={12}
                style={[s.closeBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>

            {/* Reward Motivation Banner */}
            <Row style={[s.rewardBanner, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}>
              <MaterialCommunityIcons name="star-shooting" size={18} color={colors.primary} />
              <Text style={[s.rewardBannerText, { color: colors.primary }]}>
                Earn <Text style={{ fontWeight: "800" }}>+{DOUBT_REWARDS.ASK_DOUBT} Reputation</Text> for asking! Peers receive{" "}
                <Text style={{ fontWeight: "800" }}>+{DOUBT_REWARDS.ANSWER_DOUBT} Rep</Text> for answering.
              </Text>
            </Row>

            {/* Step Indicator */}
            <View style={{ gap: 6, marginBottom: 12, marginTop: 4 }}>
              <Row style={s.progressRow}>
                {[1, 2].map((sNum) => (
                  <View
                    key={sNum}
                    style={[
                      s.progressBar,
                      {
                        backgroundColor: sNum <= step ? colors.primary : colors.divider,
                      },
                    ]}
                  />
                ))}
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                {["1. Your Question & Subject", "2. Urgency & Audience"].map((lbl, i) => (
                  <Text
                    key={lbl}
                    style={{
                      fontSize: 11,
                      fontWeight: step === i + 1 ? "700" : "500",
                      color: step >= i + 1 ? colors.primary : colors.muted,
                    }}
                  >
                    {lbl}
                  </Text>
                ))}
              </Row>
            </View>

            <ScrollView
              style={s.bodyScroll}
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Validation Warning Box */}
              {validationError && (
                <Row style={[s.errorBox, { backgroundColor: `${colors.danger}18`, borderColor: colors.danger }]}>
                  <MaterialCommunityIcons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={[s.errorText, { color: colors.danger }]}>{validationError}</Text>
                </Row>
              )}

              {/* STEP 1: QUESTION & SUBJECT */}
              {step === 1 && (
                <View style={{ gap: 14 }}>
                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>
                      Question Title / Short Summary *
                    </Text>
                    <TextInput
                      placeholder="e.g. How to solve second-order ODEs using characteristic equations?"
                      placeholderTextColor={colors.muted}
                      value={title}
                      onChangeText={(t) => {
                        setTitle(t);
                        if (validationError) setValidationError(null);
                      }}
                      style={[
                        s.input,
                        {
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderColor: validationError && !resolved.isValid ? colors.danger : colors.border,
                        },
                      ]}
                      returnKeyType="next"
                    />
                  </View>

                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>
                      Details, Formulas, Code or Homework Problem
                    </Text>
                    <TextInput
                      placeholder="Explain your approach, paste the error, or describe where you are stuck..."
                      placeholderTextColor={colors.muted}
                      value={body}
                      onChangeText={(b) => {
                        setBody(b);
                        if (validationError) setValidationError(null);
                      }}
                      multiline
                      numberOfLines={5}
                      style={[
                        s.input,
                        s.textArea,
                        {
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderColor: validationError && !resolved.isValid ? colors.danger : colors.border,
                        },
                      ]}
                    />
                    <Muted style={{ fontSize: 11, marginTop: 4 }}>
                      💡 Tip: Clear questions with context or error codes get solved 3x faster!
                    </Muted>
                  </View>

                  {/* Subject / Course */}
                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>Subject / Course (Optional)</Text>
                    <TextInput
                      placeholder="e.g. Numerical Methods, Discrete Math, Physics"
                      placeholderTextColor={colors.muted}
                      value={subject}
                      onChangeText={setSubject}
                      style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                    />
                  </View>

                  {/* Suggested Subjects */}
                  <View>
                    <Text style={[s.inputLabel, { color: colors.muted, fontSize: 11 }]}>POPULAR SUBJECTS</Text>
                    <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {SUGGESTED_SUBJECTS.map((sub) => {
                        const isChosen = subject.toLowerCase() === sub.toLowerCase();
                        return (
                          <Pressable
                            key={sub}
                            onPress={() => {
                              triggerHaptic();
                              setSubject(sub);
                            }}
                            style={[
                              s.pillBtn,
                              {
                                backgroundColor: isChosen ? colors.primarySoft : colors.bg,
                                borderColor: isChosen ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isChosen ? "700" : "500",
                                color: isChosen ? colors.primary : colors.text,
                              }}
                            >
                              {sub}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </Row>
                  </View>

                  {/* Topic / Subtopic */}
                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>Topic / Chapter (Optional)</Text>
                    <TextInput
                      placeholder="e.g. Interpolation, Graph Theory, Thermodynamics"
                      placeholderTextColor={colors.muted}
                      value={topic}
                      onChangeText={setTopic}
                      style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                    />
                  </View>
                </View>
              )}

              {/* STEP 2: URGENCY & TARGET */}
              {step === 2 && (
                <View style={{ gap: 16 }}>
                  {/* Urgency */}
                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>How urgent is this doubt?</Text>
                    <Row style={{ gap: 8, marginTop: 4 }}>
                      {[
                        { key: "normal", label: "Normal", color: colors.primary, icon: "clock-outline", desc: "Regular study" },
                        { key: "today", label: "Due Today", color: colors.warning, icon: "alert-circle-outline", desc: "Assignment due" },
                        { key: "exam_soon", label: "Exam Soon", color: colors.danger, icon: "fire", desc: "Exam preparation" },
                      ].map((u) => {
                        const isSelected = urgency === u.key;
                        return (
                          <Pressable
                            key={u.key}
                            onPress={() => {
                              triggerHaptic();
                              setUrgency(u.key as UrgencyLevel);
                            }}
                            style={[
                              s.urgencyCard,
                              {
                                backgroundColor: isSelected ? `${u.color}18` : colors.bg,
                                borderColor: isSelected ? u.color : colors.border,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons name={u.icon as any} size={22} color={isSelected ? u.color : colors.muted} />
                            <Text style={[s.urgencyText, { color: isSelected ? u.color : colors.text }]}>
                              {u.label}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.muted }}>{u.desc}</Text>
                          </Pressable>
                        );
                      })}
                    </Row>
                  </View>

                  {/* Target */}
                  <View>
                    <Text style={[s.inputLabel, { color: colors.text }]}>Post Destination</Text>
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setTargetType("campus");
                      }}
                      style={[
                        s.targetOption,
                        {
                          backgroundColor: targetType === "campus" ? colors.primarySoft : colors.bg,
                          borderColor: targetType === "campus" ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="earth"
                        size={22}
                        color={targetType === "campus" ? colors.primary : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.targetTitle, { color: colors.text }]}>Campus Help Center (Recommended)</Text>
                        <Muted style={{ fontSize: 11 }}>Visible university-wide to peer tutors and classmates</Muted>
                      </View>
                      {targetType === "campus" && (
                        <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setTargetType("room");
                      }}
                      style={[
                        s.targetOption,
                        {
                          marginTop: 8,
                          backgroundColor: targetType === "room" ? colors.primarySoft : colors.bg,
                          borderColor: targetType === "room" ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="account-group"
                        size={22}
                        color={targetType === "room" ? colors.primary : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.targetTitle, { color: colors.text }]}>Specific Study Room</Text>
                        <Muted style={{ fontSize: 11 }}>Ask directly inside one of your joined course rooms</Muted>
                      </View>
                      {targetType === "room" && (
                        <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                      )}
                    </Pressable>

                    {/* Room picker if targetType is room */}
                    {targetType === "room" && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={[s.inputLabel, { color: colors.muted, fontSize: 11 }]}>SELECT DESTINATION ROOM</Text>
                        {joinedRooms.length === 0 ? (
                          <Muted style={{ fontSize: 12 }}>You have not joined any study rooms yet. We will route to Campus Help.</Muted>
                        ) : (
                          <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                            {joinedRooms.map((r) => {
                              const isChosen = selectedRoomId === r.id;
                              return (
                                <Pressable
                                  key={r.id}
                                  onPress={() => {
                                    triggerHaptic();
                                    setSelectedRoomId(r.id);
                                  }}
                                  style={[
                                    s.pillBtn,
                                    {
                                      backgroundColor: isChosen ? colors.primary : colors.bg,
                                      borderColor: isChosen ? colors.primary : colors.border,
                                    },
                                  ]}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: "600", color: isChosen ? "#FFF" : colors.text }}>
                                    {r.title}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </Row>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <Row style={s.bottomRow}>
              {step === 1 ? (
                <>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="ghost" onPress={onClose} />
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Button
                      title="Quick Post 🚀"
                      variant="secondary"
                      loading={createQuestionMutation.isPending}
                      onPress={handleQuickPost}
                    />
                  </View>
                  <View style={{ flex: 1.3 }}>
                    <Button
                      title="Next Step →"
                      loading={createQuestionMutation.isPending}
                      onPress={handleNext}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Button title="← Back" variant="ghost" onPress={() => setStep(1)} />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Button
                      title={createQuestionMutation.isPending ? "Publishing..." : "Publish Doubt 🎓"}
                      loading={createQuestionMutation.isPending}
                      onPress={handleNext}
                    />
                  </View>
                </>
              )}
            </Row>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  keyboardView: {
    width: "100%",
  },
  container: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
  },
  rewardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  rewardBannerText: {
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  progressRow: {
    gap: 6,
    marginBottom: 4,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  bodyScroll: {
    maxHeight: 390,
  },
  scrollContent: {
    paddingBottom: 14,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    height: 110,
    textAlignVertical: "top",
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  urgencyCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 3,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  targetOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  targetTitle: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  bottomRow: {
    gap: 10,
    marginTop: 12,
    paddingTop: 8,
  },
});
