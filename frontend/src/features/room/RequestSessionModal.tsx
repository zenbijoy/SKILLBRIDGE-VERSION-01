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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { RoomTeacher } from "./TeacherCallModal";

interface RequestSessionModalProps {
  visible: boolean;
  roomId: string;
  roomTitle: string;
  onClose: () => void;
}

export function RequestSessionModal({
  visible,
  roomId,
  roomTitle,
  onClose,
}: RequestSessionModalProps) {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();

  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState<"immediate" | "normal">("immediate");
  const [preferredMedia, setPreferredMedia] = useState<"audio" | "video">("audio");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  // Fetch teachers so student can target a specific teacher or any
  const teachersQuery = useQuery({
    queryKey: ["room-teachers", roomId],
    queryFn: () => api<{ teachers: RoomTeacher[] }>(`/rooms/${roomId}/teachers`),
    enabled: visible && Boolean(roomId),
  });

  const teachers = teachersQuery.data?.teachers || [];

  const requestMutation = useMutation({
    mutationFn: () =>
      api(`/rooms/${roomId}/help-requests`, {
        method: "POST",
        body: JSON.stringify({
          topic: topic.trim(),
          details: details.trim() || undefined,
          urgency,
          preferredMedia,
          teacherId: selectedTeacherId || undefined,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-help-requests", roomId] });
      Alert.alert(
        "Session Request Sent! 🚀",
        "Room teachers have received your request. As soon as a teacher starts the live session, the Join button will become visible.",
      );
      setTopic("");
      setDetails("");
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert("Request Failed", err.message || "Could not submit session request");
    },
  });

  const handleSubmit = () => {
    if (!topic.trim()) {
      Alert.alert("Topic Required", "Please enter what you need help with.");
      return;
    }
    requestMutation.mutate();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          <Row style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="hand-wave-outline" size={20} color={colors.accent} />
                <Text style={[s.title, { color: colors.text }]}>Request Live Session</Text>
              </Row>
              <Text style={[s.subtitle, { color: colors.muted }]} numberOfLines={1}>
                {roomTitle} · Request a teacher to host a session
              </Text>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          </Row>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.form}>
            {/* Urgency Level */}
            <Text style={[s.label, { color: colors.text }]}>Urgency Level</Text>
            <Row style={{ gap: 10, marginBottom: 14 }}>
              <Pressable
                onPress={() => setUrgency("immediate")}
                style={[
                  s.urgencyPill,
                  urgency === "immediate"
                    ? { backgroundColor: `${colors.danger}18`, borderColor: colors.danger }
                    : { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons
                  name="lightning-bolt"
                  size={16}
                  color={urgency === "immediate" ? colors.danger : colors.muted}
                />
                <Text
                  style={[
                    s.pillText,
                    { color: urgency === "immediate" ? colors.danger : colors.muted },
                  ]}
                >
                  Immediate Help
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setUrgency("normal")}
                style={[
                  s.urgencyPill,
                  urgency === "normal"
                    ? { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }
                    : { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons
                  name="calendar-clock"
                  size={16}
                  color={urgency === "normal" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.pillText,
                    { color: urgency === "normal" ? colors.primary : colors.muted },
                  ]}
                >
                  Normal Session
                </Text>
              </Pressable>
            </Row>

            {/* Preferred Media */}
            <Text style={[s.label, { color: colors.text }]}>Preferred Session Format</Text>
            <Row style={{ gap: 10, marginBottom: 14 }}>
              <Pressable
                onPress={() => setPreferredMedia("audio")}
                style={[
                  s.mediaPill,
                  preferredMedia === "audio"
                    ? { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }
                    : { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons
                  name="microphone"
                  size={16}
                  color={preferredMedia === "audio" ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.pillText,
                    { color: preferredMedia === "audio" ? colors.primary : colors.muted },
                  ]}
                >
                  Audio Discussion
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPreferredMedia("video")}
                style={[
                  s.mediaPill,
                  preferredMedia === "video"
                    ? { backgroundColor: `${colors.accent}18`, borderColor: colors.accent }
                    : { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons
                  name="video"
                  size={16}
                  color={preferredMedia === "video" ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    s.pillText,
                    { color: preferredMedia === "video" ? colors.accent : colors.muted },
                  ]}
                >
                  Video Class
                </Text>
              </Pressable>
            </Row>

            {/* Topic Input */}
            <Text style={[s.label, { color: colors.text }]}>Topic / Problem *</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Need help with question 4 in Assignment 2"
              placeholderTextColor={colors.muted}
              style={[
                s.input,
                { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
              ]}
              maxLength={180}
            />

            {/* Additional Details */}
            <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>
              Additional Notes (Optional)
            </Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Add any context, links, or specific parts you are stuck on..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[
                s.textArea,
                { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
              ]}
              maxLength={1000}
            />

            {/* Teacher Selection */}
            {teachers.length > 0 && (
              <>
                <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>
                  Request Specific Teacher (Optional)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                  <Row style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => setSelectedTeacherId(null)}
                      style={[
                        s.teacherChip,
                        selectedTeacherId === null
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: colors.surface2, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          s.teacherChipText,
                          { color: selectedTeacherId === null ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        Any Teacher / Admin
                      </Text>
                    </Pressable>

                    {teachers.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => setSelectedTeacherId(t.id)}
                        style={[
                          s.teacherChip,
                          selectedTeacherId === t.id
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: colors.surface2, borderColor: colors.border },
                        ]}
                      >
                        <Text
                          style={[
                            s.teacherChipText,
                            { color: selectedTeacherId === t.id ? "#FFFFFF" : colors.text },
                          ]}
                        >
                          {t.full_name} ({t.role})
                        </Text>
                      </Pressable>
                    ))}
                  </Row>
                </ScrollView>
              </>
            )}

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={requestMutation.isPending}
              style={[
                s.submitBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: requestMutation.isPending ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              {requestMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                  <Text style={s.submitBtnText}>Submit Session Request</Text>
                </Row>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
  },
  form: {
    paddingBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  urgencyPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  mediaPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 14,
  },
  textArea: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: "top",
  },
  teacherChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  teacherChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  submitBtn: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
