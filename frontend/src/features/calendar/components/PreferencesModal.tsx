import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { AcademicNotificationPreferences } from "../types";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface PreferencesModalProps {
  visible: boolean;
  preferences?: AcademicNotificationPreferences | null;
  onClose: () => void;
  onSaved: (newPrefs: AcademicNotificationPreferences) => void;
}

export function PreferencesModal({
  visible,
  preferences,
  onClose,
  onSaved,
}: PreferencesModalProps) {
  const { colors, isDark } = useTheme();

  const [notifyClasses, setNotifyClasses] = useState(
    preferences?.notify_classes ?? true
  );
  const [classLeadMinutes, setClassLeadMinutes] = useState(
    preferences?.class_lead_minutes ?? 60
  );

  const [notifyAssignments, setNotifyAssignments] = useState(
    preferences?.notify_assignments ?? true
  );
  const [assignmentLeadHours, setAssignmentLeadHours] = useState(
    preferences?.assignment_lead_hours ?? 24
  );

  const [notifyExams, setNotifyExams] = useState(
    preferences?.notify_exams ?? true
  );
  const [examLeadHours, setExamLeadHours] = useState(
    preferences?.exam_lead_hours ?? 24
  );

  const [notifyTasks, setNotifyTasks] = useState(
    preferences?.notify_tasks ?? true
  );
  const [taskLeadMinutes, setTaskLeadMinutes] = useState(
    preferences?.task_lead_minutes ?? 30
  );

  const [smartGrouping, setSmartGrouping] = useState(
    preferences?.smart_grouping ?? true
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    triggerHaptic();
    setIsSaving(true);
    try {
      const resp = await api<{
        success: boolean;
        preferences: AcademicNotificationPreferences;
      }>("/calendar/preferences", {
        method: "PUT",
        body: JSON.stringify({
          notify_classes: notifyClasses,
          class_lead_minutes: classLeadMinutes,
          notify_assignments: notifyAssignments,
          assignment_lead_hours: assignmentLeadHours,
          notify_exams: notifyExams,
          exam_lead_hours: examLeadHours,
          notify_tasks: notifyTasks,
          task_lead_minutes: taskLeadMinutes,
          smart_grouping: smartGrouping,
        }),
      });

      setIsSaving(false);
      Alert.alert(
        "Preferences Saved",
        "Your academic reminder settings have been updated."
      );
      onSaved(resp.preferences);
      onClose();
    } catch (e: any) {
      setIsSaving(false);
      Alert.alert("Save Failed", e.message || "Could not update preferences.");
    }
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
                Reminder & Notification Settings
              </Text>
              <Text style={[styles.headerSub, { color: colors.muted }]}>
                Custom lead times for classes, deadlines & exams
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Smart Notification Rule */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>
                  Smart Notification Grouping
                </Text>
                <Text style={[styles.itemSub, { color: colors.muted }]}>
                  Groups multiple morning classes into a single daily briefing
                  reminder to avoid notification clutter.
                </Text>
              </View>
              <Switch
                value={smartGrouping}
                onValueChange={setSmartGrouping}
                trackColor={{ false: "#CBD5E1", true: colors.primary }}
              />
            </View>

            {/* Class Reminders */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>
                    Routine Classes
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.muted }]}>
                    Reminders before every verified class session
                  </Text>
                </View>
                <Switch
                  value={notifyClasses}
                  onValueChange={setNotifyClasses}
                  trackColor={{ false: "#CBD5E1", true: colors.primary }}
                />
              </View>

              {notifyClasses ? (
                <View style={styles.leadTimeSelector}>
                  <Text style={[styles.leadLabel, { color: colors.muted }]}>
                    Lead time:
                  </Text>
                  {[15, 30, 60].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        triggerHaptic();
                        setClassLeadMinutes(m);
                      }}
                      style={[
                        styles.leadBtn,
                        classLeadMinutes === m && {
                          backgroundColor: colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.leadBtnText,
                          {
                            color:
                              classLeadMinutes === m
                                ? "#FFFFFF"
                                : colors.muted,
                          },
                        ]}
                      >
                        {m}m before
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Assignment Deadlines */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>
                    Assignments & Lab Reports
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.muted }]}>
                    Alerts for upcoming deadlines
                  </Text>
                </View>
                <Switch
                  value={notifyAssignments}
                  onValueChange={setNotifyAssignments}
                  trackColor={{ false: "#CBD5E1", true: colors.primary }}
                />
              </View>

              {notifyAssignments ? (
                <View style={styles.leadTimeSelector}>
                  <Text style={[styles.leadLabel, { color: colors.muted }]}>
                    Lead time:
                  </Text>
                  {[12, 24, 48].map((h) => (
                    <Pressable
                      key={h}
                      onPress={() => {
                        triggerHaptic();
                        setAssignmentLeadHours(h);
                      }}
                      style={[
                        styles.leadBtn,
                        assignmentLeadHours === h && {
                          backgroundColor: colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.leadBtnText,
                          {
                            color:
                              assignmentLeadHours === h
                                ? "#FFFFFF"
                                : colors.muted,
                          },
                        ]}
                      >
                        {h === 24 ? "1 day" : h === 48 ? "2 days" : `${h}h`} before
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Exams & Midterms */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>
                    Exams & Quizzes
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.muted }]}>
                    Priority reminders for midterms, quizzes, and finals
                  </Text>
                </View>
                <Switch
                  value={notifyExams}
                  onValueChange={setNotifyExams}
                  trackColor={{ false: "#CBD5E1", true: colors.primary }}
                />
              </View>
            </View>

            {/* Personal Study Tasks */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>
                    Personal Study Tasks
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.muted }]}>
                    Reminders for personal todo tasks
                  </Text>
                </View>
                <Switch
                  value={notifyTasks}
                  onValueChange={setNotifyTasks}
                  trackColor={{ false: "#CBD5E1", true: colors.primary }}
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
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isSaving ? 0.8 : 1,
                },
              ]}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? "Saving..." : "Save Preferences"}
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
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  itemSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  leadTimeSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,150,0.15)",
    paddingTop: 8,
  },
  leadLabel: {
    fontSize: 11,
  },
  leadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
  },
  leadBtnText: {
    fontSize: 10,
    fontWeight: "600",
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
