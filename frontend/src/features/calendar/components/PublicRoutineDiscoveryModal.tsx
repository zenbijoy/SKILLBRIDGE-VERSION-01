import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { AcademicProfile, AcademicRoutine } from "../types";
import { useTheme, radius } from "@/theme";
import { formatTime12h } from "../utils/dateUtils";
import { triggerHaptic } from "@/components/ui";

interface PublicRoutineDiscoveryModalProps {
  visible: boolean;
  profile?: AcademicProfile | null;
  onClose: () => void;
  onCopySuccess: (newRoutine: AcademicRoutine) => void;
}

export function PublicRoutineDiscoveryModal({
  visible,
  profile,
  onClose,
  onCopySuccess,
}: PublicRoutineDiscoveryModalProps) {
  const { colors, isDark } = useTheme();

  const [routines, setRoutines] = useState<AcademicRoutine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoutine, setSelectedRoutine] =
    useState<AcademicRoutine | null>(null);

  // Report issue sub-dialog
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportRoutineId, setReportRoutineId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadPublicRoutines();
    }
  }, [visible, profile?.academic_group]);

  const loadPublicRoutines = async () => {
    setIsLoading(true);
    try {
      const resp = await api<{ routines: AcademicRoutine[] }>(
        "/calendar/routines/discover"
      );
      setRoutines(resp.routines || []);
    } catch (e) {
      console.warn("Could not load public routines", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRoutine = async (routine: AcademicRoutine) => {
    triggerHaptic();
    Alert.alert(
      "Use This Routine?",
      `This will create your active timetable using the routine shared for ${routine.academic_group}. You will be able to customize your personal overrides anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use Schedule",
          onPress: async () => {
            try {
              const resp = await api<{
                success: boolean;
                routine: AcademicRoutine;
              }>(`/calendar/routines/${routine.id}/copy`, {
                method: "POST",
              });
              Alert.alert(
                "Routine Activated!",
                "You are now using this verified class routine."
              );
              onCopySuccess(resp.routine);
              onClose();
            } catch (err: any) {
              Alert.alert(
                "Copy Failed",
                err.message || "Could not copy routine."
              );
            }
          },
        },
      ]
    );
  };

  const handleConfirmRoutine = async (routineId: string) => {
    triggerHaptic();
    try {
      await api(`/calendar/routines/${routineId}/validate`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm" }),
      });
      Alert.alert(
        "Thank you!",
        "Your community confirmation helps your classmates trust this routine."
      );
      loadPublicRoutines();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to confirm routine.");
    }
  };

  const handleSubmitReport = async () => {
    if (!reportRoutineId || !reportReason.trim()) {
      Alert.alert("Please provide details of what is incorrect.");
      return;
    }
    triggerHaptic();
    try {
      await api(`/calendar/routines/${reportRoutineId}/validate`, {
        method: "POST",
        body: JSON.stringify({
          action: "report",
          reason: reportReason.trim(),
        }),
      });
      setIsReportOpen(false);
      setReportReason("");
      Alert.alert(
        "Report Submitted",
        "Thank you for keeping the academic schedule accurate. Other students will see this warning."
      );
      loadPublicRoutines();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.bg : "#F8FAFC" },
        ]}
      >
        {/* Header */}
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
              Class Routines
            </Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              Shared by students in{" "}
              <Text style={{ fontWeight: "700", color: colors.primary }}>
                {profile?.academic_group || "your academic group"}
              </Text>
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>
              Finding matching class routines...
            </Text>
          </View>
        ) : routines.length === 0 ? (
          <View style={styles.centerBox}>
            <MaterialCommunityIcons
              name="calendar-search"
              size={52}
              color={colors.muted}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Shared Routines Yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              Be the first student to upload a routine for{" "}
              {profile?.academic_group}! You can import your semester PDF and
              share it with classmates.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {routines.map((rt) => {
              const confirmedCount = rt.confirmedCount ?? 0;
              const reportedCount = rt.reportedCount ?? 0;
              const isSelected = selectedRoutine?.id === rt.id;

              return (
                <View
                  key={rt.id}
                  style={[
                    styles.routineCard,
                    {
                      backgroundColor: isDark ? colors.surface : "#FFFFFF",
                      borderColor:
                        reportedCount > 0
                          ? "#F59E0B"
                          : isDark
                          ? colors.border
                          : "#E2E8F0",
                    },
                  ]}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.routineTitle, { color: colors.text }]}
                      >
                        {rt.title}
                      </Text>
                      <Text
                        style={[styles.uploaderText, { color: colors.muted }]}
                      >
                        Shared by{" "}
                        <Text style={{ fontWeight: "600", color: colors.text }}>
                          {rt.uploader?.full_name ?? "Classmate"}
                        </Text>{" "}
                        • v{rt.version}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.groupTag,
                        { backgroundColor: colors.primarySoft },
                      ]}
                    >
                      <Text
                        style={[styles.groupTagText, { color: colors.primary }]}
                      >
                        {rt.academic_group}
                      </Text>
                    </View>
                  </View>

                  {/* Trust & Community Badges */}
                  <View style={styles.trustRow}>
                    <View style={styles.trustBadgeGreen}>
                      <MaterialCommunityIcons
                        name="check-decagram"
                        size={14}
                        color="#059669"
                      />
                      <Text style={styles.trustBadgeGreenText}>
                        {confirmedCount === 0
                          ? "Student verified"
                          : `Confirmed by ${confirmedCount} students`}
                      </Text>
                    </View>

                    {reportedCount > 0 ? (
                      <View style={styles.trustBadgeOrange}>
                        <MaterialCommunityIcons
                          name="alert-outline"
                          size={14}
                          color="#D97706"
                        />
                        <Text style={styles.trustBadgeOrangeText}>
                          {reportedCount}{" "}
                          {reportedCount === 1 ? "issue" : "issues"} reported
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Preview Timetable Accordion */}
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setSelectedRoutine(isSelected ? null : rt);
                    }}
                    style={styles.previewToggle}
                  >
                    <Text
                      style={[
                        styles.previewToggleText,
                        { color: colors.primary },
                      ]}
                    >
                      {isSelected
                        ? "Hide Timetable Preview"
                        : `Preview Timetable (${rt.entries?.length ?? 0} classes)`}
                    </Text>
                    <MaterialCommunityIcons
                      name={isSelected ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.primary}
                    />
                  </Pressable>

                  {/* Preview List */}
                  {isSelected && rt.entries ? (
                    <View
                      style={[
                        styles.previewContainer,
                        {
                          backgroundColor: isDark
                            ? colors.surface2
                            : "#F8FAFC",
                        },
                      ]}
                    >
                      {rt.entries.map((item, idx) => (
                        <View key={idx} style={styles.previewItem}>
                          <Text
                            style={[
                              styles.previewItemDay,
                              { color: colors.primary },
                            ]}
                          >
                            {item.day_of_week.slice(0, 3)}:
                          </Text>
                          <Text
                            style={[
                              styles.previewItemCourse,
                              { color: colors.text },
                            ]}
                          >
                            {item.course_code}
                          </Text>
                          <Text
                            style={[
                              styles.previewItemTime,
                              { color: colors.muted },
                            ]}
                          >
                            {formatTime12h(item.start_time)} -{" "}
                            {formatTime12h(item.end_time)}
                          </Text>
                          {item.room ? (
                            <Text
                              style={[
                                styles.previewItemRoom,
                                { color: colors.muted },
                              ]}
                            >
                              R: {item.room}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Action Buttons */}
                  <View style={styles.cardActionRow}>
                    <Pressable
                      onPress={() => handleCopyRoutine(rt)}
                      style={[
                        styles.useBtn,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="calendar-plus"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.useBtnText}>Use This Routine</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleConfirmRoutine(rt.id)}
                      style={[
                        styles.confirmBtn,
                        { backgroundColor: colors.primarySoft },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="thumb-up-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.confirmBtnText,
                          { color: colors.primary },
                        ]}
                      >
                        Looks Correct
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setReportRoutineId(rt.id);
                        setIsReportOpen(true);
                      }}
                      style={[styles.reportBtn, { backgroundColor: "#FEF2F2" }]}
                    >
                      <MaterialCommunityIcons
                        name="flag-outline"
                        size={16}
                        color="#DC2626"
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* Report Issue Modal */}
        <Modal visible={isReportOpen} transparent animationType="fade">
          <View style={styles.reportOverlay}>
            <View
              style={[
                styles.reportCard,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                },
              ]}
            >
              <Text style={[styles.reportTitle, { color: colors.text }]}>
                Report an Issue with Routine
              </Text>
              <Text style={[styles.reportSub, { color: colors.muted }]}>
                Help your classmates by specifying what is inaccurate (e.g.
                wrong room, wrong time, or outdated schedule).
              </Text>

              <TextInput
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Describe what is incorrect..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[
                  styles.reportInput,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />

              <View style={styles.reportBtnRow}>
                <Pressable
                  onPress={() => {
                    setIsReportOpen(false);
                    setReportReason("");
                  }}
                  style={styles.reportCancelBtn}
                >
                  <Text style={{ color: colors.muted, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleSubmitReport}
                  style={[
                    styles.reportSubmitBtn,
                    { backgroundColor: "#DC2626" },
                  ]}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    Submit Report
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  routineCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  routineTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  uploaderText: {
    fontSize: 11,
    marginTop: 2,
  },
  groupTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  groupTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  trustBadgeGreen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  trustBadgeGreenText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "700",
  },
  trustBadgeOrange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  trustBadgeOrangeText: {
    color: "#D97706",
    fontSize: 10,
    fontWeight: "700",
  },
  previewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  previewToggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewContainer: {
    padding: 10,
    borderRadius: radius.sm,
    gap: 6,
  },
  previewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewItemDay: {
    fontSize: 11,
    fontWeight: "700",
    width: 32,
  },
  previewItemCourse: {
    fontSize: 12,
    fontWeight: "700",
    width: 75,
  },
  previewItemTime: {
    fontSize: 11,
    flex: 1,
  },
  previewItemRoom: {
    fontSize: 11,
  },
  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  useBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  useBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  reportBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  reportCard: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  reportSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  reportInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: "top",
  },
  reportBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 6,
  },
  reportCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reportSubmitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
});
