import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { getSocket } from "@/lib/socket";

export interface AttendanceRecord {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  status: "present" | "left" | "absent";
  joinedAt: string;
  leftAt: string | null;
  durationSeconds: number;
  durationFormatted: string;
  isHost: boolean;
  isManual?: boolean;
}

export interface AttendanceResponse {
  hasActiveSession: boolean;
  session?: {
    id: string;
    media: "audio" | "video";
    status: string;
    startedAt: string;
    title: string;
    hostId: string;
  } | null;
  summary: {
    totalEnrolled: number;
    presentCount: number;
    leftCount: number;
    attendanceRate: number;
    isTeacher?: boolean;
  };
  records: AttendanceRecord[];
}

interface RoomSessionAttendanceModalProps {
  visible: boolean;
  roomId: string;
  roomTitle: string;
  sessionId?: string;
  isTeacher?: boolean;
  onClose: () => void;
}

export function RoomSessionAttendanceModal({
  visible,
  roomId,
  roomTitle,
  sessionId,
  isTeacher,
  onClose,
}: RoomSessionAttendanceModalProps) {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "present" | "left">("all");

  const queryKey = ["room-session-attendance", roomId, sessionId];

  const attendanceQuery = useQuery<AttendanceResponse>({
    queryKey,
    queryFn: () =>
      api<AttendanceResponse>(
        `/rooms/${roomId}/attendance/live${sessionId ? `?sessionId=${sessionId}` : ""}`,
      ),
    enabled: visible && Boolean(roomId),
    refetchInterval: 12_000,
  });

  // Listen for real-time socket attendance events
  useEffect(() => {
    if (!visible || !roomId) return;
    const socket = getSocket();
    if (!socket) return;

    const handleUpdate = () => {
      qc.invalidateQueries({ queryKey });
    };

    socket.on("room:live:attendance_updated", handleUpdate);
    socket.on("room:live:participants", handleUpdate);

    return () => {
      socket.off("room:live:attendance_updated", handleUpdate);
      socket.off("room:live:participants", handleUpdate);
    };
  }, [visible, roomId, qc, queryKey]);

  // Teacher manual override mutation
  const manualMutation = useMutation({
    mutationFn: ({
      targetUserId,
      status,
    }: {
      targetUserId: string;
      status: "present" | "left" | "absent";
    }) =>
      api(`/rooms/${roomId}/attendance/manual`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: attendanceQuery.data?.session?.id || sessionId,
          targetUserId,
          status,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      Alert.alert("Failed to update attendance", err.message);
    },
  });

  const handleExport = async () => {
    triggerHaptic();
    const records = attendanceQuery.data?.records || [];
    if (records.length === 0) {
      Alert.alert("No records", "There are no attendance records to export yet.");
      return;
    }

    const csvContent =
      `SkillBridge Attendance Report: ${roomTitle}\n` +
      `Date: ${new Date().toLocaleDateString()}\n\n` +
      `User ID,Name,Username,Role,Status,Duration,Joined At\n` +
      records
        .map(
          (r) =>
            `"${r.userId}","${r.fullName}","@${r.username}","${r.role}","${r.status}","${r.durationFormatted}","${new Date(r.joinedAt).toLocaleTimeString()}"`,
        )
        .join("\n");

    try {
      await Share.share({
        title: `Attendance Report - ${roomTitle}`,
        message: csvContent,
      });
    } catch (err) {
      console.warn("Could not share attendance report", err);
    }
  };

  const data = attendanceQuery.data;
  const summary = data?.summary || {
    totalEnrolled: 0,
    presentCount: 0,
    leftCount: 0,
    attendanceRate: 0,
  };
  const session = data?.session;
  const records = data?.records || [];

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.username.toLowerCase().includes(search.toLowerCase()) ||
      r.role.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterTab === "present") return r.status === "present";
    if (filterTab === "left") return r.status === "left";
    return true;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <Row style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={colors.primary} />
                <Text style={[s.title, { color: colors.text }]}>Live Session Attendance</Text>
              </Row>
              <Text style={[s.subtitle, { color: colors.muted }]} numberOfLines={1}>
                {roomTitle} {session?.title ? `· ${session.title}` : ""}
              </Text>
            </View>

            <Row style={{ gap: 8 }}>
              {isTeacher && records.length > 0 && (
                <Pressable
                  onPress={handleExport}
                  style={[s.exportBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Export Attendance Report"
                >
                  <MaterialCommunityIcons name="export-variant" size={16} color={colors.text} />
                  <Text style={[s.exportText, { color: colors.text }]}>Export</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={s.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </Row>
          </Row>

          {/* Real-time Summary Cards (Responsive Row) */}
          <View style={s.summaryGrid}>
            <View style={[s.summaryCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Row style={{ alignItems: "center", gap: 6 }}>
                <View style={[s.livePulseDot, { backgroundColor: "#10B981" }]} />
                <Text style={[s.summaryLabel, { color: colors.muted }]}>Present Now</Text>
              </Row>
              <Text style={[s.summaryValue, { color: "#10B981" }]}>{summary.presentCount}</Text>
            </View>

            <View style={[s.summaryCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Total Enrolled</Text>
              <Text style={[s.summaryValue, { color: colors.text }]}>{summary.totalEnrolled}</Text>
            </View>

            <View style={[s.summaryCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[s.summaryLabel, { color: colors.muted }]}>Attendance Rate</Text>
              <Text style={[s.summaryValue, { color: colors.primary }]}>{summary.attendanceRate}%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={[s.progressBarBg, { backgroundColor: colors.surface2 }]}>
            <View
              style={[
                s.progressBarFill,
                {
                  width: `${Math.min(100, summary.attendanceRate)}%`,
                  backgroundColor: summary.attendanceRate >= 75 ? "#10B981" : colors.primary,
                },
              ]}
            />
          </View>

          {/* Search Input */}
          <View style={[s.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search attendee by name, username..."
              placeholderTextColor={colors.muted}
              style={[s.searchInput, { color: colors.text }]}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Filter Sub-Tabs */}
          <Row style={[s.tabRow, { backgroundColor: colors.surface2 }]}>
            <Pressable
              onPress={() => setFilterTab("all")}
              style={[
                s.tabBtn,
                filterTab === "all" && [s.tabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
              ]}
            >
              <Text
                style={[
                  s.tabBtnText,
                  { color: filterTab === "all" ? colors.primary : colors.muted, fontWeight: filterTab === "all" ? "800" : "600" },
                ]}
              >
                All ({records.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterTab("present")}
              style={[
                s.tabBtn,
                filterTab === "present" && [s.tabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
              ]}
            >
              <Text
                style={[
                  s.tabBtnText,
                  { color: filterTab === "present" ? "#10B981" : colors.muted, fontWeight: filterTab === "present" ? "800" : "600" },
                ]}
              >
                Present ({summary.presentCount})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterTab("left")}
              style={[
                s.tabBtn,
                filterTab === "left" && [s.tabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
              ]}
            >
              <Text
                style={[
                  s.tabBtnText,
                  { color: filterTab === "left" ? colors.muted : colors.muted, fontWeight: filterTab === "left" ? "800" : "600" },
                ]}
              >
                Completed ({summary.leftCount})
              </Text>
            </Pressable>
          </Row>

          {/* Attendees Roster */}
          {attendanceQuery.isLoading ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.centerText, { color: colors.muted }]}>Loading attendance roster...</Text>
            </View>
          ) : filteredRecords.length === 0 ? (
            <View style={s.centerBox}>
              <MaterialCommunityIcons name="account-group-outline" size={36} color={colors.muted} />
              <Text style={[s.centerTitle, { color: colors.text }]}>No matching attendees</Text>
              <Text style={[s.centerText, { color: colors.muted }]}>
                {search ? "No students match your search." : "Attendance records will appear as students join."}
              </Text>
            </View>
          ) : (
            <ScrollView style={s.rosterList} showsVerticalScrollIndicator={false}>
              {filteredRecords.map((r) => {
                const isPresent = r.status === "present";
                return (
                  <View
                    key={r.userId}
                    style={[s.attendeeCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                      {/* Avatar */}
                      <View style={s.avatarWrapper}>
                        {r.avatarUrl ? (
                          <Image source={{ uri: r.avatarUrl }} style={s.avatar} />
                        ) : (
                          <View style={[s.avatarFallback, { backgroundColor: colors.primary }]}>
                            <Text style={s.avatarInitial}>{(r.fullName?.[0] || "?").toUpperCase()}</Text>
                          </View>
                        )}
                        <View
                          style={[
                            s.statusDot,
                            { backgroundColor: isPresent ? "#10B981" : colors.muted },
                          ]}
                        />
                      </View>

                      {/* Name & Role */}
                      <View style={{ flex: 1 }}>
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <Text style={[s.attendeeName, { color: colors.text }]} numberOfLines={1}>
                            {r.fullName}
                          </Text>
                          {r.isHost && (
                            <View style={[s.hostBadge, { backgroundColor: `${colors.primary}20` }]}>
                              <Text style={[s.hostBadgeText, { color: colors.primary }]}>HOST</Text>
                            </View>
                          )}
                        </Row>
                        <Text style={[s.attendeeHandle, { color: colors.muted }]}>
                          @{r.username} · Joined {new Date(r.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                    </Row>

                    {/* Status & Duration Chip */}
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <View
                        style={[
                          s.durationChip,
                          {
                            backgroundColor: isPresent ? "rgba(16, 185, 129, 0.15)" : colors.surface,
                            borderColor: isPresent ? "#10B981" : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.durationText,
                            { color: isPresent ? "#10B981" : colors.muted },
                          ]}
                        >
                          {isPresent ? `● ${r.durationFormatted}` : r.durationFormatted}
                        </Text>
                      </View>

                      {/* Teacher Manual Actions */}
                      {isTeacher && !r.isHost && (
                        <Pressable
                          onPress={() =>
                            manualMutation.mutate({
                              targetUserId: r.userId,
                              status: isPresent ? "left" : "present",
                            })
                          }
                          style={[s.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          accessibilityRole="button"
                          accessibilityLabel="Toggle presence"
                        >
                          <MaterialCommunityIcons
                            name={isPresent ? "logout" : "check"}
                            size={16}
                            color={isPresent ? colors.danger : "#10B981"}
                          />
                        </Pressable>
                      )}
                    </Row>
                  </View>
                );
              })}
            </ScrollView>
          )}
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
    maxHeight: "90%",
    width: "100%",
    maxWidth: 720,
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
    marginBottom: 12,
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
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  exportText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  tabRow: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    gap: 4,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    borderWidth: 1,
  },
  tabBtnText: {
    fontSize: 12,
  },
  centerBox: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  centerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  centerText: {
    fontSize: 12,
    textAlign: "center",
  },
  rosterList: {
    maxHeight: 380,
  },
  attendeeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: "700",
  },
  attendeeHandle: {
    fontSize: 11,
    marginTop: 1,
  },
  hostBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  hostBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  durationChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  durationText: {
    fontSize: 11,
    fontWeight: "700",
  },
  toggleBtn: {
    padding: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
