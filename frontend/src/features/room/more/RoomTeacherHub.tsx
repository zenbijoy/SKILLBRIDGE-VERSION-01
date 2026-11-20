import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Profile, Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { copyToClipboard } from "@/utils/safeClipboard";

type RoomTeacherHubProps = {
  room: Room;
  members: Profile[];
  currentUserId?: string;
  isOwner?: boolean;
  isTeacher?: boolean;
  canStartLive?: boolean;
  onOpenPinnedHub?: () => void;
  onTabChange?: (tab: any) => void;
};

export function RoomTeacherHub({
  room,
  members,
  currentUserId,
  isOwner,
  isTeacher,
  canStartLive,
  onOpenPinnedHub,
  onTabChange,
}: RoomTeacherHubProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  // Teacher availability toggle
  const [isAvailableForHelp, setIsAvailableForHelp] = useState(true);

  // Modals state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [announceModalOpen, setAnnounceModalOpen] = useState(false);

  // Schedule class form state
  const [classTitle, setClassTitle] = useState("");
  const [classDesc, setClassDesc] = useState("");
  const [classDateOffset, setClassDateOffset] = useState<"today" | "tomorrow" | "weekend">("today");
  const [classTime, setClassTime] = useState("14:00");
  const [classDuration, setClassDuration] = useState("60"); // minutes
  const [classMode, setClassMode] = useState<"online" | "hybrid" | "offline">("online");
  const [campusLocation, setCampusLocation] = useState(room.campus_location || "");

  // Announcement state
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  // Poll state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["Option A", "Option B"]);

  // 1. QUERY STUDENT HELP / QUESTION REQUESTS (Teacher Queue)
  const { data: helpData, isLoading: helpLoading } = useQuery<{ requests: any[]; pendingCount: number }>({
    queryKey: ["room-help-requests", room.id],
    queryFn: () => api<{ requests: any[]; pendingCount: number }>(`/rooms/${room.id}/help-requests`),
    refetchInterval: 12_000,
  });
  const helpRequests = helpData?.requests ?? [];

  // Update help request mutation
  const updateHelpMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "resolved" | "dismissed" }) =>
      api(`/rooms/${room.id}/help-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, vars) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-help-requests", room.id] });
      if (vars.status === "accepted") {
        Alert.alert(
          "Student Doubt Accepted! 🤝",
          "The student has been notified that you are ready to help. You can invite them into a live audio/video session.",
          [
            { text: "Dismiss", style: "cancel" },
            {
              text: "Go to Live Stage",
              onPress: () => onTabChange?.("stage"),
            },
          ],
        );
      }
    },
    onError: (err: Error) => {
      Alert.alert("Update failed", err.message);
    },
  });

  // 2. QUERY LIVE SESSION ATTENDANCE (Teacher Roll Call)
  const { data: attendanceData } = useQuery<{ records?: any[]; summary?: any }>({
    queryKey: ["room-attendance-live", room.id],
    queryFn: () => api<any>(`/rooms/${room.id}/attendance/live`),
    refetchInterval: 15_000,
  });
  const attendanceRecords = attendanceData?.records ?? [];

  // Manual attendance update
  const manualAttendanceMutation = useMutation({
    mutationFn: ({ userId, status, sessionId }: { userId: string; status: "present" | "left" | "absent"; sessionId: string }) =>
      api(`/rooms/${room.id}/attendance/manual`, {
        method: "POST",
        body: JSON.stringify({ targetUserId: userId, status, sessionId }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-attendance-live", room.id] });
    },
  });

  // 3. SCHEDULE CLASS MUTATION
  const scheduleClassMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      starts_at: string;
      ends_at: string;
      mode: string;
      campus_location?: string | null;
    }) =>
      api(`/rooms/${room.id}/sessions`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      setScheduleModalOpen(false);
      setClassTitle("");
      setClassDesc("");
      Alert.alert(
        "Class Scheduled! 📅",
        "Your upcoming class has been posted to the syllabus and room calendar. Students have been notified.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Scheduling Error", err.message);
    },
  });

  // 4. TEACHER ANNOUNCEMENT MUTATION
  const teacherAnnounceMutation = useMutation({
    mutationFn: (payload: { title: string; body: string }) =>
      api(`/rooms/${room.id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          title: `[Instructor Note] ${payload.title.trim()}`,
          body: payload.body.trim(),
          type: "announcement",
          metadata: { is_teacher_post: true, is_pinned: true },
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
      qc.invalidateQueries({ queryKey: ["room-pinned", room.id] });
      setAnnounceModalOpen(false);
      setAnnTitle("");
      setAnnBody("");
      Alert.alert(
        "Teacher Notice Published! 📌",
        "Your instruction update has been pinned to the top of the classroom feed.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Could not post note", err.message);
    },
  });

  // 5. CREATE LIVE POLL MUTATION
  const createPollMutation = useMutation({
    mutationFn: (payload: { question: string; options: string[] }) =>
      api(`/rooms/${room.id}/polls`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
      qc.invalidateQueries({ queryKey: ["room-polls", room.id] });
      setPollModalOpen(false);
      setPollQuestion("");
      setPollOptions(["Option A", "Option B"]);
      Alert.alert("Poll Dispatched! 📊", "Live interactive poll is now open for students to vote.");
    },
    onError: (err: Error) => {
      Alert.alert("Could not launch poll", err.message);
    },
  });

  // Copy roll call summary
  const handleCopyRollCall = async () => {
    triggerHaptic();
    const nowStr = new Date().toLocaleDateString();
    let text = `Class Roll Call - ${room.title} (${nowStr})\nTotal Students Present: ${attendanceRecords.length || members.length}\n\n`;
    if (attendanceRecords.length > 0) {
      attendanceRecords.forEach((r: any, idx: number) => {
        text += `${idx + 1}. ${r.fullName || r.username} - ${r.status.toUpperCase()} (${r.durationFormatted || "Present"})\n`;
      });
    } else {
      members.forEach((m: any, idx: number) => {
        text += `${idx + 1}. ${m.full_name || m.username} - ${m.is_online ? "ONLINE" : "OFFLINE"}\n`;
      });
    }
    await copyToClipboard(text, "Class Roll Call");
    Alert.alert("Roll Call Copied! 📋", "Formatted attendance record copied to clipboard.");
  };

  const calculateSessionDates = () => {
    const start = new Date();
    if (classDateOffset === "tomorrow") {
      start.setDate(start.getDate() + 1);
    } else if (classDateOffset === "weekend") {
      const day = start.getDay();
      const diff = 6 - day;
      start.setDate(start.getDate() + (diff > 0 ? diff : 7));
    }
    const [hh, mm] = classTime.split(":").map((n) => parseInt(n, 10) || 0);
    start.setHours(hh, mm, 0, 0);

    const durMins = parseInt(classDuration, 10) || 60;
    const end = new Date(start.getTime() + durMins * 60 * 1000);

    return { starts_at: start.toISOString(), ends_at: end.toISOString() };
  };

  return (
    <View style={s.container}>
      {/* SECTION HEADER */}
      <Row style={s.sectionHeader}>
        <View style={[s.badgeIcon, { backgroundColor: "#3B82F622" }]}>
          <MaterialCommunityIcons name="school" size={16} color="#3B82F6" />
        </View>
        <Text style={[s.sectionTitle, { color: colors.text }]}>TEACHER COMMAND HUB & CLASS TOOLS</Text>
        <View style={[s.roleChip, { backgroundColor: "#3B82F620" }]}>
          <Text style={[s.roleChipText, { color: "#3B82F6" }]}>INSTRUCTOR / TEACHER</Text>
        </View>
      </Row>

      {/* TEACHER AVAILABILITY STATUS */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={s.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <View
                style={[
                  s.statusDot,
                  { backgroundColor: isAvailableForHelp ? "#10B981" : colors.muted },
                ]}
              />
              <Text style={[s.switchTitle, { color: colors.text }]}>
                {isAvailableForHelp ? "Teacher is Available for Live Help" : "Teacher is Currently Offline"}
              </Text>
            </Row>
            <Text style={[s.switchSub, { color: colors.muted }]}>
              {isAvailableForHelp
                ? "Students see a green badge and can ask you live questions during study hours."
                : "Questions will be queued for you to answer later."}
            </Text>
          </View>
          <Switch
            value={isAvailableForHelp}
            onValueChange={(val) => {
              triggerHaptic();
              setIsAvailableForHelp(val);
            }}
            trackColor={{ false: colors.border, true: "#10B981" }}
            thumbColor="#FFFFFF"
          />
        </Row>
      </View>

      {/* QUICK TEACHER ACTIONS GRID */}
      <View style={s.actionsGrid}>
        {/* Action 1: Launch Instant Live Class */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            if (onTabChange) {
              onTabChange("stage");
            } else {
              Alert.alert("Live Class", "Switching to Classroom Live Stage...");
            }
          }}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: "#EF44440D", borderColor: "#EF444444", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: "#EF444422" }]}>
            <MaterialCommunityIcons name="video-vintage" size={20} color="#EF4444" />
          </View>
          <Text style={[s.tileTitle, { color: "#EF4444" }]}>Start Live Class</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Instant audio/video lecture room</Text>
        </Pressable>

        {/* Action 2: Schedule Upcoming Class */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setScheduleModalOpen(true);
          }}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: "#3B82F622" }]}>
            <MaterialCommunityIcons name="calendar-plus" size={20} color="#3B82F6" />
          </View>
          <Text style={[s.tileTitle, { color: colors.text }]}>Schedule Class</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Set lecture date, time & room</Text>
        </Pressable>

        {/* Action 3: Teacher's Announcement */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setAnnounceModalOpen(true);
          }}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: "#F59E0B22" }]}>
            <MaterialCommunityIcons name="bullhorn-outline" size={20} color="#F59E0B" />
          </View>
          <Text style={[s.tileTitle, { color: colors.text }]}>Post Notice</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Class instructions & homework</Text>
        </Pressable>

        {/* Action 4: Launch Interactive Poll */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setPollModalOpen(true);
          }}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: "#8B5CF622" }]}>
            <MaterialCommunityIcons name="poll" size={20} color="#8B5CF6" />
          </View>
          <Text style={[s.tileTitle, { color: colors.text }]}>Create Poll</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Fast comprehension check</Text>
        </Pressable>
      </View>

      {/* STUDENT DOUBTS & QUESTIONS HELP DESK */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="frequently-asked-questions" size={20} color="#3B82F6" />
            <Text style={[s.switchTitle, { color: colors.text }]}>
              Student Doubts Queue ({helpRequests.length})
            </Text>
          </Row>
          {helpRequests.length > 0 && (
            <View style={[s.counterBadge, { backgroundColor: "#EF444422" }]}>
              <Text style={{ fontSize: 11, fontWeight: "900", color: "#EF4444" }}>
                {helpRequests.length} Pending
              </Text>
            </View>
          )}
        </Row>

        {helpLoading ? (
          <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 10 }} />
        ) : helpRequests.length === 0 ? (
          <View style={s.emptyBox}>
            <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.muted} />
            <Text style={[s.emptySub, { color: colors.muted }]}>
              No pending questions. All student queries are answered!
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {helpRequests.map((req: any) => (
              <View
                key={req.id}
                style={[
                  s.helpRequestCard,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: req.urgency === "immediate" ? "#EF444455" : colors.divider,
                  },
                ]}
              >
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={[s.studentAvatar, { backgroundColor: "#3B82F622" }]}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#3B82F6" }}>
                        {(req.user?.fullName || req.user?.username || "S")[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.studentName, { color: colors.text }]} numberOfLines={1}>
                        {req.user?.fullName || `@${req.user?.username}`}
                      </Text>
                      <Text style={[s.helpTopic, { color: colors.primary }]} numberOfLines={1}>
                        {req.topic}
                      </Text>
                    </View>
                  </Row>

                  <Row style={{ gap: 4 }}>
                    {req.urgency === "immediate" && (
                      <View style={[s.pillBadge, { backgroundColor: "#EF444422" }]}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: "#EF4444" }}>🔥 Urgent</Text>
                      </View>
                    )}
                    <View style={[s.pillBadge, { backgroundColor: "#10B98122" }]}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#10B981" }}>
                        {req.preferredMedia === "video" ? "📹 Video" : "🎙️ Audio"}
                      </Text>
                    </View>
                  </Row>
                </Row>

                {req.details ? (
                  <Text style={[s.helpDetails, { color: colors.muted }]} numberOfLines={2}>
                    {req.details}
                  </Text>
                ) : null}

                <Row style={{ gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
                  <Pressable
                    onPress={() => updateHelpMutation.mutate({ requestId: req.id, status: "accepted" })}
                    disabled={updateHelpMutation.isPending}
                    style={[s.helpActionBtn, { backgroundColor: "#3B82F6" }]}
                  >
                    <MaterialCommunityIcons name="handshake" size={14} color="#FFFFFF" />
                    <Text style={s.helpActionText}>Accept & Help</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => updateHelpMutation.mutate({ requestId: req.id, status: "resolved" })}
                    disabled={updateHelpMutation.isPending}
                    style={[s.helpActionBtn, { backgroundColor: "#10B981" }]}
                  >
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    <Text style={s.helpActionText}>Resolve</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => updateHelpMutation.mutate({ requestId: req.id, status: "dismissed" })}
                    disabled={updateHelpMutation.isPending}
                    style={[s.helpActionBtn, { backgroundColor: colors.surface }]}
                  >
                    <Text style={[s.helpActionText, { color: colors.muted }]}>Dismiss</Text>
                  </Pressable>
                </Row>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ATTENDANCE & ROLL CALL CARD */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#10B981" />
            <Text style={[s.switchTitle, { color: colors.text }]}>
              Class Roll Call & Attendance ({attendanceRecords.length || members.length})
            </Text>
          </Row>
          <Pressable onPress={handleCopyRollCall} style={[s.miniCopyBtn, { backgroundColor: "#10B9811A" }]}>
            <MaterialCommunityIcons name="content-copy" size={14} color="#10B981" />
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#10B981" }}>Copy List</Text>
          </Pressable>
        </Row>

        <Text style={[s.switchSub, { color: colors.muted }]}>
          Live session attendance tracking. Export or copy roll call to keep your class registry up to date.
        </Text>
      </View>

      {/* SCHEDULE CLASS MODAL */}
      <Modal
        visible={scheduleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="calendar-clock" size={22} color="#3B82F6" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Schedule Classroom Session</Text>
              </Row>
              <Pressable
                onPress={() => setScheduleModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
              <TextInput
                value={classTitle}
                onChangeText={setClassTitle}
                placeholder="Class Title (e.g. Chapter 4: Calculus Derivatives)"
                placeholderTextColor={colors.muted}
                style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              />

              <TextInput
                value={classDesc}
                onChangeText={setClassDesc}
                placeholder="Session objectives, preparation guidelines, links..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[
                  s.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                    minHeight: 70,
                    textAlignVertical: "top",
                  },
                ]}
              />

              {/* Date Offset Selector */}
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Session Day</Text>
                <Row style={{ gap: 8 }}>
                  {(["today", "tomorrow", "weekend"] as const).map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        triggerHaptic();
                        setClassDateOffset(opt);
                      }}
                      style={[
                        s.segmentBtn,
                        {
                          backgroundColor: classDateOffset === opt ? "#3B82F6" : colors.background,
                          borderColor: classDateOffset === opt ? "#3B82F6" : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.segmentText,
                          { color: classDateOffset === opt ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {opt === "today" ? "Today" : opt === "tomorrow" ? "Tomorrow" : "This Weekend"}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </View>

              {/* Time and Duration */}
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Start Time (24h)</Text>
                  <TextInput
                    value={classTime}
                    onChangeText={setClassTime}
                    placeholder="14:00"
                    placeholderTextColor={colors.muted}
                    style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Duration (Mins)</Text>
                  <TextInput
                    value={classDuration}
                    onChangeText={setClassDuration}
                    keyboardType="number-pad"
                    placeholder="60"
                    placeholderTextColor={colors.muted}
                    style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  />
                </View>
              </Row>

              {/* Mode Selector */}
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Session Mode</Text>
                <Row style={{ gap: 8 }}>
                  {(["online", "hybrid", "offline"] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        triggerHaptic();
                        setClassMode(m);
                      }}
                      style={[
                        s.segmentBtn,
                        {
                          backgroundColor: classMode === m ? "#3B82F6" : colors.background,
                          borderColor: classMode === m ? "#3B82F6" : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.segmentText,
                          { color: classMode === m ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {m.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </View>

              {classMode !== "online" && (
                <TextInput
                  value={campusLocation}
                  onChangeText={setCampusLocation}
                  placeholder="Campus Hall / Room No. (e.g. Lab 304)"
                  placeholderTextColor={colors.muted}
                  style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />
              )}
            </ScrollView>

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setScheduleModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!classTitle.trim()) {
                    Alert.alert("Missing title", "Please enter a class title.");
                    return;
                  }
                  const { starts_at, ends_at } = calculateSessionDates();
                  scheduleClassMutation.mutate({
                    title: classTitle.trim(),
                    description: classDesc.trim(),
                    starts_at,
                    ends_at,
                    mode: classMode,
                    campus_location: classMode === "online" ? null : campusLocation.trim(),
                  });
                }}
                disabled={scheduleClassMutation.isPending}
                style={[s.btn, { backgroundColor: "#3B82F6", flex: 2 }]}
              >
                {scheduleClassMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Schedule Session</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>

      {/* TEACHER ANNOUNCEMENT MODAL */}
      <Modal
        visible={announceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAnnounceModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="bullhorn" size={22} color="#F59E0B" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Post Teacher Notice</Text>
              </Row>
              <Pressable
                onPress={() => setAnnounceModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <TextInput
              value={annTitle}
              onChangeText={setAnnTitle}
              placeholder="Notice Heading (e.g. Bring scientific calculator tomorrow)"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <TextInput
              value={annBody}
              onChangeText={setAnnBody}
              placeholder="Full homework instructions, assignment reading or guidance..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[
                s.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                  minHeight: 88,
                  textAlignVertical: "top",
                },
              ]}
            />

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setAnnounceModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!annTitle.trim() || !annBody.trim()) {
                    Alert.alert("Missing details", "Please enter title and content.");
                    return;
                  }
                  teacherAnnounceMutation.mutate({ title: annTitle, body: annBody });
                }}
                disabled={teacherAnnounceMutation.isPending}
                style={[s.btn, { backgroundColor: "#F59E0B", flex: 2 }]}
              >
                {teacherAnnounceMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Publish Notice</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>

      {/* LIVE POLL CREATOR MODAL */}
      <Modal
        visible={pollModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPollModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="poll" size={22} color="#8B5CF6" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Launch Interactive Poll</Text>
              </Row>
              <Pressable
                onPress={() => setPollModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <TextInput
              value={pollQuestion}
              onChangeText={setPollQuestion}
              placeholder="Question (e.g. Which concept should we review next?)"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            {pollOptions.map((opt, idx) => (
              <Row key={idx} style={{ gap: 8, alignItems: "center" }}>
                <TextInput
                  value={opt}
                  onChangeText={(val) => {
                    const next = [...pollOptions];
                    next[idx] = val;
                    setPollOptions(next);
                  }}
                  placeholder={`Option ${idx + 1}`}
                  placeholderTextColor={colors.muted}
                  style={[s.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />
                {pollOptions.length > 2 && (
                  <Pressable
                    onPress={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.danger} />
                  </Pressable>
                )}
              </Row>
            ))}

            {pollOptions.length < 4 && (
              <Pressable
                onPress={() => setPollOptions([...pollOptions, `Option ${pollOptions.length + 1}`])}
                style={{ paddingVertical: 4 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#8B5CF6" }}>+ Add Another Option</Text>
              </Pressable>
            )}

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setPollModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!pollQuestion.trim()) {
                    Alert.alert("Missing question", "Please enter a poll question.");
                    return;
                  }
                  createPollMutation.mutate({
                    question: pollQuestion.trim(),
                    options: pollOptions.map((o) => o.trim()).filter(Boolean),
                  });
                }}
                disabled={createPollMutation.isPending}
                style={[s.btn, { backgroundColor: "#8B5CF6", flex: 2 }]}
              >
                {createPollMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Launch Poll</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  badgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    flex: 1,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  switchRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  switchSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionTile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  tileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  tileSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  counterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
  },
  helpRequestCard: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 6,
  },
  studentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  studentName: {
    fontSize: 12,
    fontWeight: "700",
  },
  helpTopic: {
    fontSize: 11,
    fontWeight: "600",
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  helpDetails: {
    fontSize: 11,
    lineHeight: 15,
  },
  helpActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  helpActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  miniCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  closeModalBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    fontSize: 13,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "700",
  },
  btn: {
    paddingVertical: 11,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 13,
  },
});
