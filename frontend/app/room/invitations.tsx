import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, Muted, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type InvitationItem = {
  id: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired" | "consumed";
  created_at: string;
  expires_at?: string;
  room?: {
    id: string;
    title: string;
    topic: string;
    visibility: string;
    member_count: number;
    capacity: number;
  };
  inviter?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  };
  invitee?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  };
};

export default function RoomInvitationsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");

  // Query received and sent invitations
  const receivedQuery = useQuery({
    queryKey: ["room-invitations", "received"],
    queryFn: () => api<InvitationItem[]>("/rooms/invitations/received"),
  });

  const sentQuery = useQuery({
    queryKey: ["room-invitations", "sent"],
    queryFn: () => api<InvitationItem[]>("/rooms/invitations/sent"),
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: (invitationId: string) =>
      api<{ joined: boolean; room_id: string }>(`/rooms/invitations/${invitationId}/accept`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["room-invitations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      Alert.alert("Invitation Accepted!", "You are now a member of this study room.", [
        {
          text: "View Room",
          onPress: () => router.push(`/room/${res.room_id}`),
        },
        { text: "Dismiss", style: "cancel" },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Failed to Accept", err.message || "Could not accept invitation.");
    },
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: (invitationId: string) =>
      api(`/rooms/invitations/${invitationId}/decline`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-invitations"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Could not decline invitation.");
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      api(`/rooms/invitations/${invitationId}/revoke`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-invitations"] });
      Alert.alert("Revoked", "The invitation has been cancelled.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Could not revoke invitation.");
    },
  });

  const currentQuery = activeTab === "received" ? receivedQuery : sentQuery;
  const list = currentQuery.data ?? [];

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <H1 style={styles.title}>Room Invitations</H1>
        </Row>

        {/* Tab Toggle */}
        <Row style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab("received")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "received" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "received" ? "#fff" : colors.muted },
              ]}
            >
              Received {receivedQuery.data?.length ? `(${receivedQuery.data.length})` : ""}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("sent")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "sent" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "sent" ? "#fff" : colors.muted },
              ]}
            >
              Sent {sentQuery.data?.length ? `(${sentQuery.data.length})` : ""}
            </Text>
          </Pressable>
        </Row>

        {/* Content */}
        {currentQuery.isLoading ? (
          <View style={styles.loadingList}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        ) : currentQuery.isError ? (
          <ErrorState
            detail={(currentQuery.error as Error).message}
            onRetry={() => currentQuery.refetch()}
          />
        ) : list.length === 0 ? (
          <Empty
            title={activeTab === "received" ? "No Invitations" : "No Sent Invitations"}
            detail={
              activeTab === "received"
                ? "You have no pending invitations to study rooms."
                : "You have not invited anyone to your study rooms yet."
            }
          />
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Card style={styles.inviteCard}>
                <Row style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roomTitle, { color: colors.text }]}>
                      {item.room?.title ?? "Study Room"}
                    </Text>
                    <Text style={[styles.topicText, { color: colors.primary }]}>
                      #{item.room?.topic ?? "general"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          item.status === "pending"
                            ? colors.primary + "18"
                            : item.status === "consumed" || item.status === "accepted"
                            ? "#10b98118"
                            : colors.muted + "18",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            item.status === "pending"
                              ? colors.primary
                              : item.status === "consumed" || item.status === "accepted"
                              ? "#10b981"
                              : colors.muted,
                        },
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </Row>

                <Muted style={styles.personText}>
                  {activeTab === "received"
                    ? `Invited by @${item.inviter?.username ?? "peer"}`
                    : `Sent to @${item.invitee?.username ?? "peer"}`}
                </Muted>

                {activeTab === "received" && item.status === "pending" && (
                  <Row style={styles.actionRow}>
                    <View style={styles.actionButtonWrapper}>
                      <Button
                        title="Decline"
                        variant="secondary"
                        onPress={() => declineMutation.mutate(item.id)}
                        disabled={declineMutation.isPending || acceptMutation.isPending}
                      />
                    </View>
                    <View style={styles.actionButtonWrapper}>
                      <Button
                        title="Accept & Join"
                        onPress={() => acceptMutation.mutate(item.id)}
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                      />
                    </View>
                  </Row>
                )}

                {activeTab === "sent" && item.status === "pending" && (
                  <Row style={styles.actionRow}>
                    <View style={styles.actionButtonWrapper}>
                      <Button
                        title="Revoke Invite"
                        variant="secondary"
                        onPress={() => revokeMutation.mutate(item.id)}
                        disabled={revokeMutation.isPending}
                      />
                    </View>
                  </Row>
                )}
              </Card>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  tabsRow: {
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  loadingList: {
    gap: 12,
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  inviteCard: {
    padding: 16,
    borderRadius: radius.lg,
  },
  cardHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  topicText: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  personText: {
    fontSize: 13,
    marginTop: 8,
  },
  actionRow: {
    marginTop: 14,
    gap: 10,
  },
  actionButtonWrapper: {
    flex: 1,
  },
});
