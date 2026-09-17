import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { ClashDetectorModal } from "@/features/clubs/ClashDetectorModal";
import { RoomPostsView } from "@/features/room/posts/RoomPostsView";
import { RoomChatTab } from "@/features/room/RoomChatTab";
import { RoomMaterialsHub } from "@/features/room/RoomMaterialsHub";
import { RoomRecordings } from "@/features/room/RoomRecordings";
import { useSession } from "@/hooks/useSession";
import type { Room } from "@/types";

type ClubDetail = {
  id: string;
  name: string;
  description: string;
  university?: string;
  verified?: boolean;
  logo_url?: string;
  category?: string;
  member_count?: number;
  room_id?: string;
  my_role?: string | null;
  is_member?: boolean;
  my_membership?: { role: string; user_id: string } | null;
  events?: {
    id: string;
    title: string;
    description?: string;
    starts_at: string;
    location?: string;
  }[];
  members?: {
    id?: string;
    user_id?: string;
    role: string;
    profiles?: {
      id: string;
      username: string;
      full_name: string;
      avatar_url?: string;
    };
  }[];
};

type ClubTab = "posts" | "chat" | "events" | "media" | "more";

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<ClubTab>("posts");

  // Clash-aware event creation state
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(14, 0, 0, 0);
    return d.toISOString();
  });
  const [eventEndsAt, setEventEndsAt] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(16, 0, 0, 0);
    return d.toISOString();
  });
  const [showClashModal, setShowClashModal] = useState(false);

  const clubQuery = useQuery({
    queryKey: ["club", id],
    queryFn: async () => {
      const res = await api<{ club: ClubDetail; events: any[] }>(`/clubs/${id}`);
      return {
        ...res.club,
        events: res.events ?? res.club.events ?? [],
      };
    },
    enabled: Boolean(id),
  });

  const d = clubQuery.data;
  const roomId = d?.room_id;

  // Linked Room OS Query
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => api<Room>(`/rooms/${roomId}`),
    enabled: Boolean(roomId),
  });

  const room = roomQuery.data;
  const isMember = Boolean(d?.is_member || d?.my_role || d?.my_membership);
  const isLeader = d?.my_role === "owner" || d?.my_role === "admin" || d?.my_membership?.role === "owner" || d?.my_membership?.role === "admin";

  const joinMutation = useMutation({
    mutationFn: () =>
      api<{ joined: boolean }>(`/clubs/${id}/join`, {
        method: "POST",
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["club", id] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      Alert.alert("Welcome to the Club! 🎉", "You now have access to club posts, channels, and event registrations.");
    },
    onError: (err: any) => {
      Alert.alert("Join Failed", err.message || "Could not join club.");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () =>
      api<{ left: boolean }>(`/clubs/${id}/leave`, {
        method: "POST",
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["club", id] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      Alert.alert("Left Club", "You have left the club.");
    },
    onError: (err: any) => {
      Alert.alert("Leave Failed", err.message || "Could not leave club.");
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (payload: {
      club_id: string;
      title: string;
      description: string;
      starts_at: string;
      ends_at?: string;
      location?: string;
    }) =>
      api("/events", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setShowClashModal(false);
      setShowCreateEvent(false);
      setEventTitle("");
      setEventDesc("");
      setEventLocation("");
      qc.invalidateQueries({ queryKey: ["club", id] });
      Alert.alert("Event Scheduled! 🎉", "Your event has been published to the club calendar.");
    },
    onError: (err: any) => {
      Alert.alert("Scheduling Failed", err.message || "Failed to create event.");
    },
  });

  const setEventPreset = (daysAhead: number, startHour: number, durationHours: number) => {
    triggerHaptic();
    const s = new Date(Date.now() + daysAhead * 86400000);
    s.setHours(startHour, 0, 0, 0);
    const e = new Date(s.getTime() + durationHours * 3600000);
    setEventStartsAt(s.toISOString());
    setEventEndsAt(e.toISOString());
  };

  const handleOpenClashReview = () => {
    if (eventTitle.trim().length < 4) {
      Alert.alert("Validation", "Event title must be at least 4 characters long.");
      return;
    }
    setShowClashModal(true);
  };

  const handleShare = () => {
    if (!d) return;
    void Share.share({
      message: `Join ${d.name} on SkillBridge: https://skillbridge.app/club/${d.id}`,
    });
  };

  if (clubQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={50} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  if (clubQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(clubQuery.error as Error).message}
          onRetry={() => clubQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Club Not Found" detail="This club may have been disbanded or removed." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.container}>
        {/* Club Header */}
        <Row style={s.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={s.headerInfo}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <H1 style={s.title}>{d.name}</H1>
              {d.verified && (
                <MaterialCommunityIcons name="check-decagram" size={20} color={colors.primary} />
              )}
            </Row>
            <Muted>{d.university || "Campus Wide"} · {d.category || "Student Club"}</Muted>
          </View>
          <Pressable onPress={handleShare} hitSlop={12} style={s.iconActionBtn}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} />
          </Pressable>
        </Row>

        {/* Badges & Membership Action Bar */}
        <Row style={s.badgeRow}>
          <Row style={{ gap: 6, alignItems: "center" }}>
            <Pill tone="primary">{d.member_count ?? d.members?.length ?? 1} members</Pill>
            {isLeader && <Pill tone="accent">{d.my_role ? d.my_role.toUpperCase() : "LEADER"}</Pill>}
          </Row>
          <View>
            {!isMember ? (
              <Button
                title={joinMutation.isPending ? "Joining..." : "Join Club"}
                onPress={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
              />
            ) : (
              <Button
                title="Joined ✓"
                variant="secondary"
                onPress={() => {
                  Alert.alert(
                    "Club Membership",
                    "You are currently a member of this club.",
                    [
                      { text: "Stay" },
                      { text: "Leave Club", style: "destructive", onPress: () => leaveMutation.mutate() },
                    ]
                  );
                }}
              />
            )}
          </View>
        </Row>

        {/* 5-Tab Bar Reusing Room OS Primitives */}
        <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
          {(["posts", "chat", "events", "media", "more"] as ClubTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const labels: Record<ClubTab, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
              posts: { label: "Posts", icon: "newspaper-variant-outline" },
              chat: { label: "Chat", icon: "chat-outline" },
              events: { label: "Events", icon: "calendar-star" },
              media: { label: "Media", icon: "folder-multiple-outline" },
              more: { label: "Team", icon: "account-group-outline" },
            };
            const meta = labels[tab];
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  triggerHaptic();
                  setActiveTab(tab);
                }}
                style={[s.tabItem, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              >
                <MaterialCommunityIcons
                  name={meta.icon}
                  size={18}
                  color={isActive ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    s.tabLabel,
                    { color: isActive ? colors.primary : colors.muted, fontWeight: isActive ? "700" : "500" },
                  ]}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* TAB 1: POSTS */}
        {activeTab === "posts" && (
          <View style={{ flex: 1 }}>
            {room ? (
              <RoomPostsView
                room={room}
                currentUserId={session?.user?.id}
                canPost={isMember}
                canAnnounce={isLeader}
                canPin={isLeader}
                canModerate={isLeader}
              />
            ) : (
              <Card style={{ padding: 20, alignItems: "center", gap: 10 }}>
                <MaterialCommunityIcons name="newspaper-variant-outline" size={36} color={colors.primary} />
                <H2 style={{ textAlign: "center" }}>Club Discussions & Posts</H2>
                <Muted style={{ textAlign: "center" }}>
                  Official announcements, recruitment updates, and discussions will appear here.
                </Muted>
              </Card>
            )}
          </View>
        )}

        {/* TAB 2: CHAT */}
        {activeTab === "chat" && (
          <View style={{ flex: 1, minHeight: 400 }}>
            {room ? (
              <RoomChatTab
                conversationId={room.conversation_id}
                isMember={isMember}
              />
            ) : (
              <Empty
                title="Club Chat"
                detail="Join this club to access general discussion and committee channels."
              />
            )}
          </View>
        )}

        {/* TAB 3: EVENTS */}
        {activeTab === "events" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <H2 style={s.sectionTitle}>Club Events ({d.events?.length ?? 0})</H2>
              {isLeader && !showCreateEvent && (
                <Button
                  title="+ Schedule Event"
                  variant="secondary"
                  onPress={() => setShowCreateEvent(true)}
                />
              )}
            </Row>

            {/* Schedule Event Form with Clash Detection */}
            {isLeader && showCreateEvent && (
              <Card tone="glow" style={{ padding: 14 }}>
                <H2 style={{ fontSize: 16, fontWeight: "700", marginBottom: 4 }}>Schedule Club Event</H2>
                <Muted style={{ marginBottom: 10 }}>
                  Includes 4-signal automatic cross-club clash detection before publishing.
                </Muted>

                <Text style={[s.label, { color: colors.text }]}>Event Title</Text>
                <TextInput
                  style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="e.g., Annual Tech Hackathon Kickoff"
                  placeholderTextColor={colors.muted}
                  value={eventTitle}
                  onChangeText={setEventTitle}
                />

                <Text style={[s.label, { color: colors.text, marginTop: 8 }]}>Description</Text>
                <TextInput
                  style={[s.input, { height: 60, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="Event agenda, keynote speaker details..."
                  placeholderTextColor={colors.muted}
                  value={eventDesc}
                  onChangeText={setEventDesc}
                  multiline
                />

                <Text style={[s.label, { color: colors.text, marginTop: 8 }]}>Location</Text>
                <TextInput
                  style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="Auditorium 2 or Online"
                  placeholderTextColor={colors.muted}
                  value={eventLocation}
                  onChangeText={setEventLocation}
                />

                {/* Quick Presets */}
                <Text style={[s.label, { color: colors.muted, marginTop: 10, fontSize: 11 }]}>PRESET TIME SLOTS</Text>
                <Row style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  <Pressable onPress={() => setEventPreset(1, 14, 2)} style={[s.presetBtn, { borderColor: colors.border }]}>
                    <Text style={{ fontSize: 11, color: colors.text }}>Tomorrow 2:00 PM</Text>
                  </Pressable>
                  <Pressable onPress={() => setEventPreset(2, 10, 3)} style={[s.presetBtn, { borderColor: colors.border }]}>
                    <Text style={{ fontSize: 11, color: colors.text }}>In 2 Days 10:00 AM</Text>
                  </Pressable>
                  <Pressable onPress={() => setEventPreset(7, 15, 2)} style={[s.presetBtn, { borderColor: colors.border }]}>
                    <Text style={{ fontSize: 11, color: colors.text }}>Next Week 3:00 PM</Text>
                  </Pressable>
                </Row>

                <Row style={{ gap: 10, marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="ghost" onPress={() => setShowCreateEvent(false)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Check Clash & Publish"
                      onPress={handleOpenClashReview}
                    />
                  </View>
                </Row>
              </Card>
            )}

            {/* Events Listing */}
            {(d.events?.length ?? 0) === 0 ? (
              <Empty
                title="No Upcoming Events"
                detail="There are no scheduled workshops or seminars at the moment."
              />
            ) : (
              (d.events ?? []).map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => router.push(`/event/${e.id}` as any)}
                >
                  <Card style={s.eventCard}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.eventTitle, { color: colors.text }]}>{e.title}</Text>
                        {e.description ? (
                          <Muted numberOfLines={2} style={{ marginTop: 2 }}>{e.description}</Muted>
                        ) : null}
                        <Row style={{ gap: 12, marginTop: 8, alignItems: "center" }}>
                          <Row style={{ gap: 4, alignItems: "center" }}>
                            <MaterialCommunityIcons name="calendar" size={14} color={colors.primary} />
                            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                              {new Date(e.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </Text>
                          </Row>
                          <Row style={{ gap: 4, alignItems: "center" }}>
                            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.muted} />
                            <Text style={{ fontSize: 12, color: colors.muted }}>{e.location || "Online"}</Text>
                          </Row>
                        </Row>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                    </Row>
                  </Card>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}

        {/* TAB 4: MEDIA */}
        {activeTab === "media" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            {roomId ? (
              <>
                <RoomMaterialsHub roomId={roomId} isMember={isMember} />
                <RoomRecordings roomId={roomId} isModerator={isLeader} />
              </>
            ) : (
              <Empty title="Media Hub" detail="Join this club to access slides, handouts, and meeting recordings." />
            )}
          </ScrollView>
        )}

        {/* TAB 5: TEAM / MORE */}
        {activeTab === "more" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            {/* About */}
            <Card style={s.card}>
              <H2 style={s.sectionTitle}>About Society</H2>
              <Text style={[s.descText, { color: colors.text }]}>
                {d.description || "No description provided."}
              </Text>
            </Card>

            {/* Leadership Committee */}
            <Card style={s.card}>
              <H2 style={s.sectionTitle}>Executive Committee & Leadership</H2>
              {(d.members ?? []).length === 0 ? (
                <Muted>Leadership roster not yet published.</Muted>
              ) : (
                (d.members ?? []).map((m, idx) => {
                  const p = m.profiles;
                  return (
                    <Pressable
                      key={m.user_id || m.id || idx}
                      onPress={() => {
                        if (p?.id) router.push(`/user/${p.id}` as any);
                      }}
                      style={[s.memberRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={[s.memberAvatar, { backgroundColor: colors.primarySoft }]}>
                        <MaterialCommunityIcons name="account" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.memberName, { color: colors.text }]}>{p?.full_name || "Club Leader"}</Text>
                        <Muted style={{ fontSize: 12 }}>@{p?.username || "leader"}</Muted>
                      </View>
                      <Pill tone={m.role === "owner" ? "accent" : "primary"}>
                        {m.role === "owner" ? "President" : m.role === "admin" ? "Secretary" : "Member"}
                      </Pill>
                    </Pressable>
                  );
                })
              )}
            </Card>
          </ScrollView>
        )}
      </View>

      {/* Clash Detector Modal */}
      {showClashModal && (
        <ClashDetectorModal
          visible={showClashModal}
          clubId={id!}
          startsAt={eventStartsAt}
          endsAt={eventEndsAt}
          onClose={() => setShowClashModal(false)}
          onProceedAnyway={() => {
            createEventMutation.mutate({
              club_id: id!,
              title: eventTitle.trim(),
              description: eventDesc.trim(),
              starts_at: eventStartsAt,
              ends_at: eventEndsAt,
              location: eventLocation.trim() || undefined,
            });
          }}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  iconActionBtn: {
    padding: 6,
  },
  badgeRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    padding: 14,
    borderRadius: radius.lg,
  },
  descText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  eventCard: {
    padding: 12,
    borderRadius: radius.md,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
  },
});
