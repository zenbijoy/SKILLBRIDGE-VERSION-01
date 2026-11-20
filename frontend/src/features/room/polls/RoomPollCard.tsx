import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { getSocket } from "@/lib/socket";
import { CreatePollModal } from "./CreatePollModal";

export type RoomPollOption = {
  id: string;
  text: string;
  votes: number;
};

export type RoomPoll = {
  id: string;
  room_id: string;
  title: string;
  body: string;
  created_at: string;
  metadata: {
    kind: string;
    poll_type?: "time_selection" | "opinion";
    options: RoomPollOption[];
    total_votes: number;
    is_open: boolean;
    winning_option?: RoomPollOption | null;
    target_request_id?: string | null;
    created_by?: string;
  };
};

type RoomPollCardProps = {
  roomId: string;
  isLeader?: boolean;
  onScheduleWinningTime?: (winningOption: RoomPollOption) => void;
};

export function RoomPollCard({ roomId, isLeader, onScheduleWinningTime }: RoomPollCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const activeQ = useQuery({
    queryKey: ["room-poll-active", roomId],
    queryFn: () => api<{ poll: RoomPoll | null; userVote: string | null }>(`/rooms/${roomId}/polls/active`),
    refetchInterval: 12000,
  });

  const historyQ = useQuery({
    queryKey: ["room-polls", roomId],
    queryFn: () => api<{ polls: RoomPoll[] }>(`/rooms/${roomId}/polls`),
    enabled: activeTab === "history",
  });

  const poll = activeQ.data?.poll ?? null;
  const userVote = activeQ.data?.userVote ?? null;
  const meta = poll?.metadata;
  const total = meta?.total_votes ?? 0;
  const isOpen = meta?.is_open !== false;
  const isTimeSelection = meta?.poll_type === "time_selection";

  // Real-time socket synchronization
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onPollUpdated = () => {
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
    };

    const onPollVoted = (data: any) => {
      qc.setQueryData(["room-poll-active", roomId], (old: any) => {
        if (!old || !old.poll || old.poll.id !== data.pollId) return old;
        return {
          ...old,
          poll: {
            ...old.poll,
            metadata: {
              ...old.poll.metadata,
              options: data.options,
              total_votes: data.total_votes,
            },
          },
        };
      });
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
    };

    const onPollClosed = (data: any) => {
      qc.setQueryData(["room-poll-active", roomId], (old: any) => {
        if (!old || !old.poll || old.poll.id !== data.pollId) return old;
        return {
          ...old,
          poll: {
            ...old.poll,
            metadata: {
              ...old.poll.metadata,
              is_open: false,
              winning_option: data.winningOption,
              options: data.options,
              total_votes: data.total_votes,
            },
          },
        };
      });
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
    };

    const subscribe = () => {
      socket.emit("room:presence:subscribe", { roomId });
    };

    if (socket.connected) {
      subscribe();
    }
    socket.on("connect", subscribe);

    socket.on("room:poll:created", onPollUpdated);
    socket.on("room:poll:voted", onPollVoted);
    socket.on("room:poll:closed", onPollClosed);
    socket.on("room:poll:deleted", onPollUpdated);
    socket.on("room:poll:updated", onPollUpdated);

    return () => {
      socket.off("connect", subscribe);
      socket.off("room:poll:created", onPollUpdated);
      socket.off("room:poll:voted", onPollVoted);
      socket.off("room:poll:closed", onPollClosed);
      socket.off("room:poll:deleted", onPollUpdated);
      socket.off("room:poll:updated", onPollUpdated);
    };
  }, [roomId, qc]);

  // Vote Mutation
  const voteM = useMutation({
    mutationFn: (optionId: string) =>
      api<{ success: boolean; options: RoomPollOption[]; total_votes: number; userVote: string }>(
        `/rooms/${roomId}/polls/${poll!.id}/vote`,
        { method: "POST", body: JSON.stringify({ optionId }) },
      ),
    onSuccess: (data) => {
      triggerHaptic();
      qc.setQueryData(["room-poll-active", roomId], (old: any) => {
        if (!old || !old.poll) return old;
        return {
          ...old,
          userVote: data.userVote,
          poll: {
            ...old.poll,
            metadata: {
              ...old.poll.metadata,
              options: data.options,
              total_votes: data.total_votes,
            },
          },
        };
      });
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
    },
    onError: (err: any) => Alert.alert("Vote failed", err.message),
  });

  // Close Poll Mutation
  const closeM = useMutation({
    mutationFn: (targetPollId?: string | void) =>
      api<{ success: boolean; winningOption: RoomPollOption }>(
        `/rooms/${roomId}/polls/${targetPollId || poll!.id}/close`,
        { method: "PATCH" },
      ),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
      Alert.alert("Poll Closed", "Voting has ended and final results are locked.");
    },
    onError: (err: any) => Alert.alert("Error closing poll", err.message),
  });

  // Announce in Room Chat Mutation
  const announceM = useMutation({
    mutationFn: (targetPollId: string) =>
      api(`/rooms/${roomId}/polls/${targetPollId}/announce`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Announced in Chat! 📢", "Poll results were shared in the room's main chat channel.");
    },
    onError: (err: any) => Alert.alert("Announcement Failed", err.message),
  });

  // Delete Poll Mutation
  const deleteM = useMutation({
    mutationFn: (targetPollId?: string | void) =>
      api(`/rooms/${roomId}/polls/${targetPollId || poll!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      qc.invalidateQueries({ queryKey: ["room-polls", roomId] });
      Alert.alert("Poll Deleted", "The poll was removed.");
    },
    onError: (err: any) => Alert.alert("Error deleting poll", err.message),
  });

  const winningOption =
    meta?.winning_option ||
    (!isOpen && meta?.options
      ? meta.options.reduce((best, cur) => ((cur.votes || 0) > (best?.votes || 0) ? cur : best), meta.options[0])
      : null);

  const pastPolls = (historyQ.data?.polls || []).filter((p) => p.id !== poll?.id);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <Row style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="poll" size={20} color={colors.primary} />
          <Text style={[s.title, { color: colors.text }]}>{t("rooms.polls.livePoll")}</Text>

          {isOpen && poll && (
            <View style={[s.livePulseTag, { backgroundColor: `${colors.danger}18` }]}>
              <View style={[s.pulseDot, { backgroundColor: colors.danger }]} />
              <Text style={[s.livePulseText, { color: colors.danger }]}>LIVE</Text>
            </View>
          )}

          {isTimeSelection && (
            <View style={[s.typeBadge, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={colors.primary} />
              <Text style={[s.typeBadgeText, { color: colors.primary }]}>Time Voting</Text>
            </View>
          )}

          {!isOpen && poll && (
            <View style={[s.closedBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={[s.closedBadgeText, { color: colors.muted }]}>{t("rooms.polls.closed")}</Text>
            </View>
          )}
        </Row>

        {isLeader && (
          <Row style={{ gap: 6 }}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setCreateModalVisible(true);
              }}
              style={[s.miniActionBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
              <Text style={[s.miniActionText, { color: colors.primary }]}>New Poll</Text>
            </Pressable>
          </Row>
        )}
      </Row>

      {/* Sub-tabs: Active Poll vs History */}
      <Row style={[s.tabPillsRow, { backgroundColor: colors.surface2 }]}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("active");
          }}
          style={[
            s.tabPill,
            activeTab === "active" && [s.tabPillActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              s.tabPillText,
              { color: activeTab === "active" ? colors.primary : colors.muted, fontWeight: activeTab === "active" ? "800" : "600" },
            ]}
          >
            Active Poll
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("history");
          }}
          style={[
            s.tabPill,
            activeTab === "history" && [s.tabPillActive, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              s.tabPillText,
              { color: activeTab === "history" ? colors.primary : colors.muted, fontWeight: activeTab === "history" ? "800" : "600" },
            ]}
          >
            Past Polls
          </Text>
        </Pressable>
      </Row>

      {activeTab === "active" ? (
        !poll ? (
          <View style={s.emptyPollBox}>
            <MaterialCommunityIcons name="vote-outline" size={32} color={colors.muted} />
            <Text style={[s.sub, { color: colors.muted }]}>{t("rooms.polls.noPoll")}</Text>
            {isLeader && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setCreateModalVisible(true);
                }}
                style={[s.startPollBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color={colors.primary} />
                <Text style={[s.startPollBtnText, { color: colors.primary }]}>{t("rooms.polls.createPoll")}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {/* Question Title */}
            <Text style={[s.question, { color: colors.text }]}>{poll.title}</Text>

            {/* Winner Banner if closed */}
            {!isOpen && winningOption && (
              <View style={[s.winnerBanner, { backgroundColor: `${colors.primary}12`, borderColor: colors.primary }]}>
                <Row style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <Row style={{ alignItems: "center", gap: 6, flex: 1 }}>
                    <MaterialCommunityIcons name="trophy-award" size={18} color={colors.primary} />
                    <Text style={[s.winnerText, { color: colors.text }]} numberOfLines={1}>
                      Winner: <Text style={{ fontWeight: "800", color: colors.primary }}>{winningOption.text}</Text>
                    </Text>
                  </Row>

                  <Row style={{ gap: 6 }}>
                    {isLeader && (
                      <Pressable
                        onPress={() => announceM.mutate(poll.id)}
                        disabled={announceM.isPending}
                        style={[s.announceBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                      >
                        <MaterialCommunityIcons name="bullhorn-outline" size={13} color={colors.text} />
                        <Text style={[s.announceBtnText, { color: colors.text }]}>Announce</Text>
                      </Pressable>
                    )}

                    {isLeader && isTimeSelection && onScheduleWinningTime && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic();
                          onScheduleWinningTime(winningOption);
                        }}
                        style={[s.scheduleWinnerBtn, { backgroundColor: colors.primary }]}
                      >
                        <Text style={s.scheduleWinnerBtnText}>Schedule Live 🚀</Text>
                      </Pressable>
                    )}
                  </Row>
                </Row>
              </View>
            )}

            {/* Voting Options */}
            {meta?.options?.map((o) => {
              const pct = total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
              const isSelected = userVote === o.id;
              const isWinner = !isOpen && winningOption?.id === o.id;

              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  accessibilityLabel={o.text}
                  disabled={!isOpen || voteM.isPending}
                  onPress={() => {
                    triggerHaptic();
                    voteM.mutate(o.id);
                  }}
                  style={[
                    s.opt,
                    {
                      borderColor: isWinner ? colors.primary : isSelected ? colors.primary : colors.border,
                      backgroundColor: colors.surface2,
                      borderWidth: isSelected || isWinner ? 1.5 : 1,
                    },
                  ]}
                >
                  {/* Progress bar fill */}
                  <View
                    style={[
                      s.fill,
                      {
                        width: `${pct}%`,
                        backgroundColor: isSelected ? `${colors.primary}33` : `${colors.primary}18`,
                      },
                    ]}
                  />

                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 8, flex: 1, paddingRight: 8 }}>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
                      )}
                      <Text
                        style={[
                          s.optTxt,
                          {
                            color: colors.text,
                            fontWeight: isSelected ? "800" : "600",
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {o.text}
                      </Text>
                    </Row>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Text style={[s.voteCount, { color: colors.muted }]}>{o.votes ?? 0}</Text>
                      <Text style={[s.pct, { color: colors.primary }]}>{pct}%</Text>
                    </Row>
                  </Row>
                </Pressable>
              );
            })}

            {/* Bottom Info & Leader Actions */}
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <Text style={[s.sub, { color: colors.muted }]}>
                {total} {t("rooms.polls.votesCount")}
              </Text>

              {isLeader && isOpen && (
                <Row style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      if (!poll?.id) return;
                      Alert.alert("Close Poll?", "Are you sure you want to end voting for this poll?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Close Poll", style: "destructive", onPress: () => closeM.mutate(poll.id) },
                      ]);
                    }}
                    style={[s.leaderOptBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[s.leaderOptText, { color: colors.muted }]}>{t("rooms.polls.closePoll")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!poll?.id) return;
                      Alert.alert("Delete Poll?", "This will permanently remove the poll.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteM.mutate(poll.id) },
                      ]);
                    }}
                    style={[s.leaderOptBtn, { borderColor: colors.danger }]}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.danger} />
                  </Pressable>
                </Row>
              )}
            </Row>
          </View>
        )
      ) : (
        /* History / Past Polls Tab */
        <View style={{ gap: 10, marginTop: 8 }}>
          {pastPolls.length === 0 ? (
            <View style={s.emptyPollBox}>
              <Text style={[s.sub, { color: colors.muted }]}>No archived past polls.</Text>
            </View>
          ) : (
            pastPolls.map((p) => {
              const pMeta = p.metadata || ({} as any);
              const pOptions: RoomPollOption[] = pMeta.options || [];
              const pWinning =
                pMeta.winning_option ||
                pOptions.reduce((b, c) => ((c.votes || 0) > (b?.votes || 0) ? c : b), pOptions[0] || null);

              return (
                <View
                  key={p.id}
                  style={[s.pastPollCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                >
                  <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <Text style={[s.pastPollTitle, { color: colors.text }]} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <View style={[s.closedBadge, { backgroundColor: colors.surface }]}>
                      <Text style={[s.closedBadgeText, { color: colors.muted }]}>Closed</Text>
                    </View>
                  </Row>

                  {pWinning && (
                    <Row style={{ alignItems: "center", gap: 6, marginVertical: 4 }}>
                      <MaterialCommunityIcons name="trophy-outline" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.text }}>
                        Winner: <Text style={{ fontWeight: "700", color: colors.primary }}>{pWinning.text}</Text> ({pWinning.votes} votes)
                      </Text>
                    </Row>
                  )}

                  <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {pMeta.total_votes || 0} total votes
                    </Text>
                    {isLeader && (
                      <Row style={{ gap: 6 }}>
                        <Pressable
                          onPress={() => announceM.mutate(p.id)}
                          style={[s.announceBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                          <MaterialCommunityIcons name="bullhorn-outline" size={12} color={colors.text} />
                          <Text style={[s.announceBtnText, { color: colors.text }]}>Announce</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Alert.alert("Delete Poll?", "Permanently remove this past poll?", [
                              { text: "Cancel", style: "cancel" },
                              { text: "Delete", style: "destructive", onPress: () => deleteM.mutate(p.id) },
                            ]);
                          }}
                          style={[s.leaderOptBtn, { borderColor: colors.danger, backgroundColor: colors.surface }]}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={12} color={colors.danger} />
                        </Pressable>
                      </Row>
                    )}
                  </Row>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Create Poll Modal */}
      <CreatePollModal
        visible={createModalVisible}
        roomId={roomId}
        onClose={() => setCreateModalVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
  },
  livePulseTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  livePulseText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  closedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  closedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  tabPillsRow: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.sm,
    marginTop: 6,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xs,
  },
  tabPillActive: {
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 11,
  },
  sub: {
    fontSize: 12,
  },
  emptyPollBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  startPollBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  startPollBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  question: {
    fontSize: 14,
    fontWeight: "800",
  },
  opt: {
    borderRadius: radius.sm,
    overflow: "hidden",
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
  },
  optTxt: {
    fontSize: 13,
  },
  voteCount: {
    fontSize: 11,
    fontWeight: "600",
  },
  pct: {
    fontSize: 12,
    fontWeight: "800",
    minWidth: 32,
    textAlign: "right",
  },
  winnerBanner: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  winnerText: {
    fontSize: 12,
  },
  scheduleWinnerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  scheduleWinnerBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  announceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  announceBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  miniActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  miniActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  leaderOptBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  leaderOptText: {
    fontSize: 11,
    fontWeight: "600",
  },
  pastPollCard: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  pastPollTitle: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
});
