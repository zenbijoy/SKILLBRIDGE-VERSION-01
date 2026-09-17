import React, { useState } from "react";
import {
  Alert,
  Modal,
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
import { Button, Card, H2, Muted, Pill, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import type { Room } from "@/types";

type AskHelpComposerModalProps = {
  visible: boolean;
  defaultRoomId?: string;
  defaultSubject?: string;
  onClose: () => void;
  onSuccess?: (question: any) => void;
};

type UrgencyLevel = "normal" | "today" | "exam_soon";

export function AskHelpComposerModal({
  visible,
  defaultRoomId,
  defaultSubject,
  onClose,
  onSuccess,
}: AskHelpComposerModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState(defaultSubject || "");
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel>("normal");
  const [targetType, setTargetType] = useState<"campus" | "room">(defaultRoomId ? "room" : "campus");
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(defaultRoomId);

  // Fetch user's joined rooms for target selection
  const myRoomsQuery = useQuery({
    queryKey: ["my-rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms/mine"),
    enabled: visible,
  });

  const joinedRooms = myRoomsQuery.data?.rooms ?? [];

  const createQuestionMutation = useMutation({
    mutationFn: () =>
      api<{ question: any }>("/help/questions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || undefined,
          body: body.trim(),
          subject: subject.trim() || undefined,
          topic: topic.trim() || undefined,
          urgency,
          target: targetType,
          roomId: targetType === "room" ? selectedRoomId : undefined,
        }),
      }),
    onSuccess: (res) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["help-questions"] });
      qc.invalidateQueries({ queryKey: ["room-questions"] });
      onClose();
      resetForm();
      if (onSuccess) onSuccess(res.question);
      Alert.alert(
        "Question Published! 🎓",
        "Your academic help request has been routed to the canonical thread.",
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
    setSubject("");
    setTopic("");
    setUrgency("normal");
    setTargetType(defaultRoomId ? "room" : "campus");
  };

  const handleNext = () => {
    triggerHaptic();
    if (step === 1) {
      if (body.trim().length < 5) {
        Alert.alert("Question Required", "Please describe what you need help with.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      createQuestionMutation.mutate();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.header}>
            <View>
              <H2 style={s.modalTitle}>Ask for Academic Help</H2>
              <Muted style={s.modalSubtitle}>
                Step {step} of 3 · {step === 1 ? "Question details" : step === 2 ? "Academic topic" : "Urgency & target"}
              </Muted>
            </View>
            <Pressable
              onPress={() => {
                onClose();
                resetForm();
              }}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Step Indicator */}
          <Row style={s.progressRow}>
            {[1, 2, 3].map((sNum) => (
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

          <ScrollView style={s.bodyScroll} contentContainerStyle={s.scrollContent}>
            {/* STEP 1: QUESTION */}
            {step === 1 && (
              <View style={{ gap: 14 }}>
                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Question Summary (Optional)</Text>
                  <TextInput
                    placeholder="e.g. Why does Newton backward interpolation use..."
                    placeholderTextColor={colors.muted}
                    value={title}
                    onChangeText={setTitle}
                    style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  />
                </View>

                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>What do you need help with? *</Text>
                  <TextInput
                    placeholder="Explain the concept, formula, or error code you are encountering..."
                    placeholderTextColor={colors.muted}
                    value={body}
                    onChangeText={setBody}
                    multiline
                    numberOfLines={6}
                    style={[s.input, s.textArea, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  />
                  <Muted style={{ fontSize: 11, marginTop: 4 }}>
                    Math expressions, code snippets, and specific homework problems are supported.
                  </Muted>
                </View>
              </View>
            )}

            {/* STEP 2: ACADEMIC CONTEXT */}
            {step === 2 && (
              <View style={{ gap: 14 }}>
                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Subject / Course</Text>
                  <TextInput
                    placeholder="e.g. Numerical Methods, Discrete Math, Physics"
                    placeholderTextColor={colors.muted}
                    value={subject}
                    onChangeText={setSubject}
                    style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  />
                </View>

                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Topic / Subtopic</Text>
                  <TextInput
                    placeholder="e.g. Interpolation, Graph Theory, Thermodynamics"
                    placeholderTextColor={colors.muted}
                    value={topic}
                    onChangeText={setTopic}
                    style={[s.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  />
                </View>

                {/* Popular suggestions */}
                <View>
                  <Text style={[s.inputLabel, { color: colors.muted, fontSize: 11 }]}>SUGGESTED SUBJECTS</Text>
                  <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {["Numerical Methods", "Calculus", "Algorithms", "Linear Algebra", "Data Structures"].map((sub) => (
                      <Pressable
                        key={sub}
                        onPress={() => {
                          triggerHaptic();
                          setSubject(sub);
                        }}
                        style={[s.pillBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                      >
                        <Text style={{ fontSize: 12, color: colors.text }}>{sub}</Text>
                      </Pressable>
                    ))}
                  </Row>
                </View>
              </View>
            )}

            {/* STEP 3: URGENCY & TARGET */}
            {step === 3 && (
              <View style={{ gap: 16 }}>
                {/* Urgency */}
                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Urgency Level</Text>
                  <Row style={{ gap: 8, marginTop: 4 }}>
                    {[
                      { key: "normal", label: "Normal", color: colors.primary, icon: "clock-outline" },
                      { key: "today", label: "Today", color: colors.warning, icon: "alert-circle-outline" },
                      { key: "exam_soon", label: "Exam Soon", color: colors.danger, icon: "fire" },
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
                          <MaterialCommunityIcons name={u.icon as any} size={20} color={isSelected ? u.color : colors.muted} />
                          <Text style={[s.urgencyText, { color: isSelected ? u.color : colors.text }]}>
                            {u.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </Row>
                </View>

                {/* Target */}
                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Post Destination</Text>
                  <Pressable
                    onPress={() => setTargetType("campus")}
                    style={[
                      s.targetOption,
                      {
                        backgroundColor: targetType === "campus" ? colors.primarySoft : colors.bg,
                        borderColor: targetType === "campus" ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="earth" size={20} color={targetType === "campus" ? colors.primary : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.targetTitle, { color: colors.text }]}>Campus Help Center</Text>
                      <Muted style={{ fontSize: 11 }}>Visible university-wide to peer tutors and classmates</Muted>
                    </View>
                    {targetType === "campus" && (
                      <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => setTargetType("room")}
                    style={[
                      s.targetOption,
                      {
                        marginTop: 8,
                        backgroundColor: targetType === "room" ? colors.primarySoft : colors.bg,
                        borderColor: targetType === "room" ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="account-group" size={20} color={targetType === "room" ? colors.primary : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.targetTitle, { color: colors.text }]}>Specific Study Room</Text>
                      <Muted style={{ fontSize: 11 }}>Ask directly inside one of your joined course rooms</Muted>
                    </View>
                    {targetType === "room" && (
                      <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
                    )}
                  </Pressable>

                  {/* Room picker if targetType is room */}
                  {targetType === "room" && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[s.inputLabel, { color: colors.muted, fontSize: 11 }]}>SELECT DESTINATION ROOM</Text>
                      {joinedRooms.length === 0 ? (
                        <Muted>You have not joined any study rooms yet. We will route to Campus Help.</Muted>
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
                                <Text style={{ fontSize: 12, color: isChosen ? "#FFF" : colors.text }}>
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
            {step > 1 ? (
              <View style={{ flex: 1 }}>
                <Button title="Back" variant="ghost" onPress={() => setStep((s) => (s - 1) as any)} />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={onClose} />
              </View>
            )}
            <View style={{ flex: 1.5 }}>
              <Button
                title={
                  step < 3
                    ? "Next Step →"
                    : createQuestionMutation.isPending
                    ? "Posting..."
                    : "Post Question"
                }
                disabled={createQuestionMutation.isPending || (step === 1 && body.trim().length < 5)}
                onPress={handleNext}
              />
            </View>
          </Row>
        </View>
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
  container: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: 20,
    maxHeight: "85%",
  },
  header: {
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
  },
  progressRow: {
    gap: 6,
    marginBottom: 16,
    marginTop: 4,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  bodyScroll: {
    maxHeight: 380,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    height: 120,
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
    gap: 4,
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
    fontSize: 14,
    fontWeight: "600",
  },
  bottomRow: {
    gap: 12,
    marginTop: 16,
    paddingTop: 8,
  },
});
