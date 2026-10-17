import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type ParticipantTelemetry = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  isOnline: boolean;
  audioActive: boolean;
  videoActive: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  latencyMs: number;
  packetLossPercent: number;
  networkQuality: "excellent" | "good" | "fair" | "poor" | "offline";
};

type RoomMonitoringData = {
  monitoring: {
    room: {
      id: string;
      title: string;
      capacity: number;
      totalMembers: number;
      onlineCount: number;
      knockModeEnabled: boolean;
      isLocked: boolean;
      status: string;
      uptimeSeconds: number;
      pendingKnocksCount: number;
    };
    participants: ParticipantTelemetry[];
    telemetry: {
      averageLatencyMs: number;
      packetLossPercent: number;
      audioStreamsActive: number;
      videoStreamsActive: number;
      serverHealth: string;
    };
  };
};

type RoomMonitoringCenterModalProps = {
  roomId: string;
  visible: boolean;
  onClose: () => void;
  onOpenKnockRequests?: () => void;
  isHost?: boolean;
};

export function RoomMonitoringCenterModal({
  roomId,
  visible,
  onClose,
  onOpenKnockRequests,
  isHost = true,
}: RoomMonitoringCenterModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [filterRole, setFilterRole] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery<RoomMonitoringData>({
    queryKey: ["room-monitoring", roomId],
    queryFn: () => api<RoomMonitoringData>(`/rooms/${roomId}/monitoring`),
    enabled: visible,
    refetchInterval: visible ? 4000 : false,
  });

  // Real-time socket event updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !visible) return;

    const handleRoomEvent = () => refetch();
    socket.on("room:event", handleRoomEvent);
    socket.on("room:action:lock-changed", handleRoomEvent);
    socket.on("room:knock:mode-changed", handleRoomEvent);

    return () => {
      socket.off("room:event", handleRoomEvent);
      socket.off("room:action:lock-changed", handleRoomEvent);
      socket.off("room:knock:mode-changed", handleRoomEvent);
    };
  }, [visible, refetch]);

  // Moderator Action mutation
  const actionMutation = useMutation({
    mutationFn: (body: { action: string; targetUserId?: string; reason?: string }) =>
      api(`/rooms/${roomId}/monitoring/action`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-monitoring", roomId] });
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      let message = "Action executed successfully.";
      if (variables.action === "mute_all") message = "All participants have been muted.";
      else if (variables.action === "remote_mute") message = "User microphone has been muted.";
      else if (variables.action === "kick_user") message = "User has been removed from the room.";
      Alert.alert("Moderator Control", message);
    },
    onError: (err: Error) => Alert.alert("Action Failed", err.message || "Failed to execute moderation command"),
  });

  const monitoring = data?.monitoring;
  const roomMeta = monitoring?.room;
  const telemetry = monitoring?.telemetry;
  const allParticipants = monitoring?.participants ?? [];

  const participants =
    filterRole === "all"
      ? allParticipants
      : allParticipants.filter((p) => (filterRole === "online" ? p.isOnline : p.role === filterRole));

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[s.root, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <Row style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            style={s.backBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={[s.headerTitle, { color: colors.text }]}>Room Monitoring Center</Text>
            <Text style={[s.headerSub, { color: colors.muted }]}>Live Telemetry & Moderation Guard</Text>
          </View>
          <Pressable onPress={() => refetch()} style={s.refreshBtn}>
            <MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />
          </Pressable>
        </Row>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Health & Telemetry Metrics Cards */}
          <View style={s.metricsGrid}>
            <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.metricLabel, { color: colors.muted }]}>ATTENDANCE</Text>
                <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
              </Row>
              <Text style={[s.metricVal, { color: colors.text }]}>
                {roomMeta?.onlineCount ?? 0}
                <Text style={[s.metricSubVal, { color: colors.muted }]}> / {roomMeta?.capacity ?? 30}</Text>
              </Text>
              <Text style={[s.metricFooter, { color: colors.muted }]}>
                {roomMeta?.totalMembers ?? 0} registered members
              </Text>
            </View>

            <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.metricLabel, { color: colors.muted }]}>STREAM QUALITY</Text>
                <MaterialCommunityIcons name="speedometer" size={18} color="#10B981" />
              </Row>
              <Text style={[s.metricVal, { color: "#10B981" }]}>
                {telemetry?.averageLatencyMs ?? 35}
                <Text style={[s.metricSubVal, { color: colors.muted }]}> ms RTT</Text>
              </Text>
              <Text style={[s.metricFooter, { color: colors.muted }]}>
                Packet loss: {telemetry?.packetLossPercent ?? 0}% (Optimal)
              </Text>
            </View>

            <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.metricLabel, { color: colors.muted }]}>AUDIO DENSITY</Text>
                <MaterialCommunityIcons name="microphone-outline" size={18} color="#F59E0B" />
              </Row>
              <Text style={[s.metricVal, { color: colors.text }]}>
                {telemetry?.audioStreamsActive ?? 0}
                <Text style={[s.metricSubVal, { color: colors.muted }]}> active</Text>
              </Text>
              <Text style={[s.metricFooter, { color: colors.muted }]}>
                Uptime: {formatUptime(roomMeta?.uptimeSeconds ?? 0)}
              </Text>
            </View>

            <View style={[s.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.metricLabel, { color: colors.muted }]}>SECURITY</Text>
                <MaterialCommunityIcons
                  name={roomMeta?.knockModeEnabled ? "door-closed-lock" : "door-open"}
                  size={18}
                  color={roomMeta?.knockModeEnabled ? "#F59E0B" : "#10B981"}
                />
              </Row>
              <Text
                style={[
                  s.metricVal,
                  { color: roomMeta?.knockModeEnabled ? "#F59E0B" : "#10B981", fontSize: 16 },
                ]}
              >
                {roomMeta?.knockModeEnabled ? "Knock Required" : "Open to All"}
              </Text>
              {Boolean(roomMeta?.pendingKnocksCount) && (
                <Pressable
                  onPress={() => {
                    onClose();
                    if (onOpenKnockRequests) onOpenKnockRequests();
                  }}
                  style={{ marginTop: 2 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                    🔔 {roomMeta?.pendingKnocksCount} waiting in lobby →
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Master Moderator Actions Card */}
          <View style={[s.masterControlsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.cardHeading, { color: colors.text }]}>Host Interventions</Text>
            <View style={s.btnGrid}>
              <Pressable
                onPress={() => {
                  Alert.alert(
                    "Mute All Participants?",
                    "This will immediately mute the microphones of all non-host participants.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Mute All",
                        style: "destructive",
                        onPress: () => actionMutation.mutate({ action: "mute_all" }),
                      },
                    ],
                  );
                }}
                disabled={actionMutation.isPending}
                style={[s.actionBtn, { backgroundColor: "#EF444415", borderColor: "#EF444440" }]}
              >
                <MaterialCommunityIcons name="microphone-off" size={18} color={colors.danger} />
                <Text style={[s.actionBtnTxt, { color: colors.danger }]}>Mute All</Text>
              </Pressable>

              <Pressable
                onPress={() => actionMutation.mutate({ action: "toggle_lock" })}
                disabled={actionMutation.isPending}
                style={[
                  s.actionBtn,
                  {
                    backgroundColor: roomMeta?.isLocked ? "#EF444415" : colors.surface2,
                    borderColor: roomMeta?.isLocked ? "#EF444440" : colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={roomMeta?.isLocked ? "lock" : "lock-open-outline"}
                  size={18}
                  color={roomMeta?.isLocked ? colors.danger : colors.text}
                />
                <Text
                  style={[
                    s.actionBtnTxt,
                    { color: roomMeta?.isLocked ? colors.danger : colors.text },
                  ]}
                >
                  {roomMeta?.isLocked ? "Unlock Room" : "Lock Room"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (onOpenKnockRequests) {
                    onClose();
                    onOpenKnockRequests();
                  }
                }}
                style={[s.actionBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="account-clock" size={18} color={colors.primary} />
                <Text style={[s.actionBtnTxt, { color: colors.primary }]}>Lobby & Knocks</Text>
              </Pressable>
            </View>
          </View>

          {/* Participant Inspector */}
          <View style={[s.participantSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[s.cardHeading, { color: colors.text }]}>
                Participant Inspector ({allParticipants.length})
              </Text>
              {/* Filter pills */}
              <Row style={{ gap: 6 }}>
                {["all", "online", "moderator"].map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setFilterRole(f)}
                    style={[
                      s.filterPill,
                      {
                        backgroundColor: filterRole === f ? colors.primary : colors.surface2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.filterTxt,
                        { color: filterRole === f ? "#FFFFFF" : colors.muted },
                      ]}
                    >
                      {f.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </Row>

            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : participants.length === 0 ? (
              <Text style={[s.noParticipantTxt, { color: colors.muted }]}>No matching participants found.</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {participants.map((p) => {
                  const isHost = p.role === "owner" || p.role === "host";
                  return (
                    <View
                      key={p.id}
                      style={[
                        s.participantRow,
                        { backgroundColor: colors.surface2, borderColor: colors.border },
                      ]}
                    >
                      <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={s.avatarWrapper}>
                          {p.avatarUrl ? (
                            <Image source={{ uri: p.avatarUrl }} style={s.avatarImg} />
                          ) : (
                            <View style={[s.avatarImg, s.avatarFallback, { backgroundColor: colors.primary }]}>
                              <Text style={s.avatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                          <View
                            style={[
                              s.statusDot,
                              { backgroundColor: p.isOnline ? "#10B981" : colors.muted },
                            ]}
                          />
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <Row style={{ alignItems: "center", gap: 6 }}>
                            <Text style={[s.participantName, { color: colors.text }]} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <View
                              style={[
                                s.roleBadge,
                                {
                                  backgroundColor: isHost
                                    ? "#F59E0B20"
                                    : p.role === "moderator"
                                      ? "#3B82F620"
                                      : colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  s.roleText,
                                  {
                                    color: isHost
                                      ? "#F59E0B"
                                      : p.role === "moderator"
                                        ? "#3B82F6"
                                        : colors.muted,
                                  },
                                ]}
                              >
                                {p.role}
                              </Text>
                            </View>
                          </Row>

                          <Row style={{ alignItems: "center", gap: 10 }}>
                            <Text style={[s.telemetrySub, { color: colors.muted }]}>
                              {p.isOnline ? `${p.latencyMs} ms RTT` : "Offline"}
                            </Text>
                            {p.isOnline && (
                              <View style={[s.qualityBadge, { backgroundColor: "#10B98115" }]}>
                                <Text style={s.qualityText}>{p.networkQuality.toUpperCase()}</Text>
                              </View>
                            )}
                          </Row>
                        </View>
                      </Row>

                      {/* Individual Participant Moderation Controls */}
                      {!isHost && (
                        <Row style={{ gap: 6, alignItems: "center" }}>
                          <Pressable
                            onPress={() =>
                              actionMutation.mutate({
                                action: "remote_mute",
                                targetUserId: p.id,
                                reason: "Host muted microphone",
                              })
                            }
                            disabled={actionMutation.isPending}
                            style={[s.miniActionBtn, { backgroundColor: colors.surface }]}
                          >
                            <MaterialCommunityIcons name="microphone-off" size={16} color={colors.text} />
                          </Pressable>

                          <Pressable
                            onPress={() =>
                              actionMutation.mutate({
                                action: "remote_video_off",
                                targetUserId: p.id,
                                reason: "Host stopped camera feed",
                              })
                            }
                            disabled={actionMutation.isPending}
                            style={[s.miniActionBtn, { backgroundColor: colors.surface }]}
                          >
                            <MaterialCommunityIcons name="camera-off" size={16} color={colors.text} />
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              Alert.alert(
                                `Kick ${p.name}?`,
                                "This will disconnect the user and remove them from the room.",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Kick",
                                    style: "destructive",
                                    onPress: () =>
                                      actionMutation.mutate({
                                        action: "kick_user",
                                        targetUserId: p.id,
                                        reason: "Kicked by room host",
                                      }),
                                  },
                                ],
                              );
                            }}
                            disabled={actionMutation.isPending}
                            style={[s.miniActionBtn, { backgroundColor: "#EF444420" }]}
                          >
                            <MaterialCommunityIcons name="account-remove" size={16} color={colors.danger} />
                          </Pressable>
                        </Row>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    height: 56,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "48%",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metricVal: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  metricSubVal: {
    fontSize: 13,
    fontWeight: "600",
  },
  metricFooter: {
    fontSize: 11,
    marginTop: 2,
  },
  masterControlsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: "700",
  },
  btnGrid: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
  },
  participantSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  filterPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  filterTxt: {
    fontSize: 10,
    fontWeight: "800",
  },
  noParticipantTxt: {
    fontSize: 13,
    textAlign: "center",
    marginVertical: 14,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
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
  participantName: {
    fontSize: 14,
    fontWeight: "700",
    maxWidth: 140,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  telemetrySub: {
    fontSize: 11,
  },
  qualityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  qualityText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#10B981",
  },
  miniActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
