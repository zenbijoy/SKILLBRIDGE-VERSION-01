import React, { useState, useMemo } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import {
  Empty,
  ErrorState,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";

type IncomingRequest = {
  id: string;
  requester: Profile;
  created_at?: string;
};

type ActiveTab = "requests" | "network" | "explore" | "history";

export default function ConnectionsScreen() {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tab?: ActiveTab }>();

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    params.tab && ["requests", "network", "explore", "history"].includes(params.tab)
      ? (params.tab as ActiveTab)
      : "requests"
  );
  const [networkSearch, setNetworkSearch] = useState("");
  const [sentRequestIds, setSentRequestIds] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (params.tab && ["requests", "network", "explore", "history"].includes(params.tab)) {
      setActiveTab(params.tab as ActiveTab);
    }
  }, [params.tab]);

  // 1. Fetch Connections, Incoming Requests & Suggestions
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{
    connections: Profile[];
    incoming: IncomingRequest[];
    suggested: Profile[];
  }>({
    queryKey: ["connections"],
    queryFn: () => api("/connections"),
    staleTime: 15_000,
  });

  // 2. Fetch User's Joined Rooms for History tab
  const roomsQuery = useQuery<{ rooms: Room[] }>({
    queryKey: ["my-rooms-history"],
    queryFn: () => api("/rooms/mine"),
    enabled: activeTab === "history",
  });

  const incoming = data?.incoming ?? [];
  const connections = useMemo(() => data?.connections ?? [], [data]);
  const suggested = data?.suggested ?? [];
  const joinedRooms = roomsQuery.data?.rooms ?? [];

  // Filtered Connections
  const filteredConnections = useMemo(() => {
    if (!networkSearch.trim()) return connections;
    const q = networkSearch.toLowerCase();
    return connections.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q) ||
        c.university?.toLowerCase().includes(q),
    );
  }, [connections, networkSearch]);

  // Mutation: Respond to incoming request
  const respondMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "declined" }) =>
      api(`/connections/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, vars) => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: Error) => {
      Alert.alert("Action Failed", err.message || "Could not process request.");
    },
  });

  // Mutation: Send Connection Request
  const sendRequestMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api("/connections/requests", {
        method: "POST",
        body: JSON.stringify({ recipientId }),
      }),
    onMutate: (recipientId) => {
      triggerHaptic("selection");
      setSentRequestIds((prev) => ({ ...prev, [recipientId]: true }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: Error, recipientId) => {
      setSentRequestIds((prev) => ({ ...prev, [recipientId]: false }));
      Alert.alert("Could not connect", err.message || "Failed to send request.");
    },
  });

  // Mutation: Remove Connection
  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/connections/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const handleRemovePrompt = (friend: Profile) => {
    Alert.alert(
      "Remove Connection",
      `Are you sure you want to remove ${friend.full_name || friend.username} from your network?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMutation.mutate(friend.id),
        },
      ],
    );
  };

  return (
    <Screen scroll={false}>
      {/* ─────────────────────────────────────────────────────────────
          TOP APP HEADER
      ───────────────────────────────────────────────────────────── */}
      <Row style={s.topHeader}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.text }]}>Network Hub</Text>
        </Row>
        <Pressable
          onPress={() => refetch()}
          disabled={isRefetching}
          style={[s.iconBtn, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="reload" size={18} color={colors.text} />
        </Pressable>
      </Row>

      {/* ─────────────────────────────────────────────────────────────
          SEGMENTED TABS (FACEBOOK STYLE)
      ───────────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: 44, marginBottom: 8 }}
        contentContainerStyle={s.tabsContainer}
      >
        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("requests");
          }}
          style={[
            s.tabPill,
            activeTab === "requests"
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons
              name="account-plus-outline"
              size={16}
              color={activeTab === "requests" ? "#FFFFFF" : colors.text}
            />
            <Text
              style={[
                s.tabPillText,
                { color: activeTab === "requests" ? "#FFFFFF" : colors.text },
              ]}
            >
              Requests
            </Text>
            {incoming.length > 0 && (
              <View
                style={[
                  s.badgePill,
                  {
                    backgroundColor:
                      activeTab === "requests" ? "#FFFFFF" : colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    s.badgeText,
                    {
                      color:
                        activeTab === "requests" ? colors.primary : "#FFFFFF",
                    },
                  ]}
                >
                  {incoming.length}
                </Text>
              </View>
            )}
          </Row>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("network");
          }}
          style={[
            s.tabPill,
            activeTab === "network"
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons
              name="account-group-outline"
              size={16}
              color={activeTab === "network" ? "#FFFFFF" : colors.text}
            />
            <Text
              style={[
                s.tabPillText,
                { color: activeTab === "network" ? "#FFFFFF" : colors.text },
              ]}
            >
              My Network ({connections.length})
            </Text>
          </Row>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("explore");
          }}
          style={[
            s.tabPill,
            activeTab === "explore"
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons
              name="compass-outline"
              size={16}
              color={activeTab === "explore" ? "#FFFFFF" : colors.text}
            />
            <Text
              style={[
                s.tabPillText,
                { color: activeTab === "explore" ? "#FFFFFF" : colors.text },
              ]}
            >
              Explore
            </Text>
          </Row>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setActiveTab("history");
          }}
          style={[
            s.tabPill,
            activeTab === "history"
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons
              name="history"
              size={16}
              color={activeTab === "history" ? "#FFFFFF" : colors.text}
            />
            <Text
              style={[
                s.tabPillText,
                { color: activeTab === "history" ? "#FFFFFF" : colors.text },
              ]}
            >
              Joined Rooms
            </Text>
          </Row>
        </Pressable>
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────
          TAB CONTENT
      ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : isError ? (
        <ErrorState
          detail={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* TAB 1: INCOMING REQUESTS (FACEBOOK STYLE) */}
          {activeTab === "requests" && (
            <View style={{ gap: 12 }}>
              {incoming.length === 0 ? (
                <Empty
                  title="No Pending Requests"
                  detail="When classmates send you a connection request, you'll see them here."
                />
              ) : (
                incoming.map((req) => (
                  <View
                    key={req.id}
                    style={[
                      s.requestCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => router.push(`/user/${req.requester.id}` as any)}
                      style={s.profilePreviewRow}
                    >
                      {req.requester.avatar_url ? (
                        <Image
                          source={{ uri: req.requester.avatar_url }}
                          style={s.avatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            s.avatarFallback,
                            { backgroundColor: colors.primarySoft },
                          ]}
                        >
                          <Text
                            style={[
                              s.avatarInitial,
                              { color: colors.primary },
                            ]}
                          >
                            {(req.requester.full_name?.[0] || "U").toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[s.personName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {req.requester.full_name}
                        </Text>
                        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                          @{req.requester.username}
                          {req.requester.department
                            ? ` • ${req.requester.department}`
                            : ""}
                        </Muted>
                        {req.requester.university ? (
                          <Muted numberOfLines={1} style={{ fontSize: 11 }}>
                            {req.requester.university}
                          </Muted>
                        ) : null}
                      </View>
                    </Pressable>

                    {/* Action Buttons: Confirm & Delete */}
                    <Row style={s.requestActions}>
                      <Pressable
                        onPress={() =>
                          respondMutation.mutate({
                            id: req.id,
                            status: "accepted",
                          })
                        }
                        disabled={respondMutation.isPending}
                        style={[
                          s.confirmBtn,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text style={s.confirmBtnText}>Confirm</Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          respondMutation.mutate({
                            id: req.id,
                            status: "declined",
                          })
                        }
                        disabled={respondMutation.isPending}
                        style={[
                          s.declineBtn,
                          {
                            backgroundColor: isDark
                              ? colors.surface2
                              : "#F1F5F9",
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[s.declineBtnText, { color: colors.text }]}
                        >
                          Delete
                        </Text>
                      </Pressable>
                    </Row>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 2: MY NETWORK (EXISTING CONNECTIONS) */}
          {activeTab === "network" && (
            <View style={{ gap: 12 }}>
              {/* Search in Network */}
              {connections.length > 3 && (
                <View
                  style={[
                    s.searchBox,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="magnify"
                    size={18}
                    color={colors.muted}
                  />
                  <TextInput
                    value={networkSearch}
                    onChangeText={setNetworkSearch}
                    placeholder="Search your connections..."
                    placeholderTextColor={colors.muted}
                    style={[s.searchInput, { color: colors.text }]}
                  />
                  {networkSearch ? (
                    <Pressable onPress={() => setNetworkSearch("")}>
                      <MaterialCommunityIcons
                        name="close-circle"
                        size={16}
                        color={colors.muted}
                      />
                    </Pressable>
                  ) : null}
                </View>
              )}

              {filteredConnections.length === 0 ? (
                <Empty
                  title="No Connections Found"
                  detail={
                    networkSearch
                      ? `No classmate matches "${networkSearch}".`
                      : "Explore campus suggestions to build your study network."
                  }
                />
              ) : (
                filteredConnections.map((friend) => (
                  <View
                    key={friend.id}
                    style={[
                      s.connectionRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => router.push(`/user/${friend.id}` as any)}
                      style={s.connectionProfileLink}
                    >
                      {friend.avatar_url ? (
                        <Image
                          source={{ uri: friend.avatar_url }}
                          style={s.avatarSmall}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            s.avatarFallbackSmall,
                            { backgroundColor: colors.primarySoft },
                          ]}
                        >
                          <Text
                            style={[
                              s.avatarInitialSmall,
                              { color: colors.primary },
                            ]}
                          >
                            {(friend.full_name?.[0] || "U").toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1, gap: 1 }}>
                        <Text
                          style={[s.personName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {friend.full_name}
                        </Text>
                        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                          {friend.department || friend.university || `@${friend.username}`}
                        </Muted>
                      </View>
                    </Pressable>

                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pressable
                        onPress={async () => {
                          triggerHaptic();
                          try {
                            const res = await api<any>("/chat/conversations", {
                              method: "POST",
                              body: JSON.stringify({ participantId: friend.id }),
                            });
                            const convId = res?.id || res?.conversation_id || res?.conversation?.id;
                            if (convId) {
                              router.push(`/chat/${convId}` as any);
                            } else {
                              router.push("/inbox" as any);
                            }
                          } catch (err: any) {
                            Alert.alert("Chat", err.message || "Could not open chat with this classmate.");
                          }
                        }}
                        style={[
                          s.profileBtn,
                          {
                            backgroundColor: colors.primary,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons name="chat-outline" size={14} color="#FFFFFF" />
                        <Text style={[s.profileBtnText, { color: "#FFFFFF" }]}>
                          Message
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => router.push(`/user/${friend.id}` as any)}
                        style={[
                          s.profileBtn,
                          {
                            backgroundColor: colors.primarySoft,
                          },
                        ]}
                      >
                        <Text
                          style={[s.profileBtnText, { color: colors.primary }]}
                        >
                          Profile
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleRemovePrompt(friend)}
                        hitSlop={8}
                        style={s.menuDotBtn}
                      >
                        <MaterialCommunityIcons
                          name="dots-vertical"
                          size={20}
                          color={colors.muted}
                        />
                      </Pressable>
                    </Row>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: EXPLORE & SUGGESTIONS */}
          {activeTab === "explore" && (
            <View style={{ gap: 12 }}>
              {suggested.length === 0 ? (
                <Empty
                  title="No New Suggestions"
                  detail="Check back later as new students join your department or campus."
                />
              ) : (
                suggested.map((peer) => {
                  const isSent = Boolean(sentRequestIds[peer.id]);
                  return (
                    <View
                      key={peer.id}
                      style={[
                        s.suggestCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => router.push(`/user/${peer.id}` as any)}
                        style={s.profilePreviewRow}
                      >
                        {peer.avatar_url ? (
                          <Image
                            source={{ uri: peer.avatar_url }}
                            style={s.avatar}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={[
                              s.avatarFallback,
                              { backgroundColor: colors.accent + "20" },
                            ]}
                          >
                            <Text
                              style={[
                                s.avatarInitial,
                                { color: colors.accent },
                              ]}
                            >
                              {(peer.full_name?.[0] || "U").toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1, gap: 2 }}>
                          <Text
                            style={[s.personName, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {peer.full_name}
                          </Text>
                          <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                            {peer.department || peer.university || `@${peer.username}`}
                          </Muted>
                          {peer.bio ? (
                            <Muted numberOfLines={1} style={{ fontSize: 11 }}>
                              {peer.bio}
                            </Muted>
                          ) : null}
                        </View>
                      </Pressable>

                      <Pressable
                        onPress={() => sendRequestMutation.mutate(peer.id)}
                        disabled={isSent || sendRequestMutation.isPending}
                        style={[
                          s.addFriendBtn,
                          {
                            backgroundColor: isSent
                              ? isDark
                                ? colors.surface2
                                : "#E2E8F0"
                              : colors.primary,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={isSent ? "check" : "account-plus"}
                          size={16}
                          color={isSent ? colors.muted : "#FFFFFF"}
                        />
                        <Text
                          style={[
                            s.addFriendBtnText,
                            { color: isSent ? colors.muted : "#FFFFFF" },
                          ]}
                        >
                          {isSent ? "Request Sent" : "Add Connection"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 4: JOINED ROOMS & HISTORY */}
          {activeTab === "history" && (
            <View style={{ gap: 12 }}>
              {roomsQuery.isLoading ? (
                <View style={{ gap: 10 }}>
                  <Skeleton height={80} />
                  <Skeleton height={80} />
                </View>
              ) : joinedRooms.length === 0 ? (
                <Empty
                  title="No Joined Rooms"
                  detail="You haven't joined any virtual study rooms yet. Explore the Rooms tab."
                />
              ) : (
                joinedRooms.map((room) => (
                  <Pressable
                    key={room.id}
                    onPress={() => {
                      triggerHaptic();
                      router.push(`/room/${room.id}`);
                    }}
                    style={({ pressed }) => [
                      s.roomHistoryCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        s.roomIconSquare,
                        { backgroundColor: colors.primarySoft },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="door-open"
                        size={22}
                        color={colors.primary}
                      />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <Text
                          style={[s.personName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {room.title}
                        </Text>
                        {room.status === "live" && <Pill tone="danger">LIVE</Pill>}
                      </Row>
                      <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                        {room.topic || (room as any).category || "Study Group"}
                      </Muted>
                    </View>

                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  topHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  backBtn: {
    padding: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  badgePill: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  requestCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
  },
  profilePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "800",
  },
  personName: {
    fontSize: 15,
    fontWeight: "700",
  },
  requestActions: {
    gap: 8,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
  },
  connectionProfileLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallbackSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialSmall: {
    fontSize: 16,
    fontWeight: "700",
  },
  profileBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  profileBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  menuDotBtn: {
    padding: 4,
  },
  suggestCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    gap: 10,
  },
  addFriendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addFriendBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  roomHistoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  roomIconSquare: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
