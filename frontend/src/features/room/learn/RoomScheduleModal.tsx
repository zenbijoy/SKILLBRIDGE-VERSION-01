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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

interface RoomScheduleModalProps {
  visible: boolean;
  roomId: string;
  sessionId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialType?: "voice" | "offline" | "video";
  initialStartsAt?: string;
  initialLocation?: string;
  requestId?: string;
  onClose: () => void;
}

export function RoomScheduleModal({
  visible,
  roomId,
  sessionId,
  initialTitle = "",
  initialDescription = "",
  initialType = "video",
  initialStartsAt = "",
  initialLocation = "",
  requestId,
  onClose,
}: RoomScheduleModalProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const isEditing = Boolean(sessionId);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [sessionType, setSessionType] = useState<"voice" | "offline" | "video">(initialType);
  const [location, setLocation] = useState(initialLocation);
  const [startsAt, setStartsAt] = useState(() => {
    if (initialStartsAt) return initialStartsAt;
    const d = new Date(Date.now() + 86400000);
    d.setHours(18, 0, 0, 0);
    return d.toISOString();
  });

  // Sync state when props change
  React.useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setSessionType(initialType);
      setLocation(initialLocation);
      if (initialStartsAt) {
        setStartsAt(initialStartsAt);
      } else {
        const d = new Date(Date.now() + 86400000);
        d.setHours(18, 0, 0, 0);
        setStartsAt(d.toISOString());
      }
    }
  }, [visible, initialTitle, initialDescription, initialType, initialStartsAt, initialLocation]);

  const setPresetDate = (hoursAhead: number) => {
    triggerHaptic();
    const d = new Date(Date.now() + hoursAhead * 3600000);
    d.setMinutes(0, 0, 0);
    setStartsAt(d.toISOString());
  };

  const scheduleM = useMutation({
    mutationFn: () => {
      const trimmedTitle = title.trim();
      if (trimmedTitle.length < 3) throw new Error("Title must be at least 3 characters.");
      if (sessionType === "offline" && !location.trim()) {
        throw new Error("Campus location is required for in-person offline sessions.");
      }

      if (isEditing && sessionId) {
        return api(`/rooms/${roomId}/classes/${sessionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: trimmedTitle,
            description: description.trim(),
            starts_at: startsAt,
            session_type: sessionType,
            campus_location: sessionType === "offline" ? location.trim() : null,
          }),
        });
      }

      return api(`/rooms/${roomId}/classes`, {
        method: "POST",
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim(),
          starts_at: startsAt,
          session_type: sessionType,
          campus_location: sessionType === "offline" ? location.trim() : null,
          requestId: requestId || undefined,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      Alert.alert(
        isEditing ? "Session Updated! ✅" : "Live Session Scheduled! 🚀",
        "Room members have been notified with updated details.",
      );
      onClose();
    },
    onError: (err: any) => Alert.alert(isEditing ? "Update Failed" : "Scheduling Failed", err.message),
  });

  const cancelM = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/classes/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      Alert.alert("Session Cancelled", "The scheduled live session was removed.");
      onClose();
    },
    onError: (err: any) => Alert.alert("Cancel Failed", err.message),
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={s.modalHeader}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="calendar-clock" size={24} color={colors.primary} />
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {isEditing ? "Edit Live Session" : t("rooms.learn.scheduleSession")}
              </Text>
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>
            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Class or Session Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Dynamic Programming & Memoization"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            {/* Session Format (Voice, Offline, Video) */}
            <View style={{ gap: 8 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Session Format</Text>
              <View style={{ gap: 8 }}>
                {[
                  {
                    key: "video",
                    icon: "video-outline",
                    title: "📹 Video Live Classroom",
                    sub: "Interactive video with screen share & lecture board",
                  },
                  {
                    key: "voice",
                    icon: "microphone-outline",
                    title: "🎙️ Voice Live Session",
                    sub: "Real-time audio stage for discussion, talks & office hours",
                  },
                  {
                    key: "offline",
                    icon: "map-marker-outline",
                    title: "📍 Campus Physical Meetup",
                    sub: "In-person group study at library, lab, or campus cafe",
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
                      <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[s.typeOptionTitle, { color: colors.text }]}>{item.title}</Text>
                          <Text style={[s.typeOptionSub, { color: colors.muted }]}>{item.sub}</Text>
                        </View>
                        {active && (
                          <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                        )}
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Location (for offline) */}
            {sessionType === "offline" && (
              <View style={{ gap: 6 }}>
                <Text style={[s.inputLabel, { color: colors.text }]}>Campus Physical Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="e.g. Central Library Floor 3, Room 304"
                  placeholderTextColor={colors.muted}
                  style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                />
              </View>
            )}

            {/* Date & Time Presets */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Date & Time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Pressable onPress={() => setPresetDate(2)} style={[s.presetPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[s.presetPillText, { color: colors.text }]}>In 2h</Text>
                </Pressable>
                <Pressable onPress={() => setPresetDate(6)} style={[s.presetPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[s.presetPillText, { color: colors.text }]}>Tonight</Text>
                </Pressable>
                <Pressable onPress={() => setPresetDate(24)} style={[s.presetPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[s.presetPillText, { color: colors.text }]}>Tomorrow</Text>
                </Pressable>
                <Pressable onPress={() => setPresetDate(48)} style={[s.presetPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[s.presetPillText, { color: colors.text }]}>In 2 Days</Text>
                </Pressable>
                <Pressable onPress={() => setPresetDate(168)} style={[s.presetPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={[s.presetPillText, { color: colors.text }]}>Next Week</Text>
                </Pressable>
              </ScrollView>

              <TextInput
                value={startsAt}
                onChangeText={setStartsAt}
                placeholder="ISO date timestamp"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text, marginTop: 4 }]}
              />
              <Text style={{ fontSize: 11, color: colors.muted }}>
                Selected: {new Date(startsAt).toLocaleString()}
              </Text>
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[s.inputLabel, { color: colors.text }]}>Session Agenda / Description (Optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Brief summary of what will be taught or practiced..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[
                  s.input,
                  {
                    height: 70,
                    textAlignVertical: "top",
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={s.modalFooter}>
            <Button
              title={scheduleM.isPending ? "Saving..." : isEditing ? "Save Changes ✅" : "Confirm & Schedule Live Session 🚀"}
              disabled={scheduleM.isPending || title.trim().length < 3 || !startsAt}
              loading={scheduleM.isPending}
              onPress={() => scheduleM.mutate()}
            />

            {isEditing && (
              <Pressable
                onPress={() => {
                  Alert.alert("Cancel Session?", "Are you sure you want to cancel this scheduled session?", [
                    { text: "No", style: "cancel" },
                    { text: "Yes, Cancel", style: "destructive", onPress: () => cancelM.mutate() },
                  ]);
                }}
                disabled={cancelM.isPending}
                style={[s.cancelSessionBtn, { borderColor: colors.danger }]}
              >
                <Text style={[s.cancelSessionBtnText, { color: colors.danger }]}>
                  {cancelM.isPending ? "Cancelling..." : "Cancel Scheduled Session"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
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
    fontWeight: "800",
  },
  typeOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  modalFooter: {
    padding: 20,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,150,150,0.2)",
  },
  cancelSessionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  cancelSessionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
