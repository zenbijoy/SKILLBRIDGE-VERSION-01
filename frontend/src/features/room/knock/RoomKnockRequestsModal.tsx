import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type KnockRequestItem = {
  id: string;
  room_id: string;
  user_id: string;
  method: "message" | "phone_call";
  message: string;
  status: string;
  created_at: string;
  profile?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url: string | null;
  };
};

type RoomKnockRequestsModalProps = {
  roomId: string;
  visible: boolean;
  onClose: () => void;
  knockModeEnabled?: boolean;
};

export function RoomKnockRequestsModal({
  roomId,
  visible,
  onClose,
  knockModeEnabled = false,
}: RoomKnockRequestsModalProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{
    requests: KnockRequestItem[];
    knockModeEnabled: boolean;
  }>({
    queryKey: ["room-knock-requests", roomId],
    queryFn: () => api<{ requests: KnockRequestItem[]; knockModeEnabled: boolean }>(`/rooms/${roomId}/knock/requests`),
    enabled: visible,
    refetchInterval: visible ? 5000 : false,
  });

  // Socket listener for new knocks
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !visible) return;

    const handleNewKnock = () => {
      triggerHaptic();
      refetch();
    };

    socket.on("room:knock:new", handleNewKnock);
    return () => {
      socket.off("room:knock:new", handleNewKnock);
    };
  }, [visible, refetch]);

  // Admit single user mutation
  const admitMutation = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${roomId}/knock/${requestId}/admit`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-knock-requests", roomId] });
      qc.invalidateQueries({ queryKey: ["room", roomId] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Could not admit user"),
  });

  // Decline single user mutation
  const declineMutation = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${roomId}/knock/${requestId}/decline`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-knock-requests", roomId] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Could not decline user"),
  });

  // Toggle open for everyone mutation
  const toggleOpenMutation = useMutation({
    mutationFn: (openForEveryone: boolean) =>
      api(`/rooms/${roomId}/knock/toggle-open`, {
        method: "POST",
        body: JSON.stringify({ openForEveryone }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-knock-requests", roomId] });
      qc.invalidateQueries({ queryKey: ["room", roomId] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Could not update room access"),
  });

  const requests = data?.requests ?? [];
  const isOpenForEveryone = !(data?.knockModeEnabled ?? knockModeEnabled);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[s.modalRoot, { backgroundColor: colors.background }]}>
        {/* Header */}
        <Row style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            style={s.closeBtn}
          >
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.text }]}>Knock & Waiting Requests</Text>
          <View style={{ width: 32 }} />
        </Row>

        {/* Access Toggle Bar */}
        <View style={[s.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, gap: 2, paddingRight: 12 }}>
              <Text style={[s.toggleTitle, { color: colors.text }]}>Open Room for Any User</Text>
              <Text style={[s.toggleSub, { color: colors.muted }]}>
                {isOpenForEveryone
                  ? "Room is Public: Any student can join immediately without waiting."
                  : "Knock Required: Host approval is required before entering."}
              </Text>
            </View>
            <Switch
              value={isOpenForEveryone}
              onValueChange={(val) => toggleOpenMutation.mutate(val)}
              disabled={toggleOpenMutation.isPending}
              thumbColor={isOpenForEveryone ? colors.primary : colors.muted}
            />
          </Row>
        </View>

        {/* Requests List */}
        <View style={s.listContainer}>
          <Row style={s.listHeader}>
            <Text style={[s.listHeading, { color: colors.muted }]}>
              PENDING KNOCKS ({requests.length})
            </Text>
            {requests.length > 1 && (
              <Pressable
                onPress={() => {
                  requests.forEach((r) => admitMutation.mutate(r.id));
                }}
                disabled={admitMutation.isPending}
              >
                <Text style={[s.admitAllTxt, { color: colors.primary }]}>Admit All</Text>
              </Pressable>
            )}
          </Row>

          {isLoading ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : requests.length === 0 ? (
            <View style={s.centerBox}>
              <View style={[s.emptyIconWrap, { backgroundColor: colors.surface2 }]}>
                <MaterialCommunityIcons name="door-open" size={40} color={colors.muted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No Pending Requests</Text>
              <Text style={[s.emptySub, { color: colors.muted }]}>
                When users knock or call to enter this room, they will appear here in real-time.
              </Text>
            </View>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
              renderItem={({ item }) => {
                const requesterName = item.profile?.full_name || item.profile?.username || "Guest Peer";
                const isPhone = item.method === "phone_call";
                return (
                  <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Row style={{ gap: 12, alignItems: "flex-start" }}>
                      {item.profile?.avatar_url ? (
                        <Image source={{ uri: item.profile.avatar_url }} style={s.avatar} />
                      ) : (
                        <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.primary }]}>
                          <Text style={s.avatarInitial}>{requesterName.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}

                      <View style={{ flex: 1, gap: 4 }}>
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <Text style={[s.nameText, { color: colors.text }]}>{requesterName}</Text>
                          <View
                            style={[
                              s.methodBadge,
                              { backgroundColor: isPhone ? "#10B98120" : colors.primarySoft },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={isPhone ? "phone" : "message-text"}
                              size={12}
                              color={isPhone ? "#10B981" : colors.primary}
                            />
                            <Text
                              style={[
                                s.methodText,
                                { color: isPhone ? "#10B981" : colors.primary },
                              ]}
                            >
                              {isPhone ? "Direct Ring" : "Message"}
                            </Text>
                          </View>
                        </Row>

                        {Boolean(item.message) && (
                          <Text style={[s.msgText, { color: colors.muted }]}>"{item.message}"</Text>
                        )}
                        <Text style={[s.timeText, { color: colors.muted }]}>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>

                      {/* Actions */}
                      <Row style={{ gap: 8 }}>
                        <Pressable
                          onPress={() => declineMutation.mutate(item.id)}
                          disabled={declineMutation.isPending}
                          style={[s.iconBtn, { backgroundColor: colors.surface2 }]}
                        >
                          <MaterialCommunityIcons name="close" size={18} color={colors.danger} />
                        </Pressable>
                        <Pressable
                          onPress={() => admitMutation.mutate(item.id)}
                          disabled={admitMutation.isPending}
                          style={[s.iconBtn, { backgroundColor: colors.primary }]}
                        >
                          <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                        </Pressable>
                      </Row>
                    </Row>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  header: {
    height: 54,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  toggleCard: {
    margin: 16,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  toggleSub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  listHeading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  admitAllTxt: {
    fontSize: 13,
    fontWeight: "700",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  nameText: {
    fontSize: 14,
    fontWeight: "700",
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  methodText: {
    fontSize: 10,
    fontWeight: "700",
  },
  msgText: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
  timeText: {
    fontSize: 11,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
