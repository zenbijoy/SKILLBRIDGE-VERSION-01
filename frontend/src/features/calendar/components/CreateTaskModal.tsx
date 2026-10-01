import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CalendarEvent, CalendarEventType, EventPriority } from "../types";
import { useTheme, radius } from "@/theme";
import { EVENT_TYPE_CONFIG } from "../constants";
import { formatDateIso } from "../utils/dateUtils";
import { triggerHaptic } from "@/components/ui";

interface CreateTaskModalProps {
  visible: boolean;
  initialDateIso?: string;
  initialData?: CalendarEvent | null;
  onClose: () => void;
  onSave: (eventData: Partial<CalendarEvent>) => void;
}

const SELECTABLE_TYPES: CalendarEventType[] = [
  "ASSIGNMENT",
  "QUIZ",
  "EXAM",
  "PROJECT",
  "PRESENTATION",
  "DEADLINE",
  "PERSONAL_TASK",
  "OTHER",
];

export function CreateTaskModal({
  visible,
  initialDateIso,
  initialData,
  onClose,
  onSave,
}: CreateTaskModalProps) {
  const { colors, isDark } = useTheme();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [eventType, setEventType] = useState<CalendarEventType>(
    initialData?.event_type ?? "ASSIGNMENT"
  );
  const [courseCode, setCourseCode] = useState(
    initialData?.course_code ?? ""
  );
  const [date, setDate] = useState(
    initialData?.date ?? initialDateIso ?? formatDateIso(new Date())
  );
  const [startTime, setStartTime] = useState(
    initialData?.start_time ?? "10:00"
  );
  const [endTime] = useState(initialData?.end_time ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [priority, setPriority] = useState<EventPriority>(
    initialData?.priority ?? "medium"
  );

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter a title for this academic task.");
      return;
    }
    if (!date.trim() || !startTime.trim()) {
      Alert.alert("Date & Time Required", "Please specify a valid date and time.");
      return;
    }

    triggerHaptic();
    onSave({
      id: initialData?.id,
      title: title.trim(),
      event_type: eventType,
      course_code: courseCode.trim().toUpperCase() || null,
      date: date.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim() || null,
      location: location.trim() || null,
      description: description.trim() || null,
      priority,
      is_completed: initialData?.is_completed ?? false,
    });
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
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {initialData ? "Edit Academic Task" : "Create Academic Task"}
              </Text>
              <Text style={[styles.headerSub, { color: colors.muted }]}>
                Assignments, Quizzes, Exams & Deadlines
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Event Type Pills Selector */}
            <Text style={[styles.label, { color: colors.muted, marginBottom: 6 }]}>
              Event Category *
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typesRow}>
                {SELECTABLE_TYPES.map((t) => {
                  const cfg = EVENT_TYPE_CONFIG[t];
                  const isSelected = eventType === t;
                  const accent = isDark ? cfg.darkColor : cfg.lightColor;

                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        triggerHaptic();
                        setEventType(t);
                      }}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: isSelected
                            ? accent
                            : isDark
                            ? colors.surface2
                            : "#F1F5F9",
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={cfg.icon as any}
                        size={13}
                        color={isSelected ? "#FFFFFF" : accent}
                      />
                      <Text
                        style={[
                          styles.typePillText,
                          {
                            color: isSelected ? "#FFFFFF" : colors.text,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {cfg.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Task Title *
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. DLD Lab Report 2, Midterm Exam"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            {/* Course Code & Priority */}
            <View style={styles.rowInputs}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Course Code (Optional)
                </Text>
                <TextInput
                  value={courseCode}
                  onChangeText={setCourseCode}
                  placeholder="e.g. CSE 2104"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>

              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Priority
                </Text>
                <View style={styles.prioritySelector}>
                  {(["low", "medium", "high"] as const).map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => {
                        triggerHaptic();
                        setPriority(p);
                      }}
                      style={[
                        styles.priorityBtn,
                        priority === p && {
                          backgroundColor:
                            p === "high"
                              ? "#DC2626"
                              : p === "medium"
                              ? "#D97706"
                              : "#4B5563",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityBtnText,
                          {
                            color: priority === p ? "#FFFFFF" : colors.muted,
                            fontWeight: priority === p ? "700" : "500",
                          },
                        ]}
                      >
                        {p.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Date and Time */}
            <View style={styles.rowInputs}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Date (YYYY-MM-DD) *
                </Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-10-05"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>

              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Time (24h) *
                </Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="11:59"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: isDark ? colors.border : "#CBD5E1",
                      backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    },
                  ]}
                />
              </View>
            </View>

            {/* Location / Room */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Location / Room (Optional)
              </Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Room 402, Exam Hall B"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />
            </View>

            {/* Notes / Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Notes & Syllabus Details (Optional)
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Chapters 1-4, submit report in PDF via portal"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    minHeight: 70,
                    textAlignVertical: "top",
                  },
                ]}
              />
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer Save Button */}
          <View
            style={[
              styles.footer,
              { borderTopColor: isDark ? colors.border : "#E2E8F0" },
            ]}
          >
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {initialData ? "Update Task" : "Add to Calendar"}
              </Text>
            </Pressable>
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
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  typesRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
    marginBottom: 12,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  typePillText: {
    fontSize: 11,
  },
  inputGroup: {
    gap: 5,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  inputHalf: {
    flex: 1,
    gap: 5,
  },
  prioritySelector: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.sm,
    overflow: "hidden",
    height: 40,
  },
  priorityBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityBtnText: {
    fontSize: 10,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
