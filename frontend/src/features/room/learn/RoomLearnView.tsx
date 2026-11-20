import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Profile, Room, RoomSessionRequest, Session } from "@/types";
import { Row, SectionHeader, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { RoomQABoard } from "../RoomQABoard";
import { RoomPollCard, type RoomPollOption } from "../polls/RoomPollCard";
import { CreatePollModal } from "../polls/CreatePollModal";
import { RoomAttendanceCard } from "../attendance/RoomAttendanceCard";
import { RoomScheduleModal } from "./RoomScheduleModal";
import { RoomSessionRequestModal } from "./RoomSessionRequestModal";
import { RoomSessionRequestsList } from "./RoomSessionRequestsList";
import { RoomAssignmentsList } from "./RoomAssignmentsList";

type RoomLearnViewProps = {
  room: Room;
  sessions: Session[];
  teachingRequests?: { id: string; volunteer: Profile; status: string }[];
  isOwner?: boolean;
  isMember?: boolean;
  canStartLive?: boolean;
  onAcceptVolunteer?: (id: string) => void;
  onRejectVolunteer?: (id: string) => void;
  onVolunteer?: () => void;
};

export function RoomLearnView({
  room,
  sessions = [],
  teachingRequests = [],
  isOwner,
  isMember,
  canStartLive,
  onAcceptVolunteer,
  onRejectVolunteer,
  onVolunteer,
}: RoomLearnViewProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<"sessions" | "assignments" | "qa">("sessions");
  const [sessionFormatFilter, setSessionFormatFilter] = useState<"all" | "voice" | "video" | "offline">("all");

  // Modals state
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleSessionId, setScheduleSessionId] = useState<string | undefined>(undefined);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleDesc, setScheduleDesc] = useState("");
  const [scheduleType, setScheduleType] = useState<"voice" | "offline" | "video">("video");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState<string | undefined>(undefined);
  const [scheduleRequestId, setScheduleRequestId] = useState<string | undefined>(undefined);

  const [requestModalVisible, setRequestModalVisible] = useState(false);

  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollType, setPollType] = useState<"time_selection" | "opinion">("time_selection");
  const [pollRequestId, setPollRequestId] = useState<string | undefined>(undefined);

  const isLeader = Boolean(isOwner || canStartLive);

  // Real-time socket listener for sessions
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onSessionUpdate = () => {
      qc.invalidateQueries({ queryKey: ["room", room.id] });
    };

    const subscribe = () => {
      socket.emit("room:presence:subscribe", { roomId: room.id });
    };

    if (socket.connected) {
      subscribe();
    }
    socket.on("connect", subscribe);

    socket.on("room:session:created", onSessionUpdate);
    socket.on("room:session:updated", onSessionUpdate);
    socket.on("room:session:deleted", onSessionUpdate);

    return () => {
      socket.off("connect", subscribe);
      socket.off("room:session:created", onSessionUpdate);
      socket.off("room:session:updated", onSessionUpdate);
      socket.off("room:session:deleted", onSessionUpdate);
    };
  }, [room.id, qc]);

  // RSVP Mutation with toggle support
  const rsvpM = useMutation({
    mutationFn: ({ sessionId, status }: { sessionId: string; status: "confirmed" | "declined" }) =>
      api(`/sessions/${sessionId}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, vars) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      if (vars.status === "confirmed") {
        Alert.alert("RSVP Confirmed! 🎉", "You will receive calendar reminders before the session starts.");
      } else {
        Alert.alert("RSVP Cancelled", "You are no longer marked as attending.");
      }
    },
    onError: (err: any) => Alert.alert("RSVP Failed", err.message),
  });

  // Delete/Cancel Session Mutation
  const deleteSessionM = useMutation({
    mutationFn: (sessionId: string) =>
      api(`/rooms/${room.id}/classes/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      Alert.alert("Session Cancelled", "The scheduled live session was removed.");
    },
    onError: (err: any) => Alert.alert("Cancellation Failed", err.message),
  });

  const activeLiveSession = sessions.find((s) => s.status === "live");
  const scheduledSessions = sessions.filter((s) => s.status === "scheduled" || s.status === "draft");

  const voiceCount = scheduledSessions.filter(
    (s) => s.session_type === "voice" || s.media === "audio",
  ).length;
  const videoCount = scheduledSessions.filter(
    (s) => (s.session_type === "video" || !s.session_type) && s.mode !== "offline" && s.media !== "audio",
  ).length;
  const offlineCount = scheduledSessions.filter(
    (s) => s.session_type === "offline" || s.mode === "offline",
  ).length;

  const filteredSessions = scheduledSessions.filter((s) => {
    const type = s.session_type || (s.mode === "offline" ? "offline" : s.media === "audio" ? "voice" : "video");
    if (sessionFormatFilter === "voice") return type === "voice";
    if (sessionFormatFilter === "video") return type === "video";
    if (sessionFormatFilter === "offline") return type === "offline";
    return true;
  });

  // Open modal for a new session
  const handleOpenNewSchedule = () => {
    triggerHaptic();
    setScheduleSessionId(undefined);
    setScheduleTitle("");
    setScheduleDesc("");
    setScheduleType("video");
    setScheduleStartsAt(new Date(Date.now() + 86400000).toISOString());
    setScheduleLocation("");
    setScheduleRequestId(undefined);
    setScheduleModalVisible(true);
  };

  // Open modal to edit existing session
  const handleEditSession = (sess: Session) => {
    triggerHaptic();
    setScheduleSessionId(sess.id);
    setScheduleTitle(sess.title || "");
    setScheduleDesc(sess.description || "");
    const resolvedType =
      sess.session_type || (sess.mode === "offline" ? "offline" : sess.media === "audio" ? "voice" : "video");
    setScheduleType(resolvedType as any);
    setScheduleStartsAt(sess.starts_at);
    setScheduleLocation(sess.campus_location || "");
    setScheduleRequestId(undefined);
    setScheduleModalVisible(true);
  };

  // Convert winning poll time to a scheduled session
  const handleScheduleFromWinningPoll = (winningOption: RoomPollOption) => {
    setScheduleSessionId(undefined);
    setScheduleTitle(`${room.title}: ${winningOption.text}`);
    setScheduleDesc(`Live session scheduled per winning poll vote: "${winningOption.text}"`);
    setScheduleType("video");
    setScheduleStartsAt(new Date(Date.now() + 86400000).toISOString());
    setScheduleLocation("");
    setScheduleRequestId(undefined);
    setScheduleModalVisible(true);
  };

  // Convert member request to a scheduled session
  const handleScheduleFromRequest = (req: RoomSessionRequest) => {
    setScheduleSessionId(undefined);
    setScheduleTitle(req.title);
    setScheduleDesc(req.description || "");
    setScheduleType(req.session_type || "video");
    setScheduleLocation("");
    if (req.preferred_time) {
      setScheduleStartsAt(req.preferred_time);
    }
    setScheduleRequestId(req.id);
    setScheduleModalVisible(true);
  };

  // Convert member request to a time poll
  const handlePollFromRequest = (req: RoomSessionRequest) => {
    setPollQuestion(`When should we hold the session: "${req.title}"?`);
    setPollType("time_selection");
    setPollRequestId(req.id);
    setPollModalVisible(true);
  };

  // Navigate to Live Stage or show Campus Venue dialog
  const handleStartOrJoin = (sess?: Session) => {
    triggerHaptic();
    const resolvedType =
      sess?.session_type || (sess?.mode === "offline" ? "offline" : sess?.media === "audio" ? "voice" : "video");

    if (resolvedType === "offline") {
      const loc = sess?.campus_location || "Campus Venue";
      Alert.alert(
        "📍 Campus Meetup",
        `Location: ${loc}\n\nPlease head to the designated campus location to attend this session in person.`,
        [{ text: "OK" }],
      );
      return;
    }

    const mediaParam = resolvedType === "voice" ? "audio" : "video";
    router.push(`/live/${room.id}?media=${mediaParam}&type=${resolvedType}` as any);
  };

  const formatCountdown = (dateStr: string) => {
    const target = new Date(dateStr).getTime();
    const now = Date.now();
    const diffMs = target - now;

    if (diffMs <= 0 && diffMs > -7200000) {
      return "Happening Now 🔴";
    }
    if (diffMs < 0) {
      return "Ended";
    }
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `Starts in ${diffMins}m`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `Starts in ${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return "Starts Tomorrow";
    return `In ${diffDays} days`;
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Sub-navigation tabs: Sessions vs Assignments vs Q&A */}
      <Row style={[s.subTabsRow, { backgroundColor: colors.surface2 }]}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveSubTab("sessions");
          }}
          style={[
            s.subTabBtn,
            activeSubTab === "sessions" && [s.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <MaterialCommunityIcons
            name="calendar-clock"
            size={16}
            color={activeSubTab === "sessions" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.subTabBtnText,
              { color: activeSubTab === "sessions" ? colors.primary : colors.muted, fontWeight: activeSubTab === "sessions" ? "800" : "600" },
            ]}
          >
            Sessions
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveSubTab("assignments");
          }}
          style={[
            s.subTabBtn,
            activeSubTab === "assignments" && [s.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={16}
            color={activeSubTab === "assignments" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.subTabBtnText,
              { color: activeSubTab === "assignments" ? colors.primary : colors.muted, fontWeight: activeSubTab === "assignments" ? "800" : "600" },
            ]}
          >
            Assignments
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveSubTab("qa");
          }}
          style={[
            s.subTabBtn,
            activeSubTab === "qa" && [s.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={16}
            color={activeSubTab === "qa" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.subTabBtnText,
              { color: activeSubTab === "qa" ? colors.primary : colors.muted, fontWeight: activeSubTab === "qa" ? "800" : "600" },
            ]}
          >
            Q&A Board
          </Text>
        </Pressable>
      </Row>

      {activeSubTab === "sessions" ? (
        <View style={{ gap: 14 }}>
          {/* Active Live Session Banner */}
          {activeLiveSession && (
            <View style={[s.liveCard, { backgroundColor: `${colors.danger}12`, borderColor: colors.danger }]}>
              <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
                  <View style={[s.pulseDot, { backgroundColor: colors.danger }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.liveTitle, { color: colors.danger }]}>
                      {activeLiveSession.title || "Live Classroom In Progress"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {activeLiveSession.session_type === "voice"
                        ? "🎙️ Live Voice Stage"
                        : "📹 Live Video Classroom"}
                    </Text>
                  </View>
                </Row>
                <Pressable
                  onPress={() => handleStartOrJoin(activeLiveSession)}
                  style={[s.joinClassBtn, { backgroundColor: colors.danger }]}
                >
                  <Text style={s.joinClassBtnText}>Join Live →</Text>
                </Pressable>
              </Row>
            </View>
          )}

          {/* Learn Quick Actions Hub */}
          <View style={[s.actionsHubCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={[s.hubTitle, { color: colors.text }]}>Learning & Live Sessions</Text>
              {isLeader ? (
                <View style={[s.roleTag, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[s.roleTagText, { color: colors.primary }]}>Teacher Mode</Text>
                </View>
              ) : null}
            </Row>

            <Row style={{ gap: 8, flexWrap: "wrap" }}>
              {isLeader && (
                <Pressable
                  onPress={handleOpenNewSchedule}
                  style={[s.hubActionBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="calendar-plus" size={16} color="#FFFFFF" />
                  <Text style={s.hubActionBtnTextWhite}>Schedule Session</Text>
                </Pressable>
              )}

              {isLeader && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setPollQuestion("");
                    setPollType("time_selection");
                    setPollRequestId(undefined);
                    setPollModalVisible(true);
                  }}
                  style={[s.hubActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }]}
                >
                  <MaterialCommunityIcons name="poll" size={16} color={colors.primary} />
                  <Text style={[s.hubActionBtnText, { color: colors.text }]}>Ask Live Poll</Text>
                </Pressable>
              )}

              {isLeader && (
                <Pressable
                  onPress={() => handleStartOrJoin()}
                  style={[s.hubActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }]}
                >
                  <MaterialCommunityIcons name="video-wireless" size={16} color={colors.danger} />
                  <Text style={[s.hubActionBtnText, { color: colors.text }]}>Go Live Now</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setActiveSubTab("assignments");
                }}
                style={[s.hubActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }]}
              >
                <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={colors.primary} />
                <Text style={[s.hubActionBtnText, { color: colors.text }]}>Assignments</Text>
              </Pressable>

              {isMember && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setRequestModalVisible(true);
                  }}
                  style={[
                    s.hubActionBtn,
                    {
                      backgroundColor: isLeader ? colors.surface2 : colors.primary,
                      borderColor: isLeader ? colors.border : undefined,
                      borderWidth: isLeader ? 1 : 0,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="lightbulb-on-outline"
                    size={16}
                    color={isLeader ? colors.primary : "#FFFFFF"}
                  />
                  <Text
                    style={
                      isLeader
                        ? [s.hubActionBtnText, { color: colors.text }]
                        : s.hubActionBtnTextWhite
                    }
                  >
                    Request a Session
                  </Text>
                </Pressable>
              )}
            </Row>
          </View>

          {/* Real-Time Live Poll Card */}
          <RoomPollCard
            roomId={room.id}
            isLeader={isLeader}
            onScheduleWinningTime={handleScheduleFromWinningPoll}
          />

          {/* Scheduled Sessions Section */}
          <View style={{ gap: 8 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="calendar-clock" size={18} color={colors.primary} />
                <Text style={[s.sectionHeaderTitle, { color: colors.text }]}>
                  {t("rooms.learn.upcomingSessions")} ({scheduledSessions.length})
                </Text>
              </Row>
              {isLeader && (
                <Pressable onPress={handleOpenNewSchedule} style={s.textLinkBtn}>
                  <Text style={[s.textLink, { color: colors.primary }]}>+ Schedule</Text>
                </Pressable>
              )}
            </Row>

            {/* Filter Pills for formats */}
            {scheduledSessions.length > 0 && (
              <Row style={{ gap: 6 }}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setSessionFormatFilter("all");
                  }}
                  style={[
                    s.formatFilterPill,
                    {
                      backgroundColor: sessionFormatFilter === "all" ? colors.primarySoft : colors.surface,
                      borderColor: sessionFormatFilter === "all" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.formatFilterText,
                      { color: sessionFormatFilter === "all" ? colors.primary : colors.muted, fontWeight: sessionFormatFilter === "all" ? "800" : "600" },
                    ]}
                  >
                    All ({scheduledSessions.length})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setSessionFormatFilter("video");
                  }}
                  style={[
                    s.formatFilterPill,
                    {
                      backgroundColor: sessionFormatFilter === "video" ? colors.primarySoft : colors.surface,
                      borderColor: sessionFormatFilter === "video" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.formatFilterText,
                      { color: sessionFormatFilter === "video" ? colors.primary : colors.muted, fontWeight: sessionFormatFilter === "video" ? "800" : "600" },
                    ]}
                  >
                    📹 Video ({videoCount})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setSessionFormatFilter("voice");
                  }}
                  style={[
                    s.formatFilterPill,
                    {
                      backgroundColor: sessionFormatFilter === "voice" ? colors.primarySoft : colors.surface,
                      borderColor: sessionFormatFilter === "voice" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.formatFilterText,
                      { color: sessionFormatFilter === "voice" ? colors.primary : colors.muted, fontWeight: sessionFormatFilter === "voice" ? "800" : "600" },
                    ]}
                  >
                    🎙️ Voice ({voiceCount})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setSessionFormatFilter("offline");
                  }}
                  style={[
                    s.formatFilterPill,
                    {
                      backgroundColor: sessionFormatFilter === "offline" ? colors.primarySoft : colors.surface,
                      borderColor: sessionFormatFilter === "offline" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.formatFilterText,
                      { color: sessionFormatFilter === "offline" ? colors.primary : colors.muted, fontWeight: sessionFormatFilter === "offline" ? "800" : "600" },
                    ]}
                  >
                    📍 Campus ({offlineCount})
                  </Text>
                </Pressable>
              </Row>
            )}

            {filteredSessions.length > 0 ? (
              <View style={{ gap: 10 }}>
                {filteredSessions.map((sess) => {
                  const resolvedType =
                    sess.session_type ||
                    (sess.mode === "offline"
                      ? "offline"
                      : sess.media === "audio"
                      ? "voice"
                      : "video");

                  const typeBadgeInfo =
                    resolvedType === "voice"
                      ? { icon: "microphone-outline", label: "🎙️ Voice Live" }
                      : resolvedType === "offline"
                      ? { icon: "map-marker-outline", label: "📍 Campus Meetup" }
                      : { icon: "video-outline", label: "📹 Video Classroom" };

                  const sessionDate = new Date(sess.starts_at);
                  const countdownText = formatCountdown(sess.starts_at);
                  const isAttending = Boolean(sess.is_attending);

                  return (
                    <View
                      key={sess.id}
                      style={[s.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <View style={[s.typePill, { backgroundColor: colors.primarySoft }]}>
                            <MaterialCommunityIcons name={typeBadgeInfo.icon as any} size={12} color={colors.primary} />
                            <Text style={[s.typePillText, { color: colors.primary }]}>{typeBadgeInfo.label}</Text>
                          </View>
                          <View style={[s.countdownTag, { backgroundColor: colors.surface2 }]}>
                            <Text style={[s.countdownTagText, { color: colors.primary }]}>{countdownText}</Text>
                          </View>
                        </Row>

                        <Text style={[s.sessionDate, { color: colors.muted }]}>
                          {sessionDate.toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })} · {sessionDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </Row>

                      <Text style={[s.sessionTitle, { color: colors.text }]}>
                        {sess.title || `${room.title} Study Session`}
                      </Text>

                      {Boolean(sess.description) && (
                        <Text style={[s.sessionDesc, { color: colors.muted }]} numberOfLines={2}>
                          {sess.description}
                        </Text>
                      )}

                      {Boolean(sess.campus_location) && (
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name="map-marker" size={14} color={colors.muted} />
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{sess.campus_location}</Text>
                        </Row>
                      )}

                      {/* RSVP, Attendee count and Leader Actions */}
                      <Row style={[s.sessionFooterRow, { borderTopColor: colors.border }]}>
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name="account-group-outline" size={15} color={colors.muted} />
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            {sess.attendees_count || 0} attending
                            {isAttending ? " (You're going)" : ""}
                          </Text>
                        </Row>

                        <Row style={{ gap: 6, alignItems: "center" }}>
                          {isMember && (
                            <Pressable
                              onPress={() => {
                                if (isAttending) {
                                  Alert.alert(
                                    "Change RSVP?",
                                    "Cancel your attendance for this session?",
                                    [
                                      { text: "Keep Attending", style: "cancel" },
                                      {
                                        text: "Cancel RSVP",
                                        style: "destructive",
                                        onPress: () => rsvpM.mutate({ sessionId: sess.id, status: "declined" }),
                                      },
                                    ],
                                  );
                                } else {
                                  rsvpM.mutate({ sessionId: sess.id, status: "confirmed" });
                                }
                              }}
                              disabled={rsvpM.isPending}
                              style={[
                                s.rsvpBtn,
                                {
                                  backgroundColor: isAttending ? `${colors.primary}22` : colors.primarySoft,
                                  borderColor: colors.primary,
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isAttending ? "check-circle" : "calendar-check"}
                                size={13}
                                color={colors.primary}
                              />
                              <Text style={[s.rsvpBtnText, { color: colors.primary, fontWeight: isAttending ? "800" : "700" }]}>
                                {isAttending ? "Going ✓" : "I'm Going"}
                              </Text>
                            </Pressable>
                          )}

                          {isLeader && (
                            <Pressable
                              onPress={() => handleEditSession(sess)}
                              style={[s.iconActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.text} />
                            </Pressable>
                          )}

                          {isLeader && (
                            <Pressable
                              onPress={() => {
                                Alert.alert(
                                  "Cancel Session?",
                                  "Are you sure you want to cancel and remove this scheduled session?",
                                  [
                                    { text: "No", style: "cancel" },
                                    {
                                      text: "Cancel Session",
                                      style: "destructive",
                                      onPress: () => deleteSessionM.mutate(sess.id),
                                    },
                                  ],
                                );
                              }}
                              style={[s.iconActionBtn, { backgroundColor: colors.surface2, borderColor: colors.danger }]}
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.danger} />
                            </Pressable>
                          )}

                          {isLeader && (
                            <Pressable
                              onPress={() => handleStartOrJoin(sess)}
                              style={[s.startBtn, { backgroundColor: colors.primary }]}
                            >
                              <Text style={s.startBtnText}>
                                {resolvedType === "offline" ? "Venue Info" : "Start Live"}
                              </Text>
                            </Pressable>
                          )}
                        </Row>
                      </Row>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[s.emptySessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={32} color={colors.muted} />
                <Text style={[s.emptySessionTitle, { color: colors.text }]}>No matching scheduled sessions</Text>
                <Text style={[s.emptySessionSub, { color: colors.muted }]}>
                  Sessions scheduled by teachers (Voice, Offline, Video) will appear here.
                </Text>
                {isLeader ? (
                  <Pressable
                    onPress={handleOpenNewSchedule}
                    style={[s.volunteerBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Text style={[s.volunteerBtnText, { color: colors.primary }]}>+ Schedule Live Session</Text>
                  </Pressable>
                ) : onVolunteer ? (
                  <Pressable
                    onPress={onVolunteer}
                    style={[s.volunteerBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Text style={[s.volunteerBtnText, { color: colors.primary }]}>Volunteer to Teach</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          {/* Member Session Requests List */}
          <RoomSessionRequestsList
            roomId={room.id}
            isLeader={isLeader}
            onRequestSchedule={handleScheduleFromRequest}
            onRequestPoll={handlePollFromRequest}
          />

          {/* Teaching Volunteers (Owner View) */}
          {isOwner && teachingRequests.length > 0 ? (
            <View style={s.teachingRequestsSection}>
              <SectionHeader title={`Teaching Volunteers (${teachingRequests.length})`} />
              {teachingRequests.map((req) => (
                <View key={req.id} style={[s.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", gap: 10 }}>
                    <View style={[s.reqAvatar, { backgroundColor: colors.primarySoft }]}>
                      <Text style={{ color: colors.primary, fontWeight: "900" }}>
                        {req.volunteer?.full_name?.[0] || "U"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.reqName, { color: colors.text }]}>{req.volunteer?.full_name}</Text>
                      <Text style={[s.reqSub, { color: colors.muted }]}>@{req.volunteer?.username}</Text>
                    </View>
                    <Row style={{ gap: 6 }}>
                      {onAcceptVolunteer && (
                        <Pressable
                          onPress={() => onAcceptVolunteer(req.id)}
                          style={[s.actionPill, { backgroundColor: colors.primary }]}
                        >
                          <Text style={s.actionPillText}>Approve</Text>
                        </Pressable>
                      )}
                      {onRejectVolunteer && (
                        <Pressable
                          onPress={() => onRejectVolunteer(req.id)}
                          style={[s.actionPill, { backgroundColor: colors.surface2 }]}
                        >
                          <Text style={[s.actionPillText, { color: colors.muted }]}>Decline</Text>
                        </Pressable>
                      )}
                    </Row>
                  </Row>
                </View>
              ))}
            </View>
          ) : null}

          {/* Room Attendance Card */}
          <RoomAttendanceCard roomId={room.id} />
        </View>
      ) : activeSubTab === "assignments" ? (
        /* Assignments & Submissions Vault */
        <RoomAssignmentsList
          roomId={room.id}
          isLeader={isLeader}
          isMember={Boolean(isMember || isOwner)}
        />
      ) : (
        /* Q&A Board Tab */
        <RoomQABoard roomId={room.id} isMember={Boolean(isMember ?? isOwner)} />
      )}

      {/* Schedule Live Session Modal */}
      <RoomScheduleModal
        visible={scheduleModalVisible}
        roomId={room.id}
        sessionId={scheduleSessionId}
        initialTitle={scheduleTitle}
        initialDescription={scheduleDesc}
        initialType={scheduleType}
        initialStartsAt={scheduleStartsAt}
        initialLocation={scheduleLocation}
        requestId={scheduleRequestId}
        onClose={() => {
          setScheduleModalVisible(false);
          setScheduleSessionId(undefined);
          setScheduleLocation(undefined);
        }}
      />

      {/* Member Request Session Modal */}
      <RoomSessionRequestModal
        visible={requestModalVisible}
        roomId={room.id}
        onClose={() => setRequestModalVisible(false)}
      />

      {/* Create Real-Time Poll Modal */}
      <CreatePollModal
        visible={pollModalVisible}
        roomId={room.id}
        initialQuestion={pollQuestion}
        initialPollType={pollType}
        targetRequestId={pollRequestId}
        onClose={() => setPollModalVisible(false)}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 12,
  },
  subTabsRow: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  subTabBtnActive: {
    borderWidth: 1,
  },
  subTabBtnText: {
    fontSize: 12,
  },
  liveCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  joinClassBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  joinClassBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  actionsHubCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "700",
  },
  hubActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  hubActionBtnTextWhite: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  hubActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  textLinkBtn: {
    padding: 4,
  },
  textLink: {
    fontSize: 12,
    fontWeight: "700",
  },
  formatFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  formatFilterText: {
    fontSize: 11,
  },
  sessionCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  countdownTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countdownTagText: {
    fontSize: 10,
    fontWeight: "700",
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: "600",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  sessionDesc: {
    fontSize: 12,
  },
  sessionFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rsvpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  rsvpBtnText: {
    fontSize: 11,
  },
  iconActionBtn: {
    padding: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  startBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  emptySessionCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  emptySessionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySessionSub: {
    fontSize: 12,
    textAlign: "center",
  },
  volunteerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  volunteerBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  teachingRequestsSection: {
    gap: 8,
    marginTop: 4,
  },
  requestCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reqAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  reqName: {
    fontSize: 13,
    fontWeight: "700",
  },
  reqSub: {
    fontSize: 11,
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  actionPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
