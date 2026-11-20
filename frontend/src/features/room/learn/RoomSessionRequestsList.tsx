import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/features/auth/AuthProvider";
import type { RoomSessionRequest } from "@/types";

interface RoomSessionRequestsListProps {
  roomId: string;
  isLeader?: boolean;
  onRequestSchedule: (request: RoomSessionRequest) => void;
  onRequestPoll: (request: RoomSessionRequest) => void;
}

export function RoomSessionRequestsList({
  roomId,
  isLeader,
  onRequestSchedule,
  onRequestPoll,
}: RoomSessionRequestsListProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "pending" | "scheduled">("all");

  const query = useQuery({
    queryKey: ["room-session-requests", roomId],
    queryFn: () => api<{ requests: RoomSessionRequest[] }>(`/rooms/${roomId}/session-requests`),
  });

  const allRequests = query.data?.requests || [];

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onUpdated = () => {
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
    };

    const onUpvoted = (data: { requestId: string; upvotes_count: number }) => {
      qc.setQueryData(["room-session-requests", roomId], (old: any) => {
        if (!old || !old.requests) return old;
        return {
          ...old,
          requests: old.requests.map((r: RoomSessionRequest) =>
            r.id === data.requestId ? { ...r, upvotes_count: data.upvotes_count } : r,
          ),
        };
      });
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
    };

    const onStatusChanged = (data: { requestId: string; status: string }) => {
      qc.setQueryData(["room-session-requests", roomId], (old: any) => {
        if (!old || !old.requests) return old;
        return {
          ...old,
          requests: old.requests.map((r: RoomSessionRequest) =>
            r.id === data.requestId ? { ...r, status: data.status } : r,
          ),
        };
      });
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
    };

    const subscribe = () => {
      socket.emit("room:presence:subscribe", { roomId });
    };

    if (socket.connected) {
      subscribe();
    }
    socket.on("connect", subscribe);

    socket.on("room:session_request:created", onUpdated);
    socket.on("room:session_request:upvoted", onUpvoted);
    socket.on("room:session_request:status_changed", onStatusChanged);
    socket.on("room:session_request:deleted", onUpdated);
    socket.on("room:session_request:updated", onUpdated);

    return () => {
      socket.off("connect", subscribe);
      socket.off("room:session_request:created", onUpdated);
      socket.off("room:session_request:upvoted", onUpvoted);
      socket.off("room:session_request:status_changed", onStatusChanged);
      socket.off("room:session_request:deleted", onUpdated);
      socket.off("room:session_request:updated", onUpdated);
    };
  }, [roomId, qc]);

  // Upvote mutation
  const upvoteM = useMutation({
    mutationFn: (requestId: string) =>
      api<{ upvoted: boolean; upvotes_count: number }>(
        `/rooms/${roomId}/session-requests/${requestId}/upvote`,
        { method: "POST" },
      ),
    onSuccess: (data, requestId) => {
      triggerHaptic();
      qc.setQueryData(["room-session-requests", roomId], (old: any) => {
        if (!old || !old.requests) return old;
        return {
          ...old,
          requests: old.requests.map((r: RoomSessionRequest) =>
            r.id === requestId
              ? { ...r, upvotes_count: data.upvotes_count, has_upvoted: data.upvoted }
              : r,
          ),
        };
      });
    },
  });

  // Decline mutation
  const declineM = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${roomId}/session-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected" }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
      Alert.alert("Declined", "Request marked as declined.");
    },
  });

  // Self-delete / cancel mutation
  const deleteM = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${roomId}/session-requests/${requestId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-session-requests", roomId] });
      Alert.alert("Request Withdrawn", "Your session request has been removed.");
    },
    onError: (err: any) => Alert.alert("Error withdrawing request", err.message),
  });

  if (allRequests.length === 0) return null;

  const pendingCount = allRequests.filter((r) => r.status === "pending").length;
  const scheduledCount = allRequests.filter((r) => r.status === "approved").length;

  const filteredRequests = allRequests.filter((r) => {
    if (filter === "pending") return r.status === "pending";
    if (filter === "scheduled") return r.status === "approved";
    return true;
  });

  return (
    <View style={s.container}>
      {/* Header and Filter Chips */}
      <Row style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.primary} />
          <Text style={[s.sectionTitle, { color: colors.text }]}>{t("rooms.learn.requestsTitle")}</Text>
          <View style={[s.countBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={[s.countBadgeText, { color: colors.muted }]}>{allRequests.length}</Text>
          </View>
        </Row>
      </Row>

      {/* Filter Tabs */}
      <Row style={{ gap: 6, marginBottom: 10 }}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            setFilter("all");
          }}
          style={[
            s.filterPill,
            {
              backgroundColor: filter === "all" ? colors.primarySoft : colors.surface,
              borderColor: filter === "all" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              s.filterPillText,
              { color: filter === "all" ? colors.primary : colors.muted, fontWeight: filter === "all" ? "800" : "600" },
            ]}
          >
            All ({allRequests.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setFilter("pending");
          }}
          style={[
            s.filterPill,
            {
              backgroundColor: filter === "pending" ? colors.primarySoft : colors.surface,
              borderColor: filter === "pending" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              s.filterPillText,
              { color: filter === "pending" ? colors.primary : colors.muted, fontWeight: filter === "pending" ? "800" : "600" },
            ]}
          >
            Pending ({pendingCount})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setFilter("scheduled");
          }}
          style={[
            s.filterPill,
            {
              backgroundColor: filter === "scheduled" ? colors.primarySoft : colors.surface,
              borderColor: filter === "scheduled" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              s.filterPillText,
              { color: filter === "scheduled" ? colors.primary : colors.muted, fontWeight: filter === "scheduled" ? "800" : "600" },
            ]}
          >
            Scheduled ({scheduledCount})
          </Text>
        </Pressable>
      </Row>

      <View style={{ gap: 10 }}>
        {filteredRequests.map((req) => {
          const typeIcon =
            req.session_type === "voice"
              ? "microphone-outline"
              : req.session_type === "offline"
              ? "map-marker-outline"
              : "video-outline";
          const typeLabel =
            req.session_type === "voice"
              ? "Voice Live"
              : req.session_type === "offline"
              ? "Campus Meetup"
              : "Video Live";

          const isPending = req.status === "pending";
          const isMyRequest = Boolean(user?.id && req.user_id === user.id);

          return (
            <View
              key={req.id}
              style={[s.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Row style={{ alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <View style={[s.typePill, { backgroundColor: colors.primarySoft }]}>
                      <MaterialCommunityIcons name={typeIcon as any} size={12} color={colors.primary} />
                      <Text style={[s.typePillText, { color: colors.primary }]}>{typeLabel}</Text>
                    </View>

                    {req.status === "approved" && (
                      <View style={[s.statusPill, { backgroundColor: `${colors.success || "#10B981"}22` }]}>
                        <MaterialCommunityIcons name="check-circle" size={11} color={colors.success || "#10B981"} />
                        <Text style={[s.statusPillText, { color: colors.success || "#10B981" }]}>Scheduled</Text>
                      </View>
                    )}
                    {req.status === "converted_to_poll" && (
                      <View style={[s.statusPill, { backgroundColor: `${colors.primary}22` }]}>
                        <MaterialCommunityIcons name="poll" size={11} color={colors.primary} />
                        <Text style={[s.statusPillText, { color: colors.primary }]}>Voting in Poll</Text>
                      </View>
                    )}
                    {req.status === "rejected" && (
                      <View style={[s.statusPill, { backgroundColor: colors.surface2 }]}>
                        <Text style={[s.statusPillText, { color: colors.muted }]}>Declined</Text>
                      </View>
                    )}
                  </Row>

                  <Text style={[s.requestTitle, { color: colors.text }]}>{req.title}</Text>

                  {Boolean(req.description) && (
                    <Text style={[s.requestDesc, { color: colors.muted }]} numberOfLines={2}>
                      {req.description}
                    </Text>
                  )}

                  {Boolean(req.preferred_time_note) && (
                    <Row style={{ alignItems: "center", gap: 4, marginTop: 2 }}>
                      <MaterialCommunityIcons name="clock-outline" size={13} color={colors.muted} />
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        Preferred: {req.preferred_time_note}
                      </Text>
                    </Row>
                  )}

                  <Row style={{ alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Requested by <Text style={{ fontWeight: "700", color: colors.text }}>{req.user?.full_name || "Member"}</Text>
                    </Text>
                    {isMyRequest && (
                      <View style={[s.myBadge, { backgroundColor: colors.surface2 }]}>
                        <Text style={[s.myBadgeText, { color: colors.primary }]}>You</Text>
                      </View>
                    )}
                  </Row>
                </View>

                {/* Right Action: Upvote and Optional Withdraw */}
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Pressable
                    onPress={() => upvoteM.mutate(req.id)}
                    style={[
                      s.upvoteBtn,
                      {
                        backgroundColor: req.has_upvoted ? colors.primarySoft : colors.surface2,
                        borderColor: req.has_upvoted ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={req.has_upvoted ? "arrow-up-bold" : "arrow-up"}
                      size={16}
                      color={req.has_upvoted ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        s.upvoteCount,
                        { color: req.has_upvoted ? colors.primary : colors.muted },
                      ]}
                    >
                      {req.upvotes_count}
                    </Text>
                  </Pressable>

                  {isMyRequest && isPending && (
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          "Withdraw Request?",
                          "Are you sure you want to cancel this session request?",
                          [
                            { text: "No", style: "cancel" },
                            { text: "Withdraw", style: "destructive", onPress: () => deleteM.mutate(req.id) },
                          ],
                        );
                      }}
                      style={s.withdrawBtn}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.danger} />
                    </Pressable>
                  )}
                </View>
              </Row>

              {/* Leader action buttons */}
              {isLeader && isPending && (
                <Row style={[s.leaderActionsRow, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      onRequestSchedule(req);
                    }}
                    style={[s.actionBtn, { backgroundColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="calendar-plus" size={14} color="#FFFFFF" />
                    <Text style={s.actionBtnText}>Schedule</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      onRequestPoll(req);
                    }}
                    style={[s.actionBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1 }]}
                  >
                    <MaterialCommunityIcons name="poll" size={14} color={colors.primary} />
                    <Text style={[s.actionBtnText, { color: colors.primary }]}>Vote on Time</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Alert.alert("Decline Request?", "Mark this session request as declined?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Decline", style: "destructive", onPress: () => declineM.mutate(req.id) },
                      ]);
                    }}
                    style={[s.actionBtn, { backgroundColor: colors.surface2 }]}
                  >
                    <Text style={[s.actionBtnText, { color: colors.muted }]}>Decline</Text>
                  </Pressable>
                </Row>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
  },
  requestCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  myBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  myBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  requestTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  requestDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  upvoteBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    minWidth: 42,
  },
  upvoteCount: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  withdrawBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
