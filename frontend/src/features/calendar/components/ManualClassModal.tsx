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
import type { DayOfWeek, RoutineEntry } from "../types";
import { useTheme, radius } from "@/theme";
import { DAYS_OF_WEEK } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface ManualClassModalProps {
  visible: boolean;
  initialData?: RoutineEntry | null;
  onClose: () => void;
  onSave: (entry: RoutineEntry) => void;
}

export function ManualClassModal({
  visible,
  initialData,
  onClose,
  onSave,
}: ManualClassModalProps) {
  const { colors, isDark } = useTheme();

  const [courseCode, setCourseCode] = useState(
    initialData?.course_code ?? ""
  );
  const [courseTitle, setCourseTitle] = useState(
    initialData?.course_title ?? ""
  );
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    initialData?.day_of_week ?? "Sunday"
  );
  const [startTime, setStartTime] = useState(
    initialData?.start_time ?? "10:00"
  );
  const [endTime, setEndTime] = useState(
    initialData?.end_time ?? "11:00"
  );
  const [room, setRoom] = useState(initialData?.room ?? "");
  const [instructor, setInstructor] = useState(
    initialData?.instructor ?? ""
  );
  const [type, setType] = useState<"CLASS" | "LAB" | "OTHER">(
    initialData?.type ?? "CLASS"
  );

  const handleSave = () => {
    if (!courseCode.trim()) {
      Alert.alert("Course Code Required", "Please enter course code (e.g. CSE 2103)");
      return;
    }
    if (!startTime.trim() || !endTime.trim()) {
      Alert.alert("Time Required", "Please enter start and end time (e.g. 10:00 and 11:00)");
      return;
    }

    triggerHaptic();
    onSave({
      id: initialData?.id,
      course_code: courseCode.trim().toUpperCase(),
      course_title: courseTitle.trim() || courseCode.trim().toUpperCase(),
      day_of_week: dayOfWeek,
      start_time: startTime.trim(),
      end_time: endTime.trim(),
      room: room.trim() || null,
      instructor: instructor.trim() || null,
      type,
      confidence: "high",
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {initialData ? "Edit Class" : "Add Routine Class"}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Type selector: CLASS vs LAB */}
            <View style={styles.typeSelectorRow}>
              {(["CLASS", "LAB", "OTHER"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => {
                    triggerHaptic();
                    setType(t);
                  }}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor:
                        type === t
                          ? colors.primary
                          : isDark
                          ? colors.surface2
                          : "#F1F5F9",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      { color: type === t ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {t === "CLASS" ? "Theory Class" : t === "LAB" ? "Lab / Sessional" : "Other"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Course Code & Title */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Course Code *
              </Text>
              <TextInput
                value={courseCode}
                onChangeText={setCourseCode}
                placeholder="e.g. CSE 2103"
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

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Course Title
              </Text>
              <TextInput
                value={courseTitle}
                onChangeText={setCourseTitle}
                placeholder="e.g. Data Structures & Algorithms"
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

            {/* Day of Week Selector */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>
                Day of Week *
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => {
                        triggerHaptic();
                        setDayOfWeek(d);
                      }}
                      style={[
                        styles.dayPill,
                        {
                          backgroundColor:
                            dayOfWeek === d
                              ? colors.primary
                              : isDark
                              ? colors.surface2
                              : "#F1F5F9",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayPillText,
                          {
                            color: dayOfWeek === d ? "#FFFFFF" : colors.text,
                            fontWeight: dayOfWeek === d ? "700" : "500",
                          },
                        ]}
                      >
                        {d.slice(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Start and End Times */}
            <View style={styles.rowInputs}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Start Time (24h) *
                </Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="10:00"
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
                  End Time (24h) *
                </Text>
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="11:00"
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

            {/* Room and Instructor */}
            <View style={styles.rowInputs}>
              <View style={styles.inputHalf}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Room Number
                </Text>
                <TextInput
                  value={room}
                  onChangeText={setRoom}
                  placeholder="e.g. 301, Lab 2"
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
                  Instructor
                </Text>
                <TextInput
                  value={instructor}
                  onChangeText={setInstructor}
                  placeholder="e.g. Prof. Rahman"
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
                {initialData ? "Update Class" : "Save Class"}
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
    maxHeight: "85%",
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
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  typeSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inputGroup: {
    gap: 5,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  daysRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  dayPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dayPillText: {
    fontSize: 12,
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
