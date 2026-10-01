import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CalendarEvent } from "../types";
import { useTheme, radius } from "@/theme";
import { EVENT_TYPE_CONFIG } from "../constants";
import { formatTime12h, getRelativeDayLabel } from "../utils/dateUtils";
import { triggerHaptic } from "@/components/ui";

interface EventDetailsModalProps {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEditTask?: (event: CalendarEvent) => void;
  onDeleteTask?: (eventId: string) => void;
  onToggleComplete?: (event: CalendarEvent) => void;
  onClassException?: (
    event: CalendarEvent,
    exceptionType: "cancelled" | "rescheduled" | "makeup",
    notes?: string
  ) => void;
  onPersonalOverride?: (
    event: CalendarEvent,
    customRoom?: string,
    customNotes?: string
  ) => void;
}

export function EventDetailsModal({
  visible,
  event,
  onClose,
  onEditTask,
  onDeleteTask,
  onToggleComplete,
  onClassException,
  onPersonalOverride,
}: EventDetailsModalProps) {
  const { colors, isDark } = useTheme();

  // Override mode state
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [overrideRoom, setOverrideRoom] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");

  if (!event) return null;

  const cfg = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG.OTHER;
  const accent = isDark ? cfg.darkColor : cfg.lightColor;
  const bgTone = isDark ? cfg.bgDark : cfg.bgLight;
  const isRoutineClass = event.is_routine_class;
  const isTask =
    event.event_type === "ASSIGNMENT" ||
    event.event_type === "QUIZ" ||
    event.event_type === "EXAM" ||
    event.event_type === "PROJECT" ||
    event.event_type === "PRESENTATION" ||
    event.event_type === "DEADLINE" ||
    event.event_type === "PERSONAL_TASK";

  const handleCancelOccurrence = () => {
    Alert.alert(
      "Cancel This Class?",
      `Mark ${event.course_code ?? event.title} as cancelled on ${event.date}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel Class",
          style: "destructive",
          onPress: () => {
            triggerHaptic();
            if (onClassException) {
              onClassException(event, "cancelled", "Cancelled for this date");
            }
            onClose();
          },
        },
      ]
    );
  };

  const handleSaveOverride = () => {
    triggerHaptic();
    if (onPersonalOverride) {
      onPersonalOverride(event, overrideRoom.trim(), overrideNotes.trim());
    }
    setIsOverrideMode(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: isDark ? colors.border : "#E2E8F0" },
            ]}
          >
            <View style={[styles.typePill, { backgroundColor: bgTone }]}>
              <MaterialCommunityIcons
                name={cfg.icon as any}
                size={14}
                color={accent}
              />
              <Text style={[styles.typePillText, { color: accent }]}>
                {cfg.label}
              </Text>
            </View>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Title & Status */}
            <Text
              style={[
                styles.title,
                {
                  color: colors.text,
                  textDecorationLine:
                    event.is_completed || event.is_cancelled
                      ? "line-through"
                      : "none",
                },
              ]}
            >
              {event.course_code ? `${event.course_code}: ` : ""}
              {event.title}
            </Text>

            {event.is_cancelled ? (
              <View style={styles.cancelledBadge}>
                <Text style={styles.cancelledBadgeText}>
                  CLASS CANCELLED ON THIS DATE
                </Text>
              </View>
            ) : null}

            {event.is_completed ? (
              <View style={styles.completedBadge}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={14}
                  color="#059669"
                />
                <Text style={styles.completedBadgeText}>COMPLETED</Text>
              </View>
            ) : null}

            {/* Date & Time Row */}
            <View
              style={[
                styles.infoRow,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="calendar-clock"
                size={20}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.muted }]}>
                  {getRelativeDayLabel(event.date)} ({event.date})
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {formatTime12h(event.start_time)}
                  {event.end_time ? ` - ${formatTime12h(event.end_time)}` : ""}
                </Text>
              </View>
            </View>

            {/* Room / Location */}
            {event.location ? (
              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                    borderColor: isDark ? colors.border : "#E2E8F0",
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="door"
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.muted }]}>
                    Location / Room
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    Room {event.location}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Instructor */}
            {event.instructor ? (
              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                    borderColor: isDark ? colors.border : "#E2E8F0",
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="account-tie"
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.muted }]}>
                    Instructor
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {event.instructor}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Description / Notes */}
            {event.description ? (
              <View style={styles.descWrap}>
                <Text style={[styles.descLabel, { color: colors.muted }]}>
                  Details & Syllabus
                </Text>
                <Text style={[styles.descText, { color: colors.text }]}>
                  {event.description}
                </Text>
              </View>
            ) : null}

            {/* Personal Override Editor */}
            {isOverrideMode ? (
              <View
                style={[
                  styles.overrideBox,
                  {
                    backgroundColor: isDark ? colors.surface2 : "#EFF6FF",
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text style={[styles.overrideHeading, { color: colors.primary }]}>
                  Personal Class Override
                </Text>
                <Text style={[styles.overrideSub, { color: colors.muted }]}>
                  Overrides apply only to your account. Classmates will not be
                  affected.
                </Text>

                <TextInput
                  value={overrideRoom}
                  onChangeText={setOverrideRoom}
                  placeholder={`Custom Room (default: ${event.location ?? "none"})`}
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.overrideInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    },
                  ]}
                />

                <TextInput
                  value={overrideNotes}
                  onChangeText={setOverrideNotes}
                  placeholder="Personal notes (e.g. submit project in this slot)"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.overrideInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    },
                  ]}
                />

                <View style={styles.overrideBtnRow}>
                  <Pressable
                    onPress={() => setIsOverrideMode(false)}
                    style={styles.overrideCancelBtn}
                  >
                    <Text style={{ color: colors.muted, fontWeight: "600" }}>
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleSaveOverride}
                    style={[
                      styles.overrideSaveBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                      Save Override
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Action Footer */}
          <View
            style={[
              styles.footer,
              { borderTopColor: isDark ? colors.border : "#E2E8F0" },
            ]}
          >
            {isRoutineClass ? (
              <View style={styles.routineActionGrid}>
                <Pressable
                  onPress={() => setIsOverrideMode(!isOverrideMode)}
                  style={({ pressed }) => [
                    styles.routineBtn,
                    {
                      backgroundColor: colors.primarySoft,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="tune"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.routineBtnText, { color: colors.primary }]}
                  >
                    Personal Override
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleCancelOccurrence}
                  style={({ pressed }) => [
                    styles.routineBtn,
                    {
                      backgroundColor: "#FEE2E2",
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-remove"
                    size={16}
                    color="#DC2626"
                  />
                  <Text style={[styles.routineBtnText, { color: "#DC2626" }]}>
                    Cancel Class
                  </Text>
                </Pressable>
              </View>
            ) : isTask ? (
              <View style={styles.taskActionRow}>
                {onToggleComplete ? (
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      onToggleComplete(event);
                      onClose();
                    }}
                    style={[
                      styles.taskMainBtn,
                      {
                        backgroundColor: event.is_completed
                          ? "#4B5563"
                          : "#10B981",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={
                        event.is_completed
                          ? "undo-variant"
                          : "checkbox-marked-circle-outline"
                      }
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.taskMainBtnText}>
                      {event.is_completed ? "Mark Pending" : "Mark Completed"}
                    </Text>
                  </Pressable>
                ) : null}

                {onEditTask ? (
                  <Pressable
                    onPress={() => {
                      onEditTask(event);
                      onClose();
                    }}
                    style={[
                      styles.iconCircleBtn,
                      { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </Pressable>
                ) : null}

                {onDeleteTask ? (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        "Delete Task?",
                        `Are you sure you want to remove "${event.title}"?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => {
                              onDeleteTask(event.id);
                              onClose();
                            },
                          },
                        ]
                      );
                    }}
                    style={[styles.iconCircleBtn, { backgroundColor: "#FEE2E2" }]}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color="#DC2626"
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  cancelledBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  cancelledBadgeText: {
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "800",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  completedBadgeText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "800",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 1,
  },
  descWrap: {
    marginTop: 8,
    gap: 4,
  },
  descLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  descText: {
    fontSize: 13,
    lineHeight: 18,
  },
  overrideBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  overrideHeading: {
    fontSize: 13,
    fontWeight: "800",
  },
  overrideSub: {
    fontSize: 11,
    marginBottom: 4,
  },
  overrideInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  overrideBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  overrideCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overrideSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  routineActionGrid: {
    flexDirection: "row",
    gap: 10,
  },
  routineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  routineBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  taskActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskMainBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  taskMainBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  iconCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
