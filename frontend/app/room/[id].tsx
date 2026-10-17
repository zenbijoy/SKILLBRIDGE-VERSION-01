import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { Profile, Room, RoomPostType, Session } from "@/types";
import { ErrorState, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RoomOSHeader } from "@/features/room/RoomOSHeader";
import { RoomOSTabs, type RoomOSTabKey } from "@/features/room/RoomOSTabs";
import { RoomPostsView } from "@/features/room/posts/RoomPostsView";
import { RoomChatView } from "@/features/room/chat/RoomChatView";
import { RoomLearnView } from "@/features/room/learn/RoomLearnView";
import { RoomMediaView } from "@/features/room/media/RoomMediaView";
import { RoomMoreView } from "@/features/room/more/RoomMoreView";
import { useRoomPermissions } from "@/features/room/useRoomPermissions";
import { useRoomPresence } from "@/features/room/useRoomPresence";
import { RoomSearchModal } from "@/features/room/search/RoomSearchModal";
import { RoomPinnedHub } from "@/features/room/more/RoomPinnedHub";
import { RoomModerationCenter } from "@/features/room/more/RoomModerationCenter";
import { RoomAnalyticsView } from "@/features/room/more/RoomAnalyticsView";
import { RoomSettingsModal } from "@/features/room/more/RoomSettingsModal";
import { RoomVoiceSheet } from "@/features/room/voice/RoomVoiceSheet";
import { RoomVoiceBanner } from "@/features/room/voice/RoomVoiceBanner";
import { useActiveRoomSession } from "@/features/room/voice/useActiveRoomSession";
import { RoomKnockLobbyScreen } from "@/features/room/knock/RoomKnockLobbyScreen";
import { RoomKnockRequestsModal } from "@/features/room/knock/RoomKnockRequestsModal";
import { RoomMonitoringCenterModal } from "@/features/room/monitoring/RoomMonitoringCenterModal";
import { getSocket } from "@/lib/socket";

type RoomDetailData = {
  room: Room;
  members: Profile[];
  teachingRequests: { id: string; volunteer: Profile; status: string }[];
  sessions: Session[];
  resources: { id: string; title: string; url: string }[];
  // Backend GET /rooms/:id returns `membership` (not `myMembership`).
  membership?: { role: string; user_id: string } | null;
  liveSession?: Session | null;
  liveParticipantCount?: number;
  unreadCount?: number;
  preview?: {
    isPreview: boolean;
    topPosts: { id: string; title?: string | null; body: string; type: string; likes_count: number; comments_count: number }[];
    questionsCount: number;
    nextSession: Session | null;
  };
};

export default function RoomDetailScreen() {
  const { id, openKnock } = useLocalSearchParams<{ id: string; openKnock?: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { session } = useSession();

  const [activeTab, setActiveTab] = useState<RoomOSTabKey>("posts");
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [pinnedHubVisible, setPinnedHubVisible] = useState(false);
  const [moderationCenterVisible, setModerationCenterVisible] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);
  const voiceSession = useActiveRoomSession();
  const [knockRequestsVisible, setKnockRequestsVisible] = useState(false);
  const [monitoringVisible, setMonitoringVisible] = useState(false);
  const [hasInitializedLandingTab, setHasInitializedLandingTab] = useState(false);
  const [externalComposerOpen, setExternalComposerOpen] = useState(false);
  const [composerInitialType, setComposerInitialType] = useState<RoomPostType>("discussion");
  const [rolePreviewOverride, setRolePreviewOverride] = useState<"educator" | "learner" | null>(null);

  // Auto-open knock requests if navigated with openKnock query param (e.g. from notification)
  React.useEffect(() => {
    if (openKnock === "true") {
      setKnockRequestsVisible(true);
    }
  }, [openKnock]);

  // 1. Fetch Room Core Details
  const roomQuery = useQuery({
    queryKey: ["room", id],
    queryFn: () => api<RoomDetailData>(`/rooms/${id}`),
    enabled: Boolean(id),
  });

  // Sync default landing tab if configured
  React.useEffect(() => {
    if (!hasInitializedLandingTab && roomQuery.data?.room?.default_landing_tab) {
      setActiveTab(roomQuery.data.room.default_landing_tab as RoomOSTabKey);
      setHasInitializedLandingTab(true);
    }
  }, [hasInitializedLandingTab, roomQuery.data?.room?.default_landing_tab]);

  // 2. Fetch Server-Authoritative Capabilities
  const permissions = useRoomPermissions(id);

  // Live presence: seeded from the room payload, then kept fresh via socket
  // events (LiveKit join/leave) with a 15s polling fallback.
  const presence = useRoomPresence(id, {
    liveSessionId: roomQuery.data?.liveSession?.id ?? null,
    liveParticipantCount: roomQuery.data?.liveParticipantCount ?? 0,
  });

  // 3. Join / Leave Mutations
  const joinMutation = useMutation({
    mutationFn: () => api<{ joined: boolean; role: string }>(`/rooms/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["room-permissions", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (err: Error) => Alert.alert("Join failed", err.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () => api<{ left: boolean }>(`/rooms/${id}/leave`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["room-permissions", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      router.back();
    },
    onError: (err: Error) => Alert.alert("Leave failed", err.message),
  });

  // 4. Teaching Volunteer Operations
  // NOTE: backend exposes PATCH /rooms/:id/teach/:requestId with { status: "accepted" | "rejected" }.
  // The previous /volunteer/:vId/accept endpoints never existed and always 404'd.
  const acceptVolunteer = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${id}/teach/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Approved", "Teaching volunteer approved.");
    },
    onError: (err: Error) => Alert.alert("Approval failed", err.message),
  });

  const rejectVolunteer = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${id}/teach/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected" }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Declined", "Teaching request declined.");
    },
    onError: (err: Error) => Alert.alert("Could not decline request", err.message),
  });

  const volunteerToTeach = useMutation({
    mutationFn: () =>
      api(`/rooms/${id}/teach`, { method: "POST", body: JSON.stringify({ note: "Volunteer request" }) }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Request Sent", "Your request to teach has been submitted to the room host.");
    },
    onError: (err: Error) => Alert.alert("Request Failed", err.message),
  });

  // 5. Member Management Mutations
  const promoteRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: "teacher" | "moderator" | "member" }) =>
      api(`/rooms/${id}/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Role Updated", "Member role has been changed.");
    },
    onError: (err: Error) => Alert.alert("Update Failed", err.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api(`/rooms/${id}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Member Removed", "The user has been removed from this room.");
    },
    onError: (err: Error) => Alert.alert("Remove Failed", err.message),
  });

  const data = roomQuery.data;
  const room = data?.room;
  // Single source of truth for membership: server-authoritative permissions,
  // falling back to the membership row returned with the room payload.
  const isMember = permissions.isMember || Boolean(data?.membership);
  const isPreview = Boolean(data?.preview?.isPreview) && !isMember;

  const baseIsEducator = Boolean(
    permissions.isOwner ||
    permissions.role === "host" ||
    permissions.role === "teacher" ||
    permissions.role === "moderator" ||
    permissions.canModerate ||
    data?.membership?.role === "host" ||
    data?.membership?.role === "teacher" ||
    data?.membership?.role === "moderator"
  );
  const isEducator = rolePreviewOverride !== null ? rolePreviewOverride === "educator" : baseIsEducator;

  // Real-time Pending Knock Requests for Room Admins & Educators
  // Declared at top level unconditionally to preserve React hooks ordering
  const knockRequestsQuery = useQuery({
    queryKey: ["room-knock-requests", id],
    queryFn: () => api<{ requests: any[]; knockModeEnabled: boolean }>(`/rooms/${id}/knock/requests`),
    enabled: Boolean(id) && isEducator && Boolean(room),
    refetchInterval: isEducator ? 12000 : false,
  });

  const pendingKnocks = knockRequestsQuery.data?.requests ?? [];
  const pendingKnockCount = pendingKnocks.length;

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket || !isEducator) return;

    const handleNewKnock = (payload: any) => {
      if (payload?.roomId === id) {
        triggerHaptic();
        knockRequestsQuery.refetch();
      }
    };

    socket.on("room:knock:new", handleNewKnock);
    return () => {
      socket.off("room:knock:new", handleNewKnock);
    };
  }, [id, isEducator, knockRequestsQuery]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (roomQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} style={{ borderRadius: radius.md }} />
        <Skeleton height={48} style={{ marginVertical: 8, borderRadius: radius.sm }} />
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (roomQuery.isError || !room) {
    return (
      <Screen>
        <ErrorState
          title="Room not found"
          detail="This learning room may have been archived or is private."
          onRetry={() => roomQuery.refetch()}
        />
      </Screen>
    );
  }

  // ── Knock Lobby Guard for Non-Members ──────────────────────────────────────
  // If user is not a member and knock mode is explicitly enabled (or room is private/locked),
  // they enter the RoomKnockLobbyScreen where they can send a message request to the room host.
  const requiresKnock = !isMember && (Boolean(room.knock_mode_enabled) || room.visibility === "private" || Boolean(room.is_locked));
  if (requiresKnock) {
    return (
      <RoomKnockLobbyScreen
        room={room}
        onAdmitted={() => {
          triggerHaptic();
          qc.invalidateQueries({ queryKey: ["room", id] });
          qc.invalidateQueries({ queryKey: ["room-permissions", id] });
          qc.invalidateQueries({ queryKey: ["rooms"] });
        }}
        onBack={() => router.back()}
      />
    );
  }

  const handleToggleRolePreview = () => {
    Alert.alert(
      "Room View Preview",
      `Currently viewing as: ${isEducator ? "Educator Dashboard" : "Learning Room (Learner UI)"}\nSwitch mode to test both UI views:`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "View as Learner", onPress: () => setRolePreviewOverride("learner") },
        { text: "View as Educator", onPress: () => setRolePreviewOverride("educator") },
        { text: "Reset to Actual Role", onPress: () => setRolePreviewOverride(null) },
      ],
    );
  };

  const liveParticipantCount = presence.liveParticipantCount;
  const hasLiveSession = presence.isLive;
  const liveSessionId = presence.sessionId;
  const unreadCount = data.unreadCount ?? 0;
  const userAvatarUrl = session?.user?.user_metadata?.avatar_url || (session?.user as any)?.avatar_url;
  const userFullName = session?.user?.user_metadata?.full_name || (session?.user as any)?.full_name;

  if (isPreview) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
        <RoomOSHeader
          room={room}
          isMember={false}
          memberRole={null}
          isEducator={isEducator}
          userAvatarUrl={userAvatarUrl}
          userFullName={userFullName}
          hasActiveLiveSession={hasLiveSession}
          liveParticipantsCount={liveParticipantCount}
          onJoin={() => joinMutation.mutate()}
          onLeave={() => leaveMutation.mutate()}
          onOpenMore={() => setActiveTab("more")}
          onJoinLiveSession={() => router.push(`/live/${room.id}` as any)}
          onOpenVoice={async () => {
            triggerHaptic();
            if (!voiceSession.isVoiceActive) {
              await voiceSession.joinVoiceSession(room.id, room.title);
            }
            setVoiceSheetVisible(true);
          }}
          onSearch={undefined}
          onToggleRolePreview={handleToggleRolePreview}
        />
        <View style={[s.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.previewTitle, { color: colors.text }]}>Vit relevant preview</Text>
          <Text style={[s.previewSub, { color: colors.muted }]}>
            Join korle full posts, chat, live class pabe. Ekhon top {data.preview?.topPosts?.length ?? 0} ta
            popular post + {data.preview?.questionsCount ?? 0} ta Q&A dekhte parcho.
          </Text>
          {(data.preview?.topPosts ?? []).map((p) => (
            <View key={p.id} style={[s.previewPost, { backgroundColor: colors.surface2 }]}>
              <Text style={[s.previewPostTitle, { color: colors.text }]} numberOfLines={1}>
                {p.title || p.body}
              </Text>
              <Text style={[s.previewPostSub, { color: colors.muted }]}>
                ♥ {p.likes_count} · 💬 {p.comments_count}
              </Text>
            </View>
          ))}
          <Pressable
            onPress={() => joinMutation.mutate()}
            style={[s.previewJoin, { backgroundColor: colors.primary }]}
          >
            <Text style={s.previewJoinTxt}>Join Room — full access pao</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      {/* 1. ROOM OS COMPACT HEADER */}
      <RoomOSHeader
        room={room}
        isMember={isMember}
        memberRole={permissions.role}
        isEducator={isEducator}
        userAvatarUrl={userAvatarUrl}
        userFullName={userFullName}
        hasActiveLiveSession={hasLiveSession}
        liveParticipantsCount={liveParticipantCount}
        attendancePercent={80}
        onJoin={() => joinMutation.mutate()}
        onLeave={() => leaveMutation.mutate()}
        onOpenMore={() => setActiveTab("more")}
        onJoinLiveSession={() => {
          // Pass the concrete session id so the live screen joins the right room.
          router.push(
            liveSessionId
              ? ({ pathname: "/live/[roomId]", params: { roomId: room.id, sessionId: liveSessionId } } as any)
              : (`/live/${room.id}` as any),
          );
        }}
        onOpenVoice={async () => {
          triggerHaptic();
          if (!voiceSession.isVoiceActive) {
            await voiceSession.joinVoiceSession(room.id, room.title);
          }
          setVoiceSheetVisible(true);
        }}
        onSearch={() => setSearchModalVisible(true)}
        onPostAnnouncement={() => {
          setActiveTab("posts");
          setComposerInitialType("announcement");
          setExternalComposerOpen(true);
        }}
        onOpenAnalytics={() => setAnalyticsVisible(true)}
        onAttendance={() => setActiveTab("learn")}
        onToggleRolePreview={handleToggleRolePreview}
      />

      {/* Voice Presence Banner (persistent when room voice room active) */}
      <RoomVoiceBanner
        roomId={room.id}
        roomTitle={room.title}
        memberCount={room.member_count}
        onPress={() => {
          triggerHaptic();
          setVoiceSheetVisible(true);
        }}
      />

      {/* Real-time Knock Waiting Banner for Room Admins & Educators */}
      {isEducator && pendingKnockCount > 0 && (
        <Pressable
          onPress={() => {
            triggerHaptic();
            setKnockRequestsVisible(true);
          }}
          style={[s.knockAlertBanner, { backgroundColor: colors.surface, borderColor: colors.primary }]}
        >
          <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
            <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
              <View style={[s.knockAlertIcon, { backgroundColor: `${colors.primary}20` }]}>
                <MaterialCommunityIcons name="door-open" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <Text style={[s.knockAlertTitle, { color: colors.text }]}>
                    {pendingKnockCount} {pendingKnockCount === 1 ? "user waiting" : "users waiting"} to join
                  </Text>
                  <View style={[s.liveDot, { backgroundColor: "#10B981" }]} />
                </Row>
                <Text style={[s.knockAlertSub, { color: colors.muted }]} numberOfLines={1}>
                  Review knock messages and audio call requests
                </Text>
              </View>
            </Row>
            <View style={[s.knockAlertBtn, { backgroundColor: colors.primary }]}>
              <Text style={s.knockAlertBtnText}>Review ({pendingKnockCount})</Text>
            </View>
          </Row>
        </Pressable>
      )}

      {/* 2. ROOM OS 5-TAB BAR */}
      <RoomOSTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        chatUnreadCount={unreadCount}
        isEducator={isEducator}
      />

      {/* 3. ACTIVE DESTINATION VIEW (With state preservation) */}
      <View style={s.contentArea}>
        {activeTab === "posts" && (
          <RoomPostsView
            room={room}
            currentUserId={session?.user.id}
            canPost={permissions.canPost}
            canAnnounce={permissions.canAnnounce}
            canPin={permissions.canPin}
            canModerate={permissions.canModerate}
            isEducator={isEducator}
            onOpenAnalytics={() => setAnalyticsVisible(true)}
            onOpenPinnedHub={() => setPinnedHubVisible(true)}
            externalComposerOpen={externalComposerOpen}
            onCloseExternalComposer={() => setExternalComposerOpen(false)}
            composerInitialType={composerInitialType}
          />
        )}

        {activeTab === "chat" && (
          <RoomChatView
            roomId={room.id}
            conversationId={room.conversation_id}
            roomTitle={room.title}
            memberCount={room.member_count}
            isMember={isMember}
            canManageChannels={permissions.canManageChannels}
            onOpenSearch={() => setSearchModalVisible(true)}
            onJoinVoice={() => setVoiceSheetVisible(true)}
          />
        )}

        {activeTab === "learn" && (
          <RoomLearnView
            room={room}
            sessions={data.sessions ?? []}
            teachingRequests={data.teachingRequests}
            isOwner={permissions.isOwner}
            isMember={isMember}
            canStartLive={permissions.canStartLive}
            onAcceptVolunteer={(vId) => acceptVolunteer.mutate(vId)}
            onRejectVolunteer={(vId) => rejectVolunteer.mutate(vId)}
            onVolunteer={() => volunteerToTeach.mutate()}
          />
        )}

        {activeTab === "media" && (
          <RoomMediaView
            roomId={room.id}
            isHostOrMod={permissions.isOwner || permissions.canModerate}
            isMember={isMember}
          />
        )}

        {activeTab === "more" && (
          <RoomMoreView
            room={room}
            members={data.members ?? []}
            currentUserId={session?.user.id}
            isOwner={permissions.isOwner}
            canManageMembers={permissions.canManageMembers}
            canModerate={permissions.canModerate || permissions.isOwner}
            onPromoteRole={(memberId, role) => promoteRoleMutation.mutate({ memberId, role })}
            onRemoveMember={(memberId) => removeMemberMutation.mutate(memberId)}
            onLeaveRoom={() => leaveMutation.mutate()}
            onOpenPinnedHub={() => setPinnedHubVisible(true)}
            onOpenModerationCenter={() => setModerationCenterVisible(true)}
            onOpenAnalytics={() => setAnalyticsVisible(true)}
            onOpenSettings={() => setSettingsVisible(true)}
            onOpenKnockRequests={() => setKnockRequestsVisible(true)}
            onOpenMonitoringCenter={() => setMonitoringVisible(true)}
          />
        )}
      </View>

      {/* 4. MODALS & COLLABORATION SHEETS */}

      {/* In-Room Contextual Search Modal */}
      <RoomSearchModal
        visible={searchModalVisible}
        roomId={room.id}
        roomTitle={room.title}
        onClose={() => setSearchModalVisible(false)}
        onSelectResult={(targetTab, metadata) => {
          setActiveTab(targetTab);
          if (metadata?.memberId) {
            router.push(`/user/${metadata.memberId}` as any);
          }
        }}
      />

      {/* Pinned Content Hub */}
      <RoomPinnedHub
        visible={pinnedHubVisible}
        roomId={room.id}
        canPin={permissions.canPin || permissions.isOwner}
        onClose={() => setPinnedHubVisible(false)}
        onSelectItem={(item) => {
          if (item.item_type === "announcement") setActiveTab("posts");
          else if (item.item_type === "question" || item.item_type === "event") setActiveTab("learn");
          else if (item.item_type === "video" || item.item_type === "resource") setActiveTab("media");
        }}
      />

      {/* Moderation & Safety Center */}
      <RoomModerationCenter
        visible={moderationCenterVisible}
        roomId={room.id}
        onClose={() => setModerationCenterVisible(false)}
      />

      {/* Room Analytics & Health */}
      <RoomAnalyticsView
        visible={analyticsVisible}
        roomId={room.id}
        roomTitle={room.title}
        onClose={() => setAnalyticsVisible(false)}
      />

      {/* Room Settings & Customization */}
      <RoomSettingsModal
        visible={settingsVisible}
        room={room}
        onClose={() => setSettingsVisible(false)}
        onRoomUpdated={() => {
          qc.invalidateQueries({ queryKey: ["room", id] });
        }}
      />

      {/* Real-time Voice Room Sheet */}
      <RoomVoiceSheet
        visible={voiceSheetVisible}
        roomId={room.id}
        roomTitle={room.title}
        isHostOrMod={permissions.isOwner || permissions.canModerate}
        onClose={() => {
          setVoiceSheetVisible(false);
          // Stop LiveKit audio bridge when user dismisses without clicking Leave
          voiceSession.leaveVoiceSession();
        }}
      />

      {/* Knock & Waiting Requests Management Modal */}
      <RoomKnockRequestsModal
        visible={knockRequestsVisible}
        roomId={room.id}
        knockModeEnabled={room.knock_mode_enabled}
        onClose={() => {
          setKnockRequestsVisible(false);
          qc.invalidateQueries({ queryKey: ["room", id] });
        }}
      />

      {/* Real-time Room Telemetry & Monitoring Center Modal */}
      <RoomMonitoringCenterModal
        visible={monitoringVisible}
        roomId={room.id}
        isHost={isEducator}
        onClose={() => setMonitoringVisible(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  previewCard: { margin: 16, padding: 16, borderRadius: 14, borderWidth: 1, gap: 10 },
  previewTitle: { fontSize: 16, fontWeight: "800" },
  previewSub: { fontSize: 13, lineHeight: 19 },
  previewPost: { padding: 10, borderRadius: 10 },
  previewPostTitle: { fontSize: 13, fontWeight: "700" },
  previewPostSub: { fontSize: 11, marginTop: 2 },
  previewJoin: { padding: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  previewJoinTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  knockAlertBanner: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  knockAlertIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  knockAlertTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  knockAlertSub: {
    fontSize: 11,
    marginTop: 2,
  },
  knockAlertBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  knockAlertBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
