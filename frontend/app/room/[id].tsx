import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { Profile, Room, Session } from "@/types";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
} from "@/components/ui";
import { TextPromptModal } from "@/components/feedback/TextPromptModal";
import { radius, spacing, useTheme } from "@/theme";
import { RoomQABoard } from "@/features/room/RoomQABoard";
import { RoomRecordings } from "@/features/room/RoomRecordings";
import { RoomMaterialsHub } from "@/features/room/RoomMaterialsHub";
import { RoomChatTab } from "@/features/room/RoomChatTab";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Detail = {
  room: Room;
  members: Profile[];
  teachingRequests: { id: string; volunteer: Profile; status: string }[];
  sessions: Session[];
  resources: { id: string; title: string; url: string }[];
  myMembership?: { role: string; user_id: string } | null;
};

type TabKey = "overview" | "sessions" | "materials" | "chat";
type SessionSubTab = "upcoming" | "qa" | "recordings";

const ROOM_TABS: { key: TabKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "overview", label: "Overview", icon: "information-outline" },
  { key: "sessions", label: "Sessions", icon: "calendar-clock-outline" },
  { key: "materials", label: "Materials", icon: "folder-open-outline" },
  { key: "chat", label: "Chat", icon: "message-text-outline" },
];

const SESSION_SUB_TABS: { key: SessionSubTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "qa", label: "Q&A" },
  { key: "recordings", label: "Recordings" },
];

const ROLE_META: Record<string, { label: string; tone: "primary" | "default" | "danger" | "warning" }> = {
  owner: { label: "OWNER", tone: "primary" },
  teacher: { label: "TEACHER", tone: "warning" },
  moderator: { label: "MOD", tone: "danger" },
  member: { label: "MEMBER", tone: "default" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [sessionSubTab, setSessionSubTab] = useState<SessionSubTab>("upcoming");

  // Modals / form state
  const [volunteerNote, setVolunteerNote] = useState("");
  const [showVolunteerForm, setShowVolunteerForm] = useState(false);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");

  // ── Data ────────────────────────────────────────────────────────────────────

  const roomQuery = useQuery({
    queryKey: ["room", id],
    queryFn: () => api<Detail>(`/rooms/${id}`),
    enabled: Boolean(id),
  });

  const join = useMutation({
    mutationFn: () => api<{ joined: boolean; role: string }>(`/rooms/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) => Alert.alert("Join failed", (error as Error).message),
  });

  const leave = useMutation({
    mutationFn: () => api<{ left: boolean }>(`/rooms/${id}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      router.back();
    },
    onError: (error) => Alert.alert("Leave failed", (error as Error).message),
  });

  const volunteer = useMutation({
    mutationFn: () =>
      api(`/rooms/${id}/teach`, { method: "POST", body: JSON.stringify({ note: volunteerNote }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      setShowVolunteerForm(false);
      setVolunteerNote("");
      Alert.alert("Request sent", "The room owner can review your teaching request.");
    },
    onError: (error) => Alert.alert("Could not send request", (error as Error).message),
  });

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (roomQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={180} style={{ borderRadius: radius.lg }} />
        <Skeleton height={44} style={{ marginTop: 12, borderRadius: radius.md }} />
        <Skeleton height={200} style={{ marginTop: 8 }} />
      </Screen>
    );
  }

  if (roomQuery.isError) {
    return (
      <Screen>
        <ErrorState detail={(roomQuery.error as Error).message} onRetry={() => roomQuery.refetch()} />
      </Screen>
    );
  }

  if (!roomQuery.data) {
    return (
      <Screen>
        <Empty title="Room unavailable" detail="This room may have been removed or you don't have access." />
      </Screen>
    );
  }

  const d = roomQuery.data;
  const isHost = ["owner", "teacher"].includes(d.myMembership?.role ?? "");
  const isModerator = ["owner", "teacher", "moderator"].includes(d.myMembership?.role ?? "");
  const isMember = Boolean(d.myMembership);

  // ── Action handlers ─────────────────────────────────────────────────────────

  async function submitReview() {
    if (!reviewSessionId) return;
    const rating = Number(ratingValue);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      Alert.alert("Invalid rating", "Enter a whole number from 1 to 5.");
      return;
    }
    try {
      await api(`/sessions/${reviewSessionId}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: "Reviewed via SkillBridge mobile" }),
      });
      setReviewSessionId(null);
      setRatingValue("");
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Review submitted ⭐");
    } catch (error: any) {
      Alert.alert("Could not submit review", error.message);
    }
  }

  async function sendInvite() {
    const target = inviteUsername.trim().replace(/^@/, "");
    if (!target) {
      Alert.alert("Missing username", "Enter the username of the peer to invite.");
      return;
    }
    try {
      await api(`/rooms/${id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ username: target }),
      });
      setInviteUsername("");
      setShowInviteModal(false);
      Alert.alert("Invitation Sent", `Invited @${target} to join this room.`);
    } catch (error: any) {
      Alert.alert("Could not send invite", error.message);
    }
  }

  async function patchTeachRequest(requestId: string, status: "accepted" | "rejected") {
    try {
      await api(`/rooms/${id}/teach/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ["room", id] });
    } catch (error: any) {
      Alert.alert("Could not update", error.message);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isLive = d.room.status === "live";
  const liveSessions = d.sessions.filter((s) => s.status === "live");
  const upcomingSessions = d.sessions.filter((s) => s.status === "scheduled");

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      {/* ── Room OS Header ─────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 4 }]}>
        {/* Back + Settings row */}
        <Row style={s.headerTopRow}>
          <Pressable onPress={() => router.back()} style={s.iconBtn} hitSlop={10}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {isHost && (
            <Pressable
              onPress={() => router.push(`/room/${id}/schedule` as any)}
              style={s.iconBtn}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="calendar-plus" size={22} color={colors.primary} />
            </Pressable>
          )}
          {isModerator && (
            <Pressable
              onPress={() => setShowInviteModal(true)}
              style={s.iconBtn}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={22} color={colors.primary} />
            </Pressable>
          )}
        </Row>

        {/* Room identity */}
        <View style={s.headerIdentity}>
          {/* Icon placeholder */}
          <View style={[s.roomIcon, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons
              name={d.room.campus_location || d.room.mode === "offline" ? "school-outline" : d.room.mode === "online" ? "laptop" : "book-open-variant"}
              size={26}
              color={colors.primary}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.roomTitle, { color: colors.text }]} numberOfLines={2}>
              {d.room.title}
            </Text>
            <Row style={s.pillRow}>
              <Pill tone={isLive ? "danger" : "primary"}>
                {isLive ? "● LIVE" : d.room.status.toUpperCase()}
              </Pill>
              <Pill>{d.room.mode.toUpperCase()}</Pill>
              {d.room.topic ? <Pill>{d.room.topic}</Pill> : null}
            </Row>
          </View>
        </View>

        {/* Stats strip */}
        <Row style={s.statsStrip}>
          <StatChip icon="account-group-outline" value={`${d.room.member_count ?? d.members.length}`} label="members" colors={colors} />
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <StatChip icon="calendar-check-outline" value={`${d.sessions.length}`} label="sessions" colors={colors} />
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <StatChip icon="folder-outline" value={`${d.resources.length}`} label="resources" colors={colors} />
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <StatChip icon="account-group" value={`${d.room.capacity ?? "∞"}`} label="capacity" colors={colors} />
        </Row>

        {/* CTA row */}
        <View style={s.ctaRow}>
          {!isMember ? (
            <Button
              title={join.isPending ? "Joining…" : "Join Room"}
              onPress={() => join.mutate()}
              disabled={join.isPending}
            />
          ) : (
            <Row style={{ gap: 8 }}>
              {isLive && (
                <Button
                  title="🔴 Join Live"
                  onPress={() => {
                    const live = liveSessions[0];
                    if (live) router.push(`/live/${live.id}` as any);
                    else router.push(`/live/${id}` as any);
                  }}
                  compact
                />
              )}
              {d.room.conversation_id ? (
                <Button
                  title="💬 Chat"
                  variant="secondary"
                  onPress={() => setActiveTab("chat")}
                  compact
                />
              ) : null}
              <Button
                title="Leave"
                variant="ghost"
                onPress={() => {
                  Alert.alert("Leave room?", "You can rejoin at any time.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Leave",
                      style: "destructive",
                      onPress: () => leave.mutate(),
                    },
                  ]);
                }}
                compact
              />
            </Row>
          )}
        </View>
      </View>

      {/* ── Tab Bar ────────────────────────────────────────────────────────── */}
      <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {ROOM_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[s.tabItem, active && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <MaterialCommunityIcons
                name={tab.icon}
                size={16}
                color={active ? colors.primary : colors.muted}
              />
              <Text style={[s.tabLabel, { color: active ? colors.primary : colors.muted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <ScrollView
          contentContainerStyle={[s.tabContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Description */}
          {d.room.description ? (
            <Card tone="soft" style={s.card}>
              <Muted>{d.room.description}</Muted>
              {d.room.tags?.length > 0 && (
                <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {d.room.tags.slice(0, 6).map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </Row>
              )}
              {d.room.scheduled_at && (
                <Row style={{ gap: 6, marginTop: 8 }}>
                  <MaterialCommunityIcons name="calendar-clock" size={16} color={colors.primary} />
                  <Muted>{new Date(d.room.scheduled_at).toLocaleString()}</Muted>
                </Row>
              )}
            </Card>
          ) : null}

          {/* Volunteer to teach */}
          {isMember && (
            <Card style={s.card}>
              {!showVolunteerForm ? (
                <Pressable onPress={() => setShowVolunteerForm(true)} style={s.volunteerBanner}>
                  <MaterialCommunityIcons name="hand-wave-outline" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sectionTitle, { color: colors.text }]}>Volunteer to teach</Text>
                    <Muted>Share your expertise with this room.</Muted>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
              ) : (
                <>
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Why are you a good fit?</Text>
                  <Muted>Optional note for the room owner.</Muted>
                  <Field
                    placeholder="Add a note (optional)"
                    value={volunteerNote}
                    onChangeText={setVolunteerNote}
                    multiline
                    numberOfLines={3}
                    style={{ marginTop: 8 }}
                  />
                  <Row style={{ gap: 8, marginTop: 8 }}>
                    <Button
                      title="Cancel"
                      variant="ghost"
                      compact
                      onPress={() => { setShowVolunteerForm(false); setVolunteerNote(""); }}
                    />
                    <Button
                      title={volunteer.isPending ? "Sending…" : "Submit request"}
                      compact
                      disabled={volunteer.isPending}
                      onPress={() => volunteer.mutate()}
                    />
                  </Row>
                </>
              )}
            </Card>
          )}

          {/* Teaching requests (owner sees all, member sees their own) */}
          {d.teachingRequests.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: colors.text, marginTop: 4 }]}>
                Teaching Requests ({d.teachingRequests.length})
              </Text>
              {d.teachingRequests.map((req) => (
                <Card key={req.id} style={s.card}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <View style={{ gap: 2 }}>
                      <Text style={[s.memberName, { color: colors.text }]}>{req.volunteer.full_name}</Text>
                      <Muted>@{req.volunteer.username}</Muted>
                    </View>
                    <Pill tone={req.status === "accepted" ? "primary" : req.status === "rejected" ? "danger" : "default"}>
                      {req.status.toUpperCase()}
                    </Pill>
                  </Row>
                  {d.myMembership?.role === "owner" && req.status === "pending" && (
                    <Row style={{ gap: 8, marginTop: 8 }}>
                      <Button
                        title="Accept"
                        compact
                        onPress={() => patchTeachRequest(req.id, "accepted")}
                      />
                      <Button
                        title="Reject"
                        compact
                        variant="secondary"
                        onPress={() => patchTeachRequest(req.id, "rejected")}
                      />
                    </Row>
                  )}
                </Card>
              ))}
            </>
          )}

          {/* Members */}
          <Text style={[s.sectionTitle, { color: colors.text, marginTop: 4 }]}>
            Members ({d.members.length})
          </Text>
          {d.members.length === 0 ? (
            <Muted style={{ marginTop: 4 }}>No members listed.</Muted>
          ) : (
            d.members.map((member: any, idx) => {
              const p = member?.profiles || member;
              const memId = member?.id || p?.id || member?.user_id || `mem-${idx}`;
              const fullName = p?.full_name || member?.full_name || `@${p?.username || member?.username || "user"}`;
              const username = p?.username || member?.username || "user";
              const reputation = p?.reputation ?? member?.reputation ?? 0;
              const role = member?.role ?? (memId === d.room.owner_id ? "owner" : "member");
              const roleMeta = ROLE_META[role] ?? ROLE_META.member;

              return (
                <Pressable key={memId} onPress={() => router.push(`/user/${memId}` as any)}>
                  <Card tone="soft" style={[s.memberCard]}>
                    <View style={[s.memberAvatar, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[s.memberAvatarText, { color: colors.primary }]}>
                        {fullName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.memberName, { color: colors.text }]}>{fullName}</Text>
                      <Muted>@{username} · {reputation} rep</Muted>
                    </View>
                    <Pill tone={roleMeta.tone}>{roleMeta.label}</Pill>
                  </Card>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Sessions Tab */}
      {activeTab === "sessions" && (
        <View style={{ flex: 1 }}>
          {/* Sub-tab bar */}
          <View style={[s.subTabBar, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}>
            {SESSION_SUB_TABS.map((st) => {
              const active = sessionSubTab === st.key;
              return (
                <Pressable
                  key={st.key}
                  onPress={() => setSessionSubTab(st.key)}
                  style={[s.subTabItem, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                >
                  <Text style={[s.subTabLabel, { color: active ? colors.primary : colors.muted }]}>
                    {st.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {sessionSubTab === "upcoming" && (
            <ScrollView
              contentContainerStyle={[s.tabContent, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
            >
              {isHost && (
                <View style={{ marginBottom: 8 }}>
                  <Button
                    title="+ Schedule New Session"
                    variant="secondary"
                    onPress={() => router.push(`/room/${id}/schedule` as any)}
                  />
                </View>
              )}
              {d.sessions.length === 0 ? (
                <Empty title="No sessions yet" detail="Sessions scheduled by teachers appear here." />
              ) : (
                d.sessions.map((session) => {
                  const isTeacher = session.teacher_id === d.myMembership?.user_id;
                  const sessionIsLive = session.status === "live";
                  return (
                    <Card key={session.id} tone={sessionIsLive ? "glow" : "default"} style={s.card}>
                      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ gap: 3, flex: 1 }}>
                          <Text style={[s.memberName, { color: colors.text }]}>
                            {new Date(session.starts_at).toLocaleDateString([], {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </Text>
                          <Muted>
                            {new Date(session.starts_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} · {session.mode?.toUpperCase()} session
                          </Muted>
                        </View>
                        <Pill
                          tone={sessionIsLive ? "danger" : session.status === "scheduled" ? "primary" : "default"}
                        >
                          {sessionIsLive ? "● LIVE" : session.status.toUpperCase()}
                        </Pill>
                      </Row>
                      <Row style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        {session.status === "scheduled" && (isTeacher || isHost) && (
                          <Button
                            title="Start Live Class 🔴"
                            compact
                            onPress={() =>
                              api(`/sessions/${session.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: "live" }),
                              })
                                .then(() => {
                                  qc.invalidateQueries({ queryKey: ["room", id] });
                                  router.push(`/live/${session.id}` as any);
                                })
                                .catch((err) => Alert.alert("Error starting class", err.message))
                            }
                          />
                        )}
                        {sessionIsLive && (
                          <>
                            <Button
                              title="Join Live 🔴"
                              compact
                              onPress={() => router.push(`/live/${session.id}` as any)}
                            />
                            {(isTeacher || isHost) && (
                              <Button
                                title="End Session"
                                compact
                                variant="secondary"
                                onPress={() =>
                                  api(`/sessions/${session.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ status: "completed" }),
                                  })
                                    .then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                                    .catch((err) => Alert.alert("Error ending class", err.message))
                                }
                              />
                            )}
                          </>
                        )}
                        {session.status === "completed" && !isTeacher && (
                          <Button
                            title="Review ⭐"
                            compact
                            variant="secondary"
                            onPress={() => { setReviewSessionId(session.id); setRatingValue(""); }}
                          />
                        )}
                      </Row>
                    </Card>
                  );
                })
              )}
            </ScrollView>
          )}

          {sessionSubTab === "qa" && (
            <RoomQABoard roomId={id!} isMember={isMember} />
          )}

          {sessionSubTab === "recordings" && (
            <RoomRecordings roomId={id!} isModerator={isModerator} />
          )}
        </View>
      )}

      {/* Materials Tab */}
      {activeTab === "materials" && (
        <RoomMaterialsHub roomId={id!} isMember={isMember} resources={d.resources} />
      )}

      {/* Chat Tab — lazy, only mounts socket when active */}
      {activeTab === "chat" && (
        <RoomChatTab conversationId={d.room.conversation_id} isMember={isMember} />
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <TextPromptModal
        visible={Boolean(reviewSessionId)}
        title="Rate this session"
        detail="Enter a whole number from 1 to 5."
        value={ratingValue}
        onChangeText={setRatingValue}
        keyboardType="number-pad"
        placeholder="1–5"
        submitLabel="Submit review"
        onCancel={() => { setReviewSessionId(null); setRatingValue(""); }}
        onSubmit={() => void submitReview()}
      />
      <TextPromptModal
        visible={showInviteModal}
        title="Invite Peer to Room"
        detail="Enter the username of the peer you wish to invite."
        value={inviteUsername}
        onChangeText={setInviteUsername}
        placeholder="e.g. johndoe"
        submitLabel="Send Invitation"
        onCancel={() => { setShowInviteModal(false); setInviteUsername(""); }}
        onSubmit={() => void sendInvite()}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatChip({
  icon,
  value,
  label,
  colors,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
  label: string;
  colors: any;
}) {
  return (
    <View style={s.statChip}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.primary} />
      <Text style={[s.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTopRow: {
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  iconBtn: {
    padding: 6,
    borderRadius: radius.md,
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  roomIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  pillRow: {
    flexWrap: "wrap",
    gap: 5,
    marginTop: 2,
  },
  statsStrip: {
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 6,
    gap: 0,
  },
  statChip: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 4,
  },
  ctaRow: {
    paddingBottom: spacing.xs,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Sub-tab bar (Sessions)
  subTabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  subTabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subTabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  // Tab content
  tabContent: {
    padding: spacing.md,
    gap: 10,
  },
  card: {
    marginBottom: 0,
  },

  // Overview section
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },

  // Volunteer
  volunteerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // Member cards
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: "800",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "700",
  },
});
