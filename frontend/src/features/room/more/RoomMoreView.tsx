import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Profile, Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type RoomMoreViewProps = {
  room: Room;
  members: Profile[];
  currentUserId?: string;
  isOwner?: boolean;
  canManageMembers?: boolean;
  canModerate?: boolean;
  onPromoteRole?: (memberId: string, newRole: "teacher" | "moderator" | "member") => void;
  onRemoveMember?: (memberId: string) => void;
  onLeaveRoom?: () => void;
  onOpenPinnedHub?: () => void;
  onOpenModerationCenter?: () => void;
  onOpenAnalytics?: () => void;
  onOpenSettings?: () => void;
};

export function RoomMoreView({
  room,
  members,
  currentUserId,
  isOwner,
  canManageMembers,
  canModerate,
  onPromoteRole,
  onRemoveMember,
  onLeaveRoom,
  onOpenPinnedHub,
  onOpenModerationCenter,
  onOpenAnalytics,
  onOpenSettings,
}: RoomMoreViewProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [searchMember, setSearchMember] = useState("");

  // Real mute state, read from the server (conversation_members.muted_until).
  const conversationId = room.conversation_id ?? null;
  const muteQuery = useQuery({
    queryKey: ["room-mute", conversationId],
    queryFn: () =>
      api<{ conversation: { muted_until: string | null } }>(`/chat/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
    retry: false,
  });
  const mutedUntil = muteQuery.data?.conversation?.muted_until ?? null;
  const isMuted = Boolean(mutedUntil && new Date(mutedUntil).getTime() > Date.now());

  const toggleMute = useMutation({
    mutationFn: (mute: boolean) =>
      api<{ conversation_id: string; muted_until: string | null; is_muted: boolean }>(
        `/chat/conversations/${conversationId}/mute`,
        {
          method: "PATCH",
          // 0 hours unmutes; 8760h (1y) mutes until the user turns it back off.
          body: JSON.stringify(mute ? { durationHours: 8760 } : { durationHours: 0 }),
        },
      ),
    onSuccess: (data) => {
      triggerHaptic();
      qc.setQueryData(["room-mute", conversationId], {
        conversation: { muted_until: data.muted_until },
      });
    },
    onError: (err: Error) => {
      Alert.alert("Could not update notifications", err.message);
    },
  });

  // Real, persisted room report -> POST /rooms/:id/report
  const reportMutation = useMutation({
    mutationFn: (payload: { reason: string; details?: string }) =>
      api(`/rooms/${room.id}/report`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert(
        t("rooms.reportSent", "Report submitted"),
        t(
          "rooms.reportSentDetail",
          "Thanks for helping keep SkillBridge safe. Our Trust & Safety team will review this room.",
        ),
      );
    },
    onError: (err: Error) => {
      Alert.alert(t("rooms.reportFailed", "Could not submit report"), err.message);
    },
  });

  const handleReport = () => {
    const reasons: { label: string; value: string }[] = [
      { label: "Spam or scam", value: "spam" },
      { label: "Harassment or hate", value: "harassment" },
      { label: "Explicit content", value: "nudity" },
      { label: "Violence or threats", value: "violence" },
      { label: "Misinformation", value: "misinformation" },
      { label: "Other", value: "other" },
    ];
    Alert.alert(
      t("rooms.reportRoom", "Report Room"),
      t("rooms.reportReason", "What is wrong with this room?"),
      [
        ...reasons.map((r) => ({
          text: r.label,
          onPress: () => reportMutation.mutate({ reason: r.value }),
        })),
        { text: t("common.cancel"), style: "cancel" as const },
      ],
    );
  };

  const filteredMembers = members.filter((m) =>
    searchMember.trim()
      ? m.full_name?.toLowerCase().includes(searchMember.toLowerCase().trim()) ||
        m.username?.toLowerCase().includes(searchMember.toLowerCase().trim())
      : true,
  );

  const handleMemberAction = (member: Profile) => {
    triggerHaptic();
    const isMe = member.id === currentUserId;
    const options: { text: string; onPress: () => void; style?: "cancel" | "destructive" }[] = [
      { text: "Cancel", style: "cancel", onPress: () => {} },
      {
        text: "View Profile",
        onPress: () => router.push(`/user/${member.id}` as any),
      },
    ];

    if (!isMe) {
      options.push({
        text: "Send Direct Message",
        onPress: () => router.push(`/chat/${member.id}` as any),
      });
    }

    if (isOwner && !isMe && onPromoteRole) {
      options.push({
        text: "Assign Role (Teacher / Moderator)",
        onPress: () => {
          Alert.alert("Manage Member Role", `Select role for ${member.full_name}:`, [
            { text: "Cancel", style: "cancel" },
            { text: "Teacher", onPress: () => onPromoteRole(member.id, "teacher") },
            { text: "Moderator", onPress: () => onPromoteRole(member.id, "moderator") },
            { text: "Regular Member", onPress: () => onPromoteRole(member.id, "member") },
          ]);
        },
      });
    }

    if (canManageMembers && !isMe && onRemoveMember) {
      options.push({
        text: "Remove from Room",
        style: "destructive",
        onPress: () => {
          Alert.alert("Remove Member", `Are you sure you want to remove ${member.full_name}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => onRemoveMember(member.id) },
          ]);
        },
      });
    }

    Alert.alert(member.full_name, `@${member.username}`, options);
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* 1. ROOM INFO */}
      <View style={s.sectionBlock}>
        <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM INFORMATION</Text>
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.roomDesc, { color: colors.text }]}>
            {room.description || `Academic collaboration room for ${room.topic}.`}
          </Text>

          <View style={[s.metaDivider, { backgroundColor: colors.divider }]} />

          <Row style={s.metaRow}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={18} color={colors.primary} />
            <Text style={[s.metaLabel, { color: colors.muted }]}>Topic / Subject:</Text>
            <Text style={[s.metaValue, { color: colors.text }]}>{room.topic}</Text>
          </Row>

          <Row style={s.metaRow}>
            <MaterialCommunityIcons name="lock-outline" size={18} color={colors.accent} />
            <Text style={[s.metaLabel, { color: colors.muted }]}>Access Mode:</Text>
            <Text style={[s.metaValue, { color: colors.text }]}>
              {room.visibility === "public" ? "Public Learning Room" : "Private (Invite / Join Approval)"}
            </Text>
          </Row>

          <Row style={s.metaRow}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={colors.info} />
            <Text style={[s.metaLabel, { color: colors.muted }]}>Format:</Text>
            <Text style={[s.metaValue, { color: colors.text }]}>
              {room.mode.toUpperCase()}{room.campus_location ? ` · ${room.campus_location}` : ""}
            </Text>
          </Row>

          <Row style={s.metaRow}>
            <MaterialCommunityIcons name="calendar-clock" size={18} color={colors.warning} />
            <Text style={[s.metaLabel, { color: colors.muted }]}>Created:</Text>
            <Text style={[s.metaValue, { color: colors.text }]}>
              {room.created_at ? new Date(room.created_at).toLocaleDateString() : "Recently"}
            </Text>
          </Row>
        </View>
      </View>

      {/* 2. NOTIFICATION SETTINGS — real, persisted mute via conversation_members.muted_until */}
      <View style={s.sectionBlock}>
        <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM NOTIFICATIONS</Text>
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border, padding: 6 }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              toggleMute.mutate(!isMuted);
            }}
            style={[s.prefRow, { backgroundColor: isMuted ? colors.primarySoft : "transparent" }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.prefLabel, { color: isMuted ? colors.primary : colors.text }]}>
                {isMuted ? "Room Muted" : "All Activity"}
              </Text>
              <Text style={[s.prefSub, { color: colors.muted }]}>
                {isMuted
                  ? "Notifications from this room are silenced"
                  : "Posts, announcements & classroom sessions"}
              </Text>
            </View>
            {toggleMute.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={isMuted}
                onValueChange={(next) => {
                  triggerHaptic();
                  toggleMute.mutate(next);
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            )}
          </Pressable>
        </View>
        <Text style={[s.prefSub, { color: colors.muted, marginTop: 6, paddingHorizontal: 2 }]}>
          {t("rooms.muteScopeNote", "Muting is applied to this room's chat and is saved to your account.")}
        </Text>
      </View>

      {/* 3. MEMBERS DIRECTORY */}
      <View style={s.sectionBlock}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>
            MEMBERS DIRECTORY ({members.length})
          </Text>
        </Row>

        {/* Member Search Field */}
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            value={searchMember}
            onChangeText={setSearchMember}
            placeholder="Search room members..."
            placeholderTextColor={colors.muted}
            style={[s.searchInput, { color: colors.text }]}
          />
        </View>

        <View style={[s.membersList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {filteredMembers.map((member, idx) => {
            const isLast = idx === filteredMembers.length - 1;
            return (
              <Pressable
                key={member.id}
                onPress={() => handleMemberAction(member)}
                style={({ pressed }) => [
                  s.memberRow,
                  { backgroundColor: pressed ? colors.surface2 : "transparent" },
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View style={[s.memberAvatar, { backgroundColor: colors.primarySoft }]}>
                  <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>
                    {member.full_name?.[0] || "U"}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ alignItems: "center", gap: 6 }}>
                    <Text style={[s.memberName, { color: colors.text }]} numberOfLines={1}>
                      {member.full_name}
                    </Text>
                    {member.id === room.owner_id && (
                      <View style={[s.roleBadge, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[s.roleBadgeText, { color: colors.primary }]}>OWNER</Text>
                      </View>
                    )}
                  </Row>
                  <Text style={[s.memberSub, { color: colors.muted }]}>
                    @{member.username}{member.department ? ` · ${member.department}` : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 4. COLLABORATION TOOLS */}
      <View style={s.sectionBlock}>
        <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM TOOLS & COLLABORATION</Text>
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border, padding: 6 }]}>
          {onOpenPinnedHub && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenPinnedHub();
              }}
              style={[s.toolRow, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
            >
              <View style={[s.toolIcon, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name="pin-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.toolTitle, { color: colors.text }]}>Pinned Content Hub</Text>
                <Text style={[s.toolSub, { color: colors.muted }]}>
                  Important posts, files, recordings & announcements
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          )}

          {canModerate && onOpenModerationCenter && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenModerationCenter();
              }}
              style={[s.toolRow, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
            >
              <View style={[s.toolIcon, { backgroundColor: "#EF444420" }]}>
                <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.danger} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.toolTitle, { color: colors.text }]}>Moderation & Safety Center</Text>
                <Text style={[s.toolSub, { color: colors.muted }]}>
                  Content reports, member flags & audit activity
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          )}

          {canModerate && onOpenAnalytics && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenAnalytics();
              }}
              style={[
                s.toolRow,
                (isOwner && onOpenSettings) && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}
            >
              <View style={[s.toolIcon, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.toolTitle, { color: colors.text }]}>Room Insights & Health</Text>
                <Text style={[s.toolSub, { color: colors.muted }]}>
                  Active member metrics, engagement & contributors
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          )}

          {isOwner && onOpenSettings && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenSettings();
              }}
              style={s.toolRow}
            >
              <View style={[s.toolIcon, { backgroundColor: colors.surface2 }]}>
                <MaterialCommunityIcons name="cog-outline" size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.toolTitle, { color: colors.text }]}>Room Settings & Modules</Text>
                <Text style={[s.toolSub, { color: colors.muted }]}>
                  Configure active features, entry tab & invite links
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* 5. ACTIONS & DANGER ZONE */}
      <View style={s.sectionBlock}>
        <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM ACTIONS</Text>
        <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              handleReport();
            }}
            disabled={reportMutation.isPending}
            style={[s.actionRow, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
          >
            {reportMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <MaterialCommunityIcons name="flag-outline" size={20} color={colors.muted} />
            )}
            <Text style={[s.actionRowText, { color: colors.text }]}>
              {t("rooms.reportCta", "Report Room to Campus Trust & Safety")}
            </Text>
          </Pressable>

          {onLeaveRoom && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                Alert.alert("Leave Room", "Are you sure you want to leave this room?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Leave", style: "destructive", onPress: onLeaveRoom },
                ]);
              }}
              style={s.actionRow}
            >
              <MaterialCommunityIcons name="logout" size={20} color={colors.danger} />
              <Text style={[s.actionRowText, { color: colors.danger, fontWeight: "700" }]}>
                Leave Learning Room
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  sectionBlock: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    paddingHorizontal: 2,
  },
  infoCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  roomDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaDivider: {
    height: 1,
    marginVertical: 2,
  },
  metaRow: {
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  prefLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  prefSub: {
    fontSize: 11,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  membersList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
  },
  memberSub: {
    fontSize: 11,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  actionRowText: {
    fontSize: 13,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  toolIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  toolSub: {
    fontSize: 11,
  },
});
