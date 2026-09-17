import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { Profile, Room, Session } from "@/types";
import { ErrorState, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";
import { RoomOSHeader } from "@/features/room/RoomOSHeader";
import { RoomOSTabs, type RoomOSTabKey } from "@/features/room/RoomOSTabs";
import { RoomPostsView } from "@/features/room/posts/RoomPostsView";
import { RoomChatView } from "@/features/room/chat/RoomChatView";
import { RoomLearnView } from "@/features/room/learn/RoomLearnView";
import { RoomMediaView } from "@/features/room/media/RoomMediaView";
import { RoomMoreView } from "@/features/room/more/RoomMoreView";
import { useRoomPermissions } from "@/features/room/useRoomPermissions";
import { RoomSearchModal } from "@/features/room/search/RoomSearchModal";
import { RoomPinnedHub } from "@/features/room/more/RoomPinnedHub";
import { RoomModerationCenter } from "@/features/room/more/RoomModerationCenter";
import { RoomAnalyticsView } from "@/features/room/more/RoomAnalyticsView";
import { RoomSettingsModal } from "@/features/room/more/RoomSettingsModal";
import { RoomVoiceSheet } from "@/features/room/voice/RoomVoiceSheet";
import { RoomVoiceBanner } from "@/features/room/voice/RoomVoiceBanner";
import { useActiveRoomSession } from "@/features/room/voice/useActiveRoomSession";

type RoomDetailData = {
  room: Room;
  members: Profile[];
  teachingRequests: { id: string; volunteer: Profile; status: string }[];
  sessions: Session[];
  resources: { id: string; title: string; url: string }[];
  myMembership?: { role: string; user_id: string } | null;
};

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useSession();

  const [activeTab, setActiveTab] = useState<RoomOSTabKey>("posts");
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [pinnedHubVisible, setPinnedHubVisible] = useState(false);
  const [moderationCenterVisible, setModerationCenterVisible] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);
  const [hasInitializedLandingTab, setHasInitializedLandingTab] = useState(false);

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
  const acceptVolunteer = useMutation({
    mutationFn: (vId: string) => api(`/rooms/${id}/volunteer/${vId}/accept`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      Alert.alert("Approved", "Teaching volunteer approved.");
    },
  });

  const rejectVolunteer = useMutation({
    mutationFn: (vId: string) => api(`/rooms/${id}/volunteer/${vId}/reject`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
    },
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

  if (roomQuery.isError || !roomQuery.data?.room) {
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

  const data = roomQuery.data;
  const room = data.room;
  const isMember = Boolean(data.myMembership || permissions.role);
  const activeLiveSession = data.sessions?.find((s) => s.status === "live");

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      {/* 1. ROOM OS COMPACT HEADER */}
      <RoomOSHeader
        room={room}
        isMember={isMember}
        memberRole={permissions.role}
        hasActiveLiveSession={Boolean(activeLiveSession)}
        onJoin={() => joinMutation.mutate()}
        onLeave={() => leaveMutation.mutate()}
        onOpenMore={() => setActiveTab("more")}
        onJoinLiveSession={() => router.push(`/live/${room.id}` as any)}
        onSearch={() => setSearchModalVisible(true)}
      />

      {/* Voice Presence Banner (persistent when room voice lounge active) */}
      <RoomVoiceBanner
        roomId={room.id}
        roomTitle={room.title}
        onPress={() => {
          triggerHaptic();
          setVoiceSheetVisible(true);
        }}
      />

      {/* 2. ROOM OS 5-TAB BAR */}
      <RoomOSTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
          />
        )}

        {activeTab === "chat" && (
          <RoomChatView
            roomId={room.id}
            conversationId={room.conversation_id}
            roomTitle={room.title}
            memberCount={room.member_count}
            isMember={permissions.isMember}
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
            isMember={permissions.isMember}
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
            isMember={permissions.isMember}
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

      {/* Real-time Voice Lounge Sheet */}
      <RoomVoiceSheet
        visible={voiceSheetVisible}
        roomId={room.id}
        roomTitle={room.title}
        isHostOrMod={permissions.isOwner || permissions.canModerate}
        onClose={() => setVoiceSheetVisible(false)}
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
});
