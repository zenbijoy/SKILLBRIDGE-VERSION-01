import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface LiveRoom {
  id: string;
  title: string;
  mode: string;
  member_count?: number;
  owner?: { full_name?: string; avatar_url?: string };
}

interface UpcomingSummary {
  activeClass?: { id: string; course_name: string; start_time: string; end_time: string; room?: string };
  nextClass?: { id: string; course_name: string; start_time: string; end_time: string; room?: string };
}

interface PeerSuggestion {
  id: string;
  full_name: string;
  avatar_url?: string;
  headline?: string;
  department?: string;
}

interface Leader {
  id: string;
  full_name: string;
  avatar_url?: string;
  reputation: number;
}

const TRENDING_TOPICS = [
  { tag: "#Python", posts: "248 posts" },
  { tag: "#Algorithms", posts: "192 posts" },
  { tag: "#MachineLearning", posts: "164 posts" },
  { tag: "#WebDev", posts: "142 posts" },
  { tag: "#SystemDesign", posts: "98 posts" },
];

export function WebRightSidebar() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [connectingIds, setConnectingIds] = useState<string[]>([]);

  // 1. Live Study Rooms
  const liveRoomsQuery = useQuery({
    queryKey: ["web-sidebar-live-rooms"],
    queryFn: () => api<{ rooms: LiveRoom[] }>("/rooms?status=live&limit=3"),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });
  const liveRooms = liveRoomsQuery.data?.rooms || [];

  // 2. Upcoming Schedule
  const upcomingQuery = useQuery({
    queryKey: ["calendar-upcoming"],
    queryFn: () => api<UpcomingSummary>("/calendar/upcoming"),
    staleTime: 45_000,
  });
  const upcoming = upcomingQuery.data?.activeClass || upcomingQuery.data?.nextClass;

  // 3. Suggested Peers
  const connectionsQuery = useQuery({
    queryKey: ["connections-suggested"],
    queryFn: () => api<{ suggested: PeerSuggestion[] }>("/connections"),
    staleTime: 60_000,
  });
  const suggestedPeers = (connectionsQuery.data?.suggested || []).slice(0, 4);

  // 4. Connect Mutation
  const connectMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api("/connections/requests", {
        method: "POST",
        body: JSON.stringify({ recipientId }),
      }),
    onMutate: (recipientId) => {
      setConnectingIds((prev) => [...prev, recipientId]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections-suggested"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onSettled: (_data, _err, recipientId) => {
      setConnectingIds((prev) => prev.filter((id) => id !== recipientId));
    },
  });

  // 5. Leaderboard Top 3
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard-mini-podium"],
    queryFn: () =>
      api<{ leaders: Leader[] }>("/gamification/leaderboard?category=reputation&window=weekly"),
    staleTime: 60_000,
  });
  const topLeaders = (leaderboardQuery.data?.leaders || []).slice(0, 3);

  return (
    <aside
      style={{
        width: 320,
        height: "calc(100vh - 60px)",
        position: "sticky",
        top: 60,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        boxSizing: "border-box",
        overflowY: "auto",
        padding: "16px 14px 32px 14px",
        gap: 20,
      }}
    >
      {/* 1. Live Study Spotlights */}
      <View style={styles.cardWrap}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.liveTitleRow}>
            <View style={styles.pulsingDot} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>LIVE STUDY ROOMS</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/rooms" as any)}>
            <Text style={[styles.seeAllText, { color: colors.primary }]}>Explore</Text>
          </Pressable>
        </View>

        {liveRooms.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="door-closed" size={24} color={colors.muted} />
            <Text style={[styles.emptyCardText, { color: colors.muted }]}>
              No live rooms right now.
            </Text>
            <Pressable
              onPress={() => router.push("/room/create" as any)}
              style={[styles.hostBtn, { backgroundColor: colors.primarySoft }]}
            >
              <Text style={[styles.hostBtnText, { color: colors.primary }]}>+ Host a Room</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.itemsList}>
            {liveRooms.map((room) => (
              <Pressable
                key={room.id}
                onPress={() => {
                  triggerHaptic();
                  router.push(`/room/${room.id}` as any);
                }}
                style={({ pressed }) => [
                  styles.roomItem,
                  {
                    backgroundColor: pressed ? colors.surface2 : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.roomItemLeft}>
                  <View style={[styles.roomIconBox, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
                    <MaterialCommunityIcons name="broadcast" size={18} color="#10B981" />
                  </View>
                  <View style={styles.roomTextCol}>
                    <Text style={[styles.roomTitle, { color: colors.text }]} numberOfLines={1}>
                      {room.title}
                    </Text>
                    <Text style={[styles.roomMeta, { color: colors.muted }]}>
                      {room.member_count ?? 1} participating
                    </Text>
                  </View>
                </View>
                <View style={[styles.joinPill, { backgroundColor: colors.primary }]}>
                  <Text style={styles.joinPillText}>Join</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* 2. Upcoming Schedule Widget */}
      {upcoming ? (
        <View style={styles.cardWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>UPCOMING TODAY</Text>
            <Pressable onPress={() => router.push("/schedule" as any)}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>Calendar</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push("/schedule" as any);
            }}
            style={({ pressed }) => [
              styles.upcomingCard,
              {
                backgroundColor: pressed ? colors.surface2 : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.upcomingIconBox, { backgroundColor: "rgba(99, 102, 241, 0.12)" }]}>
              <MaterialCommunityIcons name="clock-outline" size={20} color="#6366F1" />
            </View>
            <View style={styles.upcomingTextCol}>
              <Text style={[styles.upcomingTitle, { color: colors.text }]} numberOfLines={1}>
                {upcoming.course_name}
              </Text>
              <Text style={[styles.upcomingTime, { color: colors.muted }]}>
                {upcoming.start_time} - {upcoming.end_time}
                {upcoming.room ? ` • ${upcoming.room}` : ""}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* 3. Suggested Peers & Mentors */}
      {suggestedPeers.length > 0 ? (
        <View style={styles.cardWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>PEOPLE YOU MAY KNOW</Text>
            <Pressable onPress={() => router.push("/connections" as any)}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text>
            </Pressable>
          </View>

          <View style={styles.itemsList}>
            {suggestedPeers.map((peer) => {
              const isConnecting = connectingIds.includes(peer.id);
              const initial = (peer.full_name?.trim()?.[0] ?? "U").toUpperCase();
              return (
                <View
                  key={peer.id}
                  style={[
                    styles.peerRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => router.push(`/user/${peer.id}` as any)}
                    style={styles.peerAvatarWrap}
                  >
                    {peer.avatar_url ? (
                      <Image source={{ uri: peer.avatar_url }} style={styles.peerAvatar} />
                    ) : (
                      <View style={[styles.peerAvatarFallback, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.peerInitial, { color: colors.primary }]}>{initial}</Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={styles.peerTextCol}>
                    <Pressable onPress={() => router.push(`/user/${peer.id}` as any)}>
                      <Text style={[styles.peerName, { color: colors.text }]} numberOfLines={1}>
                        {peer.full_name}
                      </Text>
                    </Pressable>
                    <Text style={[styles.peerHeadline, { color: colors.muted }]} numberOfLines={1}>
                      {peer.department || peer.headline || "Campus Peer"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      connectMutation.mutate(peer.id);
                    }}
                    disabled={isConnecting}
                    style={({ pressed }) => [
                      styles.connectBtn,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: colors.border,
                        opacity: pressed || isConnecting ? 0.7 : 1,
                      },
                    ]}
                  >
                    {isConnecting ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="account-plus" size={14} color={colors.primary} />
                        <Text style={[styles.connectBtnText, { color: colors.primary }]}>Connect</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 4. Weekly Campus Leaderboard Podium */}
      {topLeaders.length > 0 ? (
        <View style={styles.cardWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>WEEKLY PODIUM</Text>
            <Pressable onPress={() => router.push("/leaderboard" as any)}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>View</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.leaderboardBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {topLeaders.map((leader, idx) => {
              const medals = ["🥇", "🥈", "🥉"];
              const initial = (leader.full_name?.trim()?.[0] ?? "U").toUpperCase();
              return (
                <Pressable
                  key={leader.id}
                  onPress={() => router.push(`/user/${leader.id}` as any)}
                  style={({ pressed }) => [
                    styles.leaderRow,
                    {
                      borderBottomColor: idx < topLeaders.length - 1 ? colors.border : "transparent",
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={styles.medalIcon}>{medals[idx]}</Text>
                  {leader.avatar_url ? (
                    <Image source={{ uri: leader.avatar_url }} style={styles.leaderAvatar} />
                  ) : (
                    <View style={[styles.leaderAvatarFallback, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[styles.peerInitial, { color: colors.primary }]}>{initial}</Text>
                    </View>
                  )}
                  <View style={styles.leaderTextCol}>
                    <Text style={[styles.leaderName, { color: colors.text }]} numberOfLines={1}>
                      {leader.full_name}
                    </Text>
                    <Text style={[styles.leaderRep, { color: colors.muted }]}>
                      {leader.reputation} XP
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 5. Trending Topics */}
      <View style={styles.cardWrap}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>
          TRENDING TOPICS
        </Text>
        <View style={styles.trendsWrap}>
          {TRENDING_TOPICS.map((topic) => (
            <Pressable
              key={topic.tag}
              onPress={() => {
                triggerHaptic();
                router.push(`/feed` as any);
              }}
              style={({ pressed }) => [
                styles.trendPill,
                {
                  backgroundColor: pressed ? colors.surface2 : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.trendTag, { color: colors.primary }]}>{topic.tag}</Text>
              <Text style={[styles.trendCount, { color: colors.muted }]}>{topic.posts}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </aside>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  liveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: "700",
    cursor: "pointer",
  } as any,
  itemsList: {
    gap: 8,
  },
  emptyCard: {
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyCardText: {
    fontSize: 12,
  },
  hostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    cursor: "pointer",
  } as any,
  hostBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  roomItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  roomIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  roomTextCol: {
    flex: 1,
    gap: 2,
  },
  roomTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  roomMeta: {
    fontSize: 11,
  },
  joinPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  joinPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  upcomingIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingTextCol: {
    flex: 1,
    gap: 2,
  },
  upcomingTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  upcomingTime: {
    fontSize: 11,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  peerAvatarWrap: {
    cursor: "pointer",
  } as any,
  peerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  peerAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  peerInitial: {
    fontSize: 13,
    fontWeight: "800",
  },
  peerTextCol: {
    flex: 1,
    gap: 2,
  },
  peerName: {
    fontSize: 12,
    fontWeight: "700",
    cursor: "pointer",
  } as any,
  peerHeadline: {
    fontSize: 10,
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  connectBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  leaderboardBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    cursor: "pointer",
  } as any,
  medalIcon: {
    fontSize: 16,
  },
  leaderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  leaderAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderTextCol: {
    flex: 1,
  },
  leaderName: {
    fontSize: 12,
    fontWeight: "700",
  },
  leaderRep: {
    fontSize: 10,
  },
  trendsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    cursor: "pointer",
  } as any,
  trendTag: {
    fontSize: 11,
    fontWeight: "700",
  },
  trendCount: {
    fontSize: 10,
  },
});
