import React, { useEffect, useRef, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Profile, Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { copyToClipboard } from "@/utils/safeClipboard";
import { ActiveDot } from "@/features/presence/ActiveDot";

type RoomMemberHubProps = {
  room: Room;
  members: Profile[];
  currentUserId?: string;
  onOpenPinnedHub?: () => void;
};

export function RoomMemberHub({
  room,
  members,
  currentUserId,
  onOpenPinnedHub,
}: RoomMemberHubProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. IN-ROOM POMODORO FOCUS TIMER
  // ───────────────────────────────────────────────────────────────────────────
  const [timerMode, setTimerMode] = useState<"focus" | "shortBreak" | "longBreak">("focus");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved study sessions today from AsyncStorage
  useEffect(() => {
    const key = `@study_streak_room_${room.id}_${new Date().toISOString().slice(0, 10)}`;
    AsyncStorage.getItem(key).then((val) => {
      if (val) setCompletedSessions(parseInt(val, 10) || 0);
    }).catch(() => {});
  }, [room.id]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsRunning(false);
            triggerHaptic();

            if (timerMode === "focus") {
              const nextCount = completedSessions + 1;
              setCompletedSessions(nextCount);
              const key = `@study_streak_room_${room.id}_${new Date().toISOString().slice(0, 10)}`;
              AsyncStorage.setItem(key, String(nextCount)).catch(() => {});

              Alert.alert(
                "Focus Session Completed! 🎯",
                "Outstanding effort! You completed a 25-minute study cycle in this room. Take a well-deserved 5-minute break.",
              );
              setTimerMode("shortBreak");
              return 5 * 60;
            } else {
              Alert.alert("Break Ended! 🔔", "Ready for your next study sprint? Let's get back into focus mode.");
              setTimerMode("focus");
              return 25 * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, timerMode, completedSessions, room.id]);

  const switchTimerMode = (mode: "focus" | "shortBreak" | "longBreak") => {
    triggerHaptic();
    setIsRunning(false);
    setTimerMode(mode);
    if (mode === "focus") setTimeLeft(25 * 60);
    else if (mode === "shortBreak") setTimeLeft(5 * 60);
    else setTimeLeft(15 * 60);
  };

  const toggleTimer = () => {
    triggerHaptic();
    setIsRunning((prev) => !prev);
  };

  const resetTimer = () => {
    triggerHaptic();
    setIsRunning(false);
    if (timerMode === "focus") setTimeLeft(25 * 60);
    else if (timerMode === "shortBreak") setTimeLeft(5 * 60);
    else setTimeLeft(15 * 60);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 2. IN-ROOM PRIVATE SCRATCHPAD NOTES
  // ───────────────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const notesKey = `@room_notes_${room.id}`;

  useEffect(() => {
    AsyncStorage.getItem(notesKey).then((saved) => {
      if (saved) setNotes(saved);
    }).catch(() => {});
  }, [notesKey]);

  const handleNotesChange = (text: string) => {
    setNotes(text);
    setNotesSaved(false);
    AsyncStorage.setItem(notesKey, text)
      .then(() => setNotesSaved(true))
      .catch(() => {});
  };

  const handleCopyNotes = async () => {
    triggerHaptic();
    if (!notes.trim()) {
      Alert.alert("Scratchpad empty", "You have not written any notes yet.");
      return;
    }
    await copyToClipboard(notes, `Study Notes - ${room.title}`);
    Alert.alert("Notes Copied! 📋", "Your private study notes have been copied to clipboard.");
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ASK TEACHER / SUBMIT QUESTION (HELP DESK)
  // ───────────────────────────────────────────────────────────────────────────
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [questionTopic, setQuestionTopic] = useState("");
  const [questionDetails, setQuestionDetails] = useState("");
  const [questionUrgency, setQuestionUrgency] = useState<"immediate" | "normal">("immediate");
  const [questionMedia, setQuestionMedia] = useState<"audio" | "video">("audio");

  const submitQuestionMutation = useMutation({
    mutationFn: (payload: { topic: string; details?: string; urgency: string; preferredMedia: string }) =>
      api(`/rooms/${room.id}/help-requests`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-help-requests", room.id] });
      setAskModalOpen(false);
      setQuestionTopic("");
      setQuestionDetails("");
      Alert.alert(
        "Question Submitted! ✋",
        "Your doubt has been forwarded to the room's teachers and instructors. You will receive an alert as soon as a teacher accepts.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Could not submit question", err.message);
    },
  });

  // Query my submitted questions
  const { data: helpData } = useQuery<{ requests?: any[] }>({
    queryKey: ["room-help-requests", room.id],
    queryFn: () => api<{ requests: any[] }>(`/rooms/${room.id}/help-requests`),
    refetchInterval: 12_000,
  });
  const myHelpRequests = (helpData?.requests ?? []).filter((r) => r.userId === currentUserId);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MY ATTENDANCE & CERTIFICATE CLAIM
  // ───────────────────────────────────────────────────────────────────────────
  const { data: myAttendance, isLoading: attLoading } = useQuery<{
    totalSessions: number;
    attended: number;
    percent: number;
    eligible: boolean;
    certificate: any;
  }>({
    queryKey: ["room-attendance-me", room.id],
    queryFn: () => api<any>(`/rooms/${room.id}/attendance/me`),
  });

  const claimCertificateMutation = useMutation({
    mutationFn: () => api(`/rooms/${room.id}/attendance/claim`, { method: "POST" }),
    onSuccess: (data: any) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-attendance-me", room.id] });
      Alert.alert(
        "Certificate Awarded! 🎓🏆",
        `Congratulations! You achieved ${myAttendance?.percent || 80}% attendance and earned 100 XP!\n\nCertificate ID: ${data?.certificate?.id || "CERT-VERIFIED"}`,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Claim error", err.message || "Failed to claim certificate");
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. ACTIVE STUDY PARTNERS (PEER MATCHER)
  // ───────────────────────────────────────────────────────────────────────────
  const onlinePeers = members.filter((m) => m.id !== currentUserId && (m as any).is_online);

  // ───────────────────────────────────────────────────────────────────────────
  // 6. VOLUNTEER AS TEACHER / TA / MODERATOR
  // ───────────────────────────────────────────────────────────────────────────
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);
  const [volunteerRole, setVolunteerRole] = useState<"moderator" | "teacher">("moderator");
  const [volunteerMessage, setVolunteerMessage] = useState("");

  const volunteerMutation = useMutation({
    mutationFn: (payload: { role: "moderator" | "teacher"; message: string }) =>
      api<{ success: boolean; message: string }>(`/rooms/${room.id}/volunteer`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      triggerHaptic();
      setVolunteerModalOpen(false);
      setVolunteerMessage("");
      Alert.alert(
        "Application Sent! 🎓",
        data.message || "Your leadership application has been delivered to room hosts and teachers.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Application Failed", err.message);
    },
  });

  return (
    <View style={s.container}>
      {/* SECTION HEADER */}
      <Row style={s.sectionHeader}>
        <View style={[s.badgeIcon, { backgroundColor: "#10B98122" }]}>
          <MaterialCommunityIcons name="book-education" size={16} color="#10B981" />
        </View>
        <Text style={[s.sectionTitle, { color: colors.text }]}>STUDENT ZONE & STUDY TOOLKIT</Text>
        <View style={[s.roleChip, { backgroundColor: "#10B98120" }]}>
          <Text style={[s.roleChipText, { color: "#10B981" }]}>MEMBER / LEARNER</Text>
        </View>
      </Row>

      {/* 1. POMODORO FOCUS TIMER WIDGET */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="timer-outline" size={20} color={colors.primary} />
            <Text style={[s.switchTitle, { color: colors.text }]}>In-Room Focus Timer (Pomodoro)</Text>
          </Row>
          <View style={[s.counterBadge, { backgroundColor: `${colors.primary}1A` }]}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
              {completedSessions} Cycles Done Today
            </Text>
          </View>
        </Row>

        {/* Mode Selector */}
        <Row style={{ gap: 6, marginVertical: 4 }}>
          <Pressable
            onPress={() => switchTimerMode("focus")}
            style={[
              s.pomoModeBtn,
              {
                backgroundColor: timerMode === "focus" ? colors.primary : colors.surface2,
              },
            ]}
          >
            <Text style={[s.pomoModeText, { color: timerMode === "focus" ? "#FFFFFF" : colors.muted }]}>
              Focus (25m)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchTimerMode("shortBreak")}
            style={[
              s.pomoModeBtn,
              {
                backgroundColor: timerMode === "shortBreak" ? "#10B981" : colors.surface2,
              },
            ]}
          >
            <Text style={[s.pomoModeText, { color: timerMode === "shortBreak" ? "#FFFFFF" : colors.muted }]}>
              Short Break (5m)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchTimerMode("longBreak")}
            style={[
              s.pomoModeBtn,
              {
                backgroundColor: timerMode === "longBreak" ? "#6366F1" : colors.surface2,
              },
            ]}
          >
            <Text style={[s.pomoModeText, { color: timerMode === "longBreak" ? "#FFFFFF" : colors.muted }]}>
              Long Break (15m)
            </Text>
          </Pressable>
        </Row>

        {/* Timer Display */}
        <View style={s.timerClockBox}>
          <Text
            style={[
              s.timerClockText,
              {
                color:
                  timerMode === "focus"
                    ? colors.primary
                    : timerMode === "shortBreak"
                    ? "#10B981"
                    : "#6366F1",
              },
            ]}
          >
            {formatTimer(timeLeft)}
          </Text>
          <Text style={[s.timerStateText, { color: colors.muted }]}>
            {isRunning ? "Focus sprint in progress • Maintain deep concentration" : "Paused • Ready to start sprint"}
          </Text>
        </View>

        {/* Timer Controls */}
        <Row style={{ gap: 10, justifyContent: "center" }}>
          <Pressable
            onPress={toggleTimer}
            style={[
              s.timerControlBtn,
              {
                backgroundColor: isRunning ? colors.warning : colors.primary,
                flex: 2,
              },
            ]}
          >
            <MaterialCommunityIcons name={isRunning ? "pause" : "play"} size={20} color="#FFFFFF" />
            <Text style={s.timerControlBtnText}>{isRunning ? "Pause Sprint" : "Start Focus Sprint"}</Text>
          </Pressable>
          <Pressable
            onPress={resetTimer}
            style={[s.timerControlBtn, { backgroundColor: colors.surface2, flex: 1 }]}
          >
            <MaterialCommunityIcons name="refresh" size={18} color={colors.text} />
            <Text style={[s.timerControlBtnText, { color: colors.text }]}>Reset</Text>
          </Pressable>
        </Row>
      </View>

      {/* 2. ASK TEACHER / SUBMIT DOUBT (QUICK LAUNCHER) */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="hand-back-right-outline" size={20} color="#F59E0B" />
            <Text style={[s.switchTitle, { color: colors.text }]}>Ask Teacher / Submit Doubt</Text>
          </Row>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setAskModalOpen(true);
            }}
            style={[s.askBtn, { backgroundColor: "#F59E0B" }]}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
            <Text style={s.askBtnText}>Ask Question</Text>
          </Pressable>
        </Row>

        <Text style={[s.switchSub, { color: colors.muted }]}>
          Need help with difficult formulas or homework? Submit a doubt directly into the teacher queue.
        </Text>

        {/* My active queries */}
        {myHelpRequests.length > 0 && (
          <View style={{ gap: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted }}>MY ACTIVE QUESTIONS</Text>
            {myHelpRequests.map((req) => (
              <Row
                key={req.id}
                style={[s.myReqRow, { backgroundColor: colors.surface2, borderColor: colors.divider }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.myReqTopic, { color: colors.text }]} numberOfLines={1}>
                    {req.topic}
                  </Text>
                  <Text style={[s.myReqStatus, { color: req.status === "accepted" ? "#10B981" : colors.muted }]}>
                    Status: {req.status === "accepted" ? "🎉 Teacher Accepted!" : "Pending Review"}
                  </Text>
                </View>
                <View
                  style={[
                    s.pillBadge,
                    { backgroundColor: req.status === "accepted" ? "#10B98122" : colors.surface },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: req.status === "accepted" ? "#10B981" : colors.muted,
                    }}
                  >
                    {req.status.toUpperCase()}
                  </Text>
                </View>
              </Row>
            ))}
          </View>
        )}
      </View>

      {/* 3. MY ATTENDANCE & CERTIFICATE PROGRESS */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="certificate-outline" size={20} color="#10B981" />
            <Text style={[s.switchTitle, { color: colors.text }]}>My Attendance & Course Certificate</Text>
          </Row>
          <Text style={{ fontSize: 13, fontWeight: "900", color: "#10B981" }}>
            {myAttendance ? `${myAttendance.percent}%` : "0%"}
          </Text>
        </Row>

        {/* Progress bar */}
        <View style={[s.progressBarTrack, { backgroundColor: colors.surface2 }]}>
          <View
            style={[
              s.progressBarFill,
              {
                backgroundColor: (myAttendance?.percent ?? 0) >= 80 ? "#10B981" : colors.primary,
                width: `${Math.min(100, Math.max(0, myAttendance?.percent ?? 0))}%`,
              },
            ]}
          />
        </View>

        <Text style={[s.switchSub, { color: colors.muted }]}>
          Attended {myAttendance?.attended ?? 0} of {myAttendance?.totalSessions ?? 0} scheduled classes.
          Reach 80% to claim your verified Course Certificate & 100 XP!
        </Text>

        {/* Claim button if eligible */}
        {myAttendance?.eligible && !myAttendance?.certificate && (
          <Pressable
            onPress={() => claimCertificateMutation.mutate()}
            disabled={claimCertificateMutation.isPending}
            style={[s.claimCertBtn, { backgroundColor: "#F59E0B" }]}
          >
            {claimCertificateMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="seal" size={18} color="#FFFFFF" />
                <Text style={s.claimCertBtnText}>Claim Course Certificate (+100 XP)</Text>
              </Row>
            )}
          </Pressable>
        )}

        {myAttendance?.certificate && (
          <Row style={[s.certBadgeRow, { backgroundColor: "#10B9811A", borderColor: "#10B98155" }]}>
            <MaterialCommunityIcons name="check-decagram" size={20} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#10B981" }}>Certificate Verified & Awarded</Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>Completed course attendance criteria.</Text>
            </View>
          </Row>
        )}
      </View>

      {/* 4. PRIVATE IN-ROOM SCRATCHPAD NOTES */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="notebook-outline" size={20} color="#6366F1" />
            <Text style={[s.switchTitle, { color: colors.text }]}>Private Room Scratchpad</Text>
          </Row>
          <Row style={{ gap: 6 }}>
            {notesSaved && (
              <Text style={{ fontSize: 10, color: "#10B981", fontWeight: "700" }}>Saved</Text>
            )}
            <Pressable onPress={handleCopyNotes} style={[s.miniCopyBtn, { backgroundColor: "#6366F11A" }]}>
              <MaterialCommunityIcons name="content-copy" size={14} color="#6366F1" />
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#6366F1" }}>Copy</Text>
            </Pressable>
          </Row>
        </Row>

        <TextInput
          value={notes}
          onChangeText={handleNotesChange}
          placeholder="Jot down important formulas, meeting notes, or links for this room. Private to you and saved on this device."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          style={[
            s.notesInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />
      </View>

      {/* 5. ACTIVE STUDY BUDDY FINDER */}
      {onlinePeers.length > 0 && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="account-heart-outline" size={20} color="#EC4899" />
            <Text style={[s.switchTitle, { color: colors.text }]}>
              Study Buddies Online ({onlinePeers.length})
            </Text>
          </Row>

          <Text style={[s.switchSub, { color: colors.muted }]}>
            These classmates are studying in this room right now. Connect for quick collaboration!
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {onlinePeers.map((peer) => (
              <Pressable
                key={peer.id}
                onPress={() => {
                  triggerHaptic();
                  router.push(`/chat/${peer.id}` as any);
                }}
                style={[s.peerChip, { backgroundColor: colors.surface2, borderColor: colors.divider }]}
              >
                <View style={{ position: "relative" }}>
                  <View style={[s.peerAvatar, { backgroundColor: `${colors.primary}22` }]}>
                    <Text style={{ fontSize: 12, fontWeight: "900", color: colors.primary }}>
                      {(peer.full_name || peer.username || "U")[0].toUpperCase()}
                    </Text>
                  </View>
                  <ActiveDot userId={peer.id} size={9} style={{ position: "absolute", bottom: 0, right: 0 }} />
                </View>
                <View>
                  <Text style={[s.peerName, { color: colors.text }]} numberOfLines={1}>
                    {peer.full_name || `@${peer.username}`}
                  </Text>
                  <Text style={[s.peerSub, { color: "#10B981" }]}>Active now</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 6. VOLUNTEER FOR LEADERSHIP & TA */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="account-star-outline" size={20} color="#6366F1" />
            <Text style={[s.switchTitle, { color: colors.text }]}>Volunteer as TA / Discussion Leader</Text>
          </Row>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setVolunteerModalOpen(true);
            }}
            style={[s.askBtn, { backgroundColor: "#6366F1" }]}
          >
            <MaterialCommunityIcons name="star-outline" size={15} color="#FFFFFF" />
            <Text style={s.askBtnText}>Apply</Text>
          </Pressable>
        </Row>
        <Text style={[s.switchSub, { color: colors.muted }]}>
          Excel at this subject? Volunteer to assist professors as a Teaching Assistant (TA) or help keep the study room friendly as a Moderator.
        </Text>
      </View>

      {/* ASK TEACHER MODAL */}
      <Modal
        visible={askModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAskModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="hand-back-right" size={22} color="#F59E0B" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Ask Room Teachers</Text>
              </Row>
              <Pressable
                onPress={() => setAskModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <Text style={[s.modalSub, { color: colors.muted }]}>
              Submit a question or doubt directly to the instructors of {room.title}.
            </Text>

            <TextInput
              value={questionTopic}
              onChangeText={setQuestionTopic}
              placeholder="Question Topic (e.g. Question on Matrix Rank)"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <TextInput
              value={questionDetails}
              onChangeText={setQuestionDetails}
              placeholder="What specific part are you stuck on? (Optional details)"
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

            {/* Urgency */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Urgency</Text>
              <Row style={{ gap: 8 }}>
                {(["immediate", "normal"] as const).map((urg) => (
                  <Pressable
                    key={urg}
                    onPress={() => {
                      triggerHaptic();
                      setQuestionUrgency(urg);
                    }}
                    style={[
                      s.segmentBtn,
                      {
                        backgroundColor: questionUrgency === urg ? "#F59E0B" : colors.background,
                        borderColor: questionUrgency === urg ? "#F59E0B" : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.segmentText,
                        { color: questionUrgency === urg ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {urg === "immediate" ? "🔥 Immediate (Need help now)" : "Normal (Review later)"}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Preferred media */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>Preferred Explanation</Text>
              <Row style={{ gap: 8 }}>
                {(["audio", "video"] as const).map((med) => (
                  <Pressable
                    key={med}
                    onPress={() => {
                      triggerHaptic();
                      setQuestionMedia(med);
                    }}
                    style={[
                      s.segmentBtn,
                      {
                        backgroundColor: questionMedia === med ? colors.primary : colors.background,
                        borderColor: questionMedia === med ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.segmentText,
                        { color: questionMedia === med ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {med === "audio" ? "🎙️ Audio Discussion" : "📹 Video / Screenshare"}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setAskModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!questionTopic.trim()) {
                    Alert.alert("Missing topic", "Please enter a question topic.");
                    return;
                  }
                  submitQuestionMutation.mutate({
                    topic: questionTopic.trim(),
                    details: questionDetails.trim() || undefined,
                    urgency: questionUrgency,
                    preferredMedia: questionMedia,
                  });
                }}
                disabled={submitQuestionMutation.isPending}
                style={[s.btn, { backgroundColor: "#F59E0B", flex: 2 }]}
              >
                {submitQuestionMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Submit Question</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>

      {/* VOLUNTEER LEADERSHIP MODAL */}
      <Modal
        visible={volunteerModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVolunteerModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="account-star" size={22} color="#6366F1" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Apply for Room Leadership</Text>
              </Row>
              <Pressable
                onPress={() => setVolunteerModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <Text style={{ fontSize: 12, color: colors.muted }}>
              Choose the role you'd like to volunteer for and write a short note about your availability or academic experience.
            </Text>

            {/* Role Select Options */}
            <View style={{ gap: 8 }}>
              <Text style={s.inputLabel}>DESIRED ROLE</Text>
              <Row style={{ gap: 8 }}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setVolunteerRole("moderator");
                  }}
                  style={[
                    s.volunteerRoleBtn,
                    {
                      backgroundColor: volunteerRole === "moderator" ? "#6366F11A" : colors.surface2,
                      borderColor: volunteerRole === "moderator" ? "#6366F1" : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="shield-account"
                    size={18}
                    color={volunteerRole === "moderator" ? "#6366F1" : colors.muted}
                  />
                  <Text
                    style={[
                      s.volunteerRoleText,
                      { color: volunteerRole === "moderator" ? "#6366F1" : colors.text },
                    ]}
                  >
                    Moderator / TA
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setVolunteerRole("teacher");
                  }}
                  style={[
                    s.volunteerRoleBtn,
                    {
                      backgroundColor: volunteerRole === "teacher" ? "#3B82F61A" : colors.surface2,
                      borderColor: volunteerRole === "teacher" ? "#3B82F6" : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="school"
                    size={18}
                    color={volunteerRole === "teacher" ? "#3B82F6" : colors.muted}
                  />
                  <Text
                    style={[
                      s.volunteerRoleText,
                      { color: volunteerRole === "teacher" ? "#3B82F6" : colors.text },
                    ]}
                  >
                    Co-Teacher / Tutor
                  </Text>
                </Pressable>
              </Row>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={s.inputLabel}>YOUR STATEMENT / QUALIFICATION *</Text>
              <TextInput
                value={volunteerMessage}
                onChangeText={setVolunteerMessage}
                placeholder="e.g. Scored A+ in CS201, free on weekday evenings to host revision hours and answer homework doubts."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[s.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 75 }]}
              />
            </View>

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setVolunteerModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (volunteerMessage.trim().length < 5) {
                    Alert.alert("Statement too short", "Please provide a brief statement (at least 5 characters).");
                    return;
                  }
                  volunteerMutation.mutate({
                    role: volunteerRole,
                    message: volunteerMessage.trim(),
                  });
                }}
                disabled={volunteerMutation.isPending}
                style={[s.btn, { backgroundColor: "#6366F1", flex: 2 }]}
              >
                {volunteerMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Submit Application</Text>
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
  switchTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  switchSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  counterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pomoModeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pomoModeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  timerClockBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  timerClockText: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  timerStateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timerControlBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  timerControlBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  askBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  askBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  myReqRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 8,
  },
  myReqTopic: {
    fontSize: 12,
    fontWeight: "700",
  },
  myReqStatus: {
    fontSize: 10,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginVertical: 4,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  claimCertBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  claimCertBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  certBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 4,
  },
  notesInput: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 80,
    textAlignVertical: "top",
  },
  miniCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  peerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  peerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  peerName: {
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 100,
  },
  peerSub: {
    fontSize: 9,
    fontWeight: "700",
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
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalSub: {
    fontSize: 12,
    lineHeight: 17,
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
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  modalInput: {
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
  volunteerRoleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  volunteerRoleText: {
    fontSize: 12,
    fontWeight: "800",
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
