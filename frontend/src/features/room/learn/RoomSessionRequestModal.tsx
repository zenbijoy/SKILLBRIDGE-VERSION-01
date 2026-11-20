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

interface RoomSessionRequestModalProps {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}

export function RoomSessionRequestModal({
  visible,
  roomId,
  onClose,
}: RoomSessionRequestModalProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const keyboardHeight = useKeyboardHeight();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionType, setSessionType] = useState<"voice" | "offline" | "video">("video");
  const [preferredTimeNote, setPreferredTimeNote] = useState("");

  const submitM = useMutation({
    mutationFn: () => {
      const trimmedTitle = title.trim();
      if (trimmedTitle.length < 3) {
        throw new Error("Please enter a title of at least 3 characters.");
      }
      return api(`/rooms/${roomId}/session-requests`, {
        method: "POST",
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim(),
          sessionType,
          preferredTimeNote: preferredTimeNote.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
      Alert.alert("Request Submitted! 💡", "Room teachers and admins will review your session topic.");
      setTitle("");
      setDescription("");
      setPreferredTimeNote("");
      onClose();
    },
    onError: (err: any) => Alert.alert("Request Failed", err.message),
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
                <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text }]}>{t("rooms.learn.requestSession")}</Text>
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
            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Topic or Subject</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Graph Algorithms & Shortest Paths"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Session Format */}
            <View style={{ gap: 8 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Preferred Session Format</Text>
              <View style={{ gap: 8 }}>
                {[
                  {
                    key: "video",
                    icon: "video-outline",
                    title: "Live Video Classroom",
                    sub: "Interactive video presentation & screen sharing",
                  },
                  {
                    key: "voice",
                    icon: "microphone-outline",
                    title: "Live Voice Discussion",
                    sub: "Casual voice talk, audio Q&A, or office hours",
                  },
                  {
                    key: "offline",
                    icon: "map-marker-outline",
                    title: "Campus Physical Meetup",
                    sub: "Study together in library, lab, or campus lounge",
                  },
                ].map((item) => {
                  const active = sessionType === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        triggerHaptic();
                        setSessionType(item.key as any);
                      }}
                      style={[
                        s.typeOptionCard,
                        {
                          backgroundColor: colors.surface2,
                          borderColor: active ? colors.primary : colors.border,
                          borderWidth: active ? 1.5 : 1,
                        },
                      ]}
                    >
                      <Row style={{ alignItems: "center", gap: 10 }}>
                        <MaterialCommunityIcons
                          name={item.icon as any}
                          size={22}
                          color={active ? colors.primary : colors.muted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.typeOptionTitle, { color: colors.text }]}>{item.title}</Text>
                          <Text style={[s.typeOptionSub, { color: colors.muted }]}>{item.sub}</Text>
                        </View>
                        {active && (
                          <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
                        )}
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Preferred Time Note */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Preferred Timing / Availability</Text>
              <TextInput
                value={preferredTimeNote}
                onChangeText={setPreferredTimeNote}
                placeholder="e.g. Tomorrow after 6 PM, or this weekend"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Details / Specific Doubts (Optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what concepts you want clarified or practiced..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[
                  s.input,
                  {
                    height: 80,
                    textAlignVertical: "top",
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={s.modalFooter}>
            <Button
              title={submitM.isPending ? "Submitting Request…" : "Submit Session Request 🚀"}
              disabled={submitM.isPending || title.trim().length < 3}
              loading={submitM.isPending}
              onPress={() => submitM.mutate()}
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
  typeOptionCard: {
    padding: 12,
    borderRadius: radius.md,
  },
  typeOptionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  typeOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,150,150,0.2)",
  },
});
