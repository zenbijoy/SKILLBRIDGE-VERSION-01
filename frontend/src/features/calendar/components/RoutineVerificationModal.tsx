import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { AcademicRoutine, RoutineEntry } from "../types";
import { useTheme, radius } from "@/theme";
import { formatTime12h } from "../utils/dateUtils";
import { DAYS_OF_WEEK } from "../constants";
import { triggerHaptic } from "@/components/ui";
import { ManualClassModal } from "./ManualClassModal";

interface RoutineVerificationModalProps {
  visible: boolean;
  routine: AcademicRoutine | null;
  onClose: () => void;
  onActivated: (activatedRoutine: AcademicRoutine) => void;
}

export function RoutineVerificationModal({
  visible,
  routine,
  onClose,
  onActivated,
}: RoutineVerificationModalProps) {
  const { colors, isDark } = useTheme();

  // Local copy of entries to allow editing before confirmation
  const [entries, setEntries] = useState<RoutineEntry[]>(
    routine?.entries ?? []
  );
  const [isVerifiedChecked, setIsVerifiedChecked] = useState(false);
  const [shareWithClass, setShareWithClass] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Selected entry for manual editing
  const [editingEntry, setEditingEntry] = useState<{
    entry: RoutineEntry | null;
    index: number;
    isOpen: boolean;
  }>({
    entry: null,
    index: -1,
    isOpen: false,
  });

  // Keep entries in sync when routine changes
  React.useEffect(() => {
    if (routine?.entries) {
      setEntries(routine.entries);
    }
  }, [routine]);

  if (!routine) return null;

  const conflicts = routine.raw_metadata?.conflicts ?? [];
  const hasAmbiguity =
    routine.raw_metadata?.hasAmbiguity ||
    entries.some((e) => e.confidence === "ambiguous" || e.confidence === "low");

  const handleEditEntry = (entry: RoutineEntry, index: number) => {
    triggerHaptic();
    setEditingEntry({
      entry,
      index,
      isOpen: true,
    });
  };

  const handleSaveEditedEntry = async (saved: RoutineEntry) => {
    let nextEntries = [...entries];
    if (editingEntry.index >= 0) {
      nextEntries[editingEntry.index] = {
        ...saved,
        confidence: "high", // verified by user!
        warnings: [],
      };
    } else {
      nextEntries.push({
        ...saved,
        confidence: "high",
      });
    }
    setEntries(nextEntries);
    setEditingEntry({ entry: null, index: -1, isOpen: false });

    // Persist edits to backend draft routine
    try {
      await api(`/calendar/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({ entries: nextEntries }),
      });
    } catch (e) {
      console.warn("Could not sync edit draft", e);
    }
  };

  const handleDeleteEntry = async (index: number) => {
    triggerHaptic();
    const nextEntries = entries.filter((_, idx) => idx !== index);
    setEntries(nextEntries);

    try {
      await api(`/calendar/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({ entries: nextEntries }),
      });
    } catch (e) {
      console.warn("Could not sync delete draft", e);
    }
  };

  const handleAddNewClass = () => {
    triggerHaptic();
    setEditingEntry({
      entry: null,
      index: -1,
      isOpen: true,
    });
  };

  const handleConfirmAndActivate = async () => {
    if (!isVerifiedChecked) {
      Alert.alert(
        "Verification Required",
        "Please check 'I have reviewed and verified my timetable' before activating calendar reminders."
      );
      return;
    }

    if (entries.length === 0) {
      Alert.alert(
        "No Classes",
        "Your routine has no classes. Please add at least one class."
      );
      return;
    }

    triggerHaptic();
    setIsActivating(true);

    try {
      // 1. Activate routine
      const activateResp = await api<{
        success: boolean;
        routine: AcademicRoutine;
      }>(`/calendar/routines/${routine.id}/activate`, {
        method: "POST",
      });

      // 2. If share with class was selected, toggle public share
      if (shareWithClass) {
        await api(`/calendar/routines/${routine.id}/share`, {
          method: "POST",
          body: JSON.stringify({ isPublic: true }),
        });
      }

      setIsActivating(false);
      Alert.alert(
        "Routine Activated! 🎉",
        "Your academic timetable is now active. SkillBridge will display your classes and upcoming tasks on your calendar."
      );
      onActivated(activateResp.routine);
    } catch (error: any) {
      setIsActivating(false);
      Alert.alert("Activation Error", error.message || "Failed to activate routine.");
    }
  };

  // Group entries by Day of Week for readable review
  const entriesByDay = DAYS_OF_WEEK.map((day) => ({
    day,
    items: entries
      .map((entry, index) => ({ entry, index }))
      .filter((item) => item.entry.day_of_week === day)
      .sort((a, b) =>
        a.entry.start_time.localeCompare(b.entry.start_time)
      ),
  })).filter((group) => group.items.length > 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.bg : "#F8FAFC" },
        ]}
      >
        {/* Top Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Review & Verify Routine
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
              {routine.academic_group} • {entries.length} classes extracted
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Ambiguity or Conflict Warning Banner */}
          {hasAmbiguity || conflicts.length > 0 ? (
            <View
              style={[
                styles.warningBanner,
                {
                  backgroundColor: isDark ? "#451A03" : "#FEF3C7",
                  borderColor: isDark ? "#78350F" : "#FDE68A",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="alert-outline"
                size={22}
                color="#D97706"
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.warningBannerTitle, { color: "#92400E" }]}>
                  Attention Needed
                </Text>
                <Text style={[styles.warningBannerText, { color: "#B45309" }]}>
                  The AI detected possible ambiguities or overlapping time
                  slots. Tap [Edit] on entries marked with ⚠ to verify or fix
                  them.
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.successBanner,
                {
                  backgroundColor: isDark ? "#064E3B" : "#ECFDF5",
                  borderColor: isDark ? "#047857" : "#A7F3D0",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={20}
                color="#059669"
              />
              <Text style={[styles.successBannerText, { color: "#065F46" }]}>
                Routine extracted cleanly. Review your schedule below before
                activating reminders.
              </Text>
            </View>
          )}

          {/* Quick Add Class Action */}
          <View style={styles.listHeaderRow}>
            <Text style={[styles.listHeaderTitle, { color: colors.text }]}>
              Extracted Schedule
            </Text>
            <Pressable
              onPress={handleAddNewClass}
              style={({ pressed }) => [
                styles.addClassBtn,
                {
                  backgroundColor: colors.primarySoft,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="plus"
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.addClassBtnText, { color: colors.primary }]}>
                Add Class Manually
              </Text>
            </Pressable>
          </View>

          {/* Day-by-Day Extracted Entries */}
          {entriesByDay.map((group) => (
            <View key={group.day} style={styles.dayGroupWrap}>
              <View style={styles.dayGroupHeader}>
                <Text
                  style={[styles.dayGroupName, { color: colors.primary }]}
                >
                  {group.day}
                </Text>
                <Text
                  style={[styles.dayGroupCount, { color: colors.muted }]}
                >
                  {group.items.length} classes
                </Text>
              </View>

              <View style={styles.dayCardsList}>
                {group.items.map(({ entry, index }) => {
                  const isAmbiguous =
                    entry.confidence === "ambiguous" ||
                    entry.confidence === "low" ||
                    (entry.warnings && entry.warnings.length > 0);

                  return (
                    <View
                      key={`${entry.course_code}-${index}`}
                      style={[
                        styles.entryCard,
                        {
                          backgroundColor: isDark
                            ? colors.surface
                            : "#FFFFFF",
                          borderColor: isAmbiguous
                            ? "#F59E0B"
                            : isDark
                            ? colors.border
                            : "#E2E8F0",
                          borderLeftColor: isAmbiguous
                            ? "#F59E0B"
                            : entry.type === "LAB"
                            ? "#7C3AED"
                            : colors.primary,
                        },
                      ]}
                    >
                      <View style={styles.cardMain}>
                        <View style={styles.cardTitleRow}>
                          <Text
                            style={[
                              styles.courseCodeText,
                              { color: colors.text },
                            ]}
                          >
                            {entry.course_code}
                          </Text>

                          <View
                            style={[
                              styles.typePill,
                              {
                                backgroundColor:
                                  entry.type === "LAB"
                                    ? "#F5F3FF"
                                    : "#EFF6FF",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.typePillText,
                                {
                                  color:
                                    entry.type === "LAB"
                                      ? "#7C3AED"
                                      : "#2563EB",
                                },
                              ]}
                            >
                              {entry.type}
                            </Text>
                          </View>

                          {isAmbiguous ? (
                            <View style={styles.ambiguousBadge}>
                              <MaterialCommunityIcons
                                name="alert-circle"
                                size={12}
                                color="#D97706"
                              />
                              <Text style={styles.ambiguousBadgeText}>
                                Review
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.verifiedBadge}>
                              <MaterialCommunityIcons
                                name="check"
                                size={12}
                                color="#059669"
                              />
                              <Text style={styles.verifiedBadgeText}>
                                High Conf.
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text
                          style={[
                            styles.courseTitleText,
                            { color: colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {entry.course_title}
                        </Text>

                        <View style={styles.cardDetailsRow}>
                          <View style={styles.detailItem}>
                            <MaterialCommunityIcons
                              name="clock-outline"
                              size={13}
                              color={colors.muted}
                            />
                            <Text
                              style={[
                                styles.detailItemText,
                                { color: colors.text },
                              ]}
                            >
                              {formatTime12h(entry.start_time)} -{" "}
                              {formatTime12h(entry.end_time)}
                            </Text>
                          </View>

                          {entry.room ? (
                            <View style={styles.detailItem}>
                              <MaterialCommunityIcons
                                name="door"
                                size={13}
                                color={colors.muted}
                              />
                              <Text
                                style={[
                                  styles.detailItemText,
                                  { color: colors.text },
                                ]}
                              >
                                Room {entry.room}
                              </Text>
                            </View>
                          ) : null}

                          {entry.instructor ? (
                            <View style={styles.detailItem}>
                              <MaterialCommunityIcons
                                name="account-outline"
                                size={13}
                                color={colors.muted}
                              />
                              <Text
                                style={[
                                  styles.detailItemText,
                                  { color: colors.text },
                                ]}
                                numberOfLines={1}
                              >
                                {entry.instructor}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Warnings if any */}
                        {entry.warnings && entry.warnings.length > 0 ? (
                          <View style={styles.warningsRow}>
                            {entry.warnings.map((w, wIdx) => (
                              <Text key={wIdx} style={styles.warningItemText}>
                                • {w}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                      </View>

                      {/* Card Actions (Edit, Delete) */}
                      <View style={styles.cardActionsCol}>
                        <Pressable
                          onPress={() => handleEditEntry(entry, index)}
                          style={({ pressed }) => [
                            styles.actionIconBtn,
                            {
                              backgroundColor: colors.primarySoft,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="pencil-outline"
                            size={16}
                            color={colors.primary}
                          />
                        </Pressable>

                        <Pressable
                          onPress={() => handleDeleteEntry(index)}
                          style={({ pressed }) => [
                            styles.actionIconBtn,
                            {
                              backgroundColor: "#FEE2E2",
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="trash-can-outline"
                            size={16}
                            color="#DC2626"
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Public Class Sharing Option */}
          <View
            style={[
              styles.shareCard,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: isDark ? colors.border : "#E2E8F0",
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.shareTitle, { color: colors.text }]}>
                Share with classmates
              </Text>
              <Text style={[styles.shareSub, { color: colors.muted }]}>
                Make this routine discoverable by students in{" "}
                <Text style={{ fontWeight: "700", color: colors.text }}>
                  {routine.academic_group}
                </Text>
              </Text>
            </View>
            <Switch
              value={shareWithClass}
              onValueChange={setShareWithClass}
              trackColor={{ false: "#CBD5E1", true: colors.primary }}
            />
          </View>

          {/* Mandatory User Verification Checkbox */}
          <Pressable
            onPress={() => setIsVerifiedChecked(!isVerifiedChecked)}
            style={({ pressed }) => [
              styles.checkboxRow,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <MaterialCommunityIcons
              name={
                isVerifiedChecked
                  ? "checkbox-marked"
                  : "checkbox-blank-outline"
              }
              size={24}
              color={isVerifiedChecked ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.checkboxLabel,
                { color: colors.text, fontWeight: "600" },
              ]}
            >
              I have reviewed and verified my timetable. SkillBridge will use
              this schedule for my academic calendar and reminders.
            </Text>
          </Pressable>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Activation Bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderTopColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <Pressable
            onPress={handleConfirmAndActivate}
            disabled={!isVerifiedChecked || isActivating}
            style={({ pressed }) => [
              styles.activateBtn,
              {
                backgroundColor: isVerifiedChecked
                  ? colors.primary
                  : isDark
                  ? "#334155"
                  : "#94A3B8",
                opacity: pressed || isActivating ? 0.8 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="check-decagram"
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.activateBtnText}>
              {isActivating ? "Activating..." : "Confirm & Activate Routine"}
            </Text>
          </Pressable>
        </View>

        {/* Manual Edit Sub-Modal */}
        {editingEntry.isOpen ? (
          <ManualClassModal
            visible={editingEntry.isOpen}
            initialData={editingEntry.entry}
            onClose={() =>
              setEditingEntry({ entry: null, index: -1, isOpen: false })
            }
            onSave={handleSaveEditedEntry}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  warningBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  warningBannerText: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  addClassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  addClassBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dayGroupWrap: {
    marginBottom: 16,
  },
  dayGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dayGroupName: {
    fontSize: 14,
    fontWeight: "800",
  },
  dayGroupCount: {
    fontSize: 11,
  },
  dayCardsList: {
    gap: 8,
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  cardMain: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  courseCodeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  typePill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "700",
  },
  ambiguousBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ambiguousBadgeText: {
    color: "#D97706",
    fontSize: 9,
    fontWeight: "700",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  verifiedBadgeText: {
    color: "#059669",
    fontSize: 9,
    fontWeight: "700",
  },
  courseTitleText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
    flexWrap: "wrap",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailItemText: {
    fontSize: 11,
    fontWeight: "500",
  },
  warningsRow: {
    marginTop: 4,
  },
  warningItemText: {
    fontSize: 10,
    color: "#D97706",
    fontWeight: "500",
  },
  cardActionsCol: {
    gap: 8,
    marginLeft: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginVertical: 12,
  },
  shareTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  shareSub: {
    fontSize: 11,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  checkboxLabel: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  activateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  activateBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
