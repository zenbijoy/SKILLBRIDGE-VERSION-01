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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

interface CreatePollModalProps {
  visible: boolean;
  roomId: string;
  initialPollType?: "time_selection" | "opinion";
  initialQuestion?: string;
  targetRequestId?: string;
  onClose: () => void;
  onPollCreated?: (pollId: string) => void;
}

export function CreatePollModal({
  visible,
  roomId,
  initialPollType = "time_selection",
  initialQuestion = "",
  targetRequestId,
  onClose,
  onPollCreated,
}: CreatePollModalProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const keyboardHeight = useKeyboardHeight();

  const [pollType, setPollType] = useState<"time_selection" | "opinion">(initialPollType);
  const [question, setQuestion] = useState(initialQuestion);
  const [options, setOptions] = useState<string[]>(() => {
    if (initialPollType === "time_selection") {
      return ["Tomorrow 6:00 PM", "Tomorrow 8:00 PM", "Saturday 11:00 AM"];
    }
    return ["Option A", "Option B"];
  });

  // Sync state if initial props change
  React.useEffect(() => {
    if (visible) {
      setPollType(initialPollType);
      if (initialQuestion) setQuestion(initialQuestion);
      if (initialPollType === "time_selection" && !initialQuestion) {
        setQuestion("When should we hold the next live session?");
      }
    }
  }, [visible, initialPollType, initialQuestion]);

  const addOption = () => {
    if (options.length >= 6) {
      Alert.alert("Limit Reached", "A maximum of 6 options is allowed.");
      return;
    }
    triggerHaptic();
    setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      Alert.alert("Minimum Required", "At least 2 options are required.");
      return;
    }
    triggerHaptic();
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, val: string) => {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  };

  const addTimePreset = (timeStr: string) => {
    triggerHaptic();
    if (options.includes(timeStr)) return;
    if (options.length < 6) {
      // If there is an empty option, replace it
      const emptyIdx = options.findIndex((o) => !o.trim());
      if (emptyIdx !== -1) {
        updateOption(emptyIdx, timeStr);
      } else {
        setOptions([...options, timeStr]);
      }
    } else {
      Alert.alert("Limit Reached", "Max 6 options allowed.");
    }
  };

  const createPollM = useMutation({
    mutationFn: () => {
      const trimmedQ = question.trim();
      if (trimmedQ.length < 3) throw new Error("Question must be at least 3 characters.");
      const validOptions = options.map((o) => o.trim()).filter(Boolean);
      if (validOptions.length < 2) throw new Error("Please provide at least 2 non-empty options.");

      return api<{ poll: any }>(`/rooms/${roomId}/polls`, {
        method: "POST",
        body: JSON.stringify({
          question: trimmedQ,
          options: validOptions,
          pollType,
          targetRequestId: targetRequestId || undefined,
        }),
      });
    },
    onSuccess: (data) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
      Alert.alert("Live Poll Launched! 🚀", "Room members can now vote in real-time.");
      if (data?.poll?.id && onPollCreated) {
        onPollCreated(data.poll.id);
      }
      onClose();
    },
    onError: (err: any) => Alert.alert("Failed to create poll", err.message),
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={[
            s.overlay,
            Platform.OS === "android" && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          ]}
        >
          <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Header */}
            <Row style={s.modalHeader}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="poll" size={24} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text }]}>{t("rooms.polls.createPoll")}</Text>
              </Row>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  onClose();
                }}
                style={s.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.modalBody}
              keyboardShouldPersistTaps="handled"
            >
            {/* Poll Type Toggle */}
            <Row style={[s.typeSelector, { backgroundColor: colors.surface2 }]}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setPollType("time_selection");
                  if (!question || question === "What's on your mind?") {
                    setQuestion("When should we hold the next live session?");
                  }
                }}
                style={[
                  s.typeBtn,
                  pollType === "time_selection" && [s.typeBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}
              >
                <MaterialCommunityIcons
                  name="clock-time-four-outline"
                  size={16}
                  color={pollType === "time_selection" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.typeBtnText,
                    {
                      color: pollType === "time_selection" ? colors.primary : colors.muted,
                      fontWeight: pollType === "time_selection" ? "800" : "600",
                    },
                  ]}
                >
                  {t("rooms.polls.timeSelection")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setPollType("opinion");
                  if (question === "When should we hold the next live session?") {
                    setQuestion("");
                  }
                }}
                style={[
                  s.typeBtn,
                  pollType === "opinion" && [s.typeBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}
              >
                <MaterialCommunityIcons
                  name="comment-question-outline"
                  size={16}
                  color={pollType === "opinion" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.typeBtnText,
                    {
                      color: pollType === "opinion" ? colors.primary : colors.muted,
                      fontWeight: pollType === "opinion" ? "800" : "600",
                    },
                  ]}
                >
                  {t("rooms.polls.generalOpinion")}
                </Text>
              </Pressable>
            </Row>

            {/* Question Input */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>
                {pollType === "time_selection" ? "Poll Question or Session Goal" : "Question / Discussion Topic"}
              </Text>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={pollType === "time_selection" ? "e.g. When should we hold the audio discussion on chapter 4?" : "e.g. Which framework should we learn next?"}
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Quick Presets for Time Selection */}
            {pollType === "time_selection" && (
              <View style={{ gap: 6 }}>
                <Text style={[s.inputLabel, { color: colors.muted, fontSize: 11 }]}>
                  ⚡ Tap quick time presets to add options:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {["Today 7:00 PM", "Tomorrow 5:00 PM", "Tomorrow 8:00 PM", "Friday 6:00 PM", "Saturday 11:00 AM", "Sunday 4:00 PM"].map(
                    (preset) => (
                      <Pressable
                        key={preset}
                        onPress={() => addTimePreset(preset)}
                        style={[s.presetPill, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                      >
                        <Text style={[s.presetPillText, { color: colors.primary }]}>+ {preset}</Text>
                      </Pressable>
                    ),
                  )}
                </ScrollView>
              </View>
            )}

            {/* Voting Options */}
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.inputLabel, { color: colors.text }]}>
                  {pollType === "time_selection" ? "Proposed Time Slots (2-6)" : "Options (2-6)"}
                </Text>
                {options.length < 6 && (
                  <Pressable onPress={addOption} style={s.addOptBtn}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={16} color={colors.primary} />
                    <Text style={[s.addOptText, { color: colors.primary }]}>Add Option</Text>
                  </Pressable>
                )}
              </Row>

              {options.map((opt, idx) => (
                <Row key={idx} style={{ alignItems: "center", gap: 8 }}>
                  <View style={[s.optIndexBadge, { backgroundColor: colors.surface2 }]}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>{idx + 1}</Text>
                  </View>
                  <TextInput
                    value={opt}
                    onChangeText={(val) => updateOption(idx, val)}
                    placeholder={pollType === "time_selection" ? `e.g. Tomorrow ${5 + idx}:00 PM` : `Option ${idx + 1}`}
                    placeholderTextColor={colors.muted}
                    style={[s.input, { flex: 1, backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                  />
                  {options.length > 2 && (
                    <Pressable onPress={() => removeOption(idx)} style={s.removeBtn}>
                      <MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.danger} />
                    </Pressable>
                  )}
                </Row>
              ))}
            </View>
          </ScrollView>

          {/* Action Button */}
          <View style={s.modalFooter}>
            <Button
              title={createPollM.isPending ? "Publishing Poll…" : "Launch Live Poll 🚀"}
              disabled={createPollM.isPending || !question.trim() || options.filter((o) => o.trim()).length < 2}
              loading={createPollM.isPending}
              onPress={() => createPollM.mutate()}
            />
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    maxHeight: "85%",
  },
  modalHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  typeSelector: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  typeBtnActive: {
    borderWidth: 1,
  },
  typeBtnText: {
    fontSize: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  addOptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addOptText: {
    fontSize: 12,
    fontWeight: "700",
  },
  optIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    padding: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,150,150,0.2)",
  },
});
