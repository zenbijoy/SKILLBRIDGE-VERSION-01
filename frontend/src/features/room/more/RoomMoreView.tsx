import React, { useEffect, useMemo, useState } from "react";
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
import { ActiveDot } from "@/features/presence/ActiveDot";
import { RoomAdminHub } from "./RoomAdminHub";
import { RoomTeacherHub } from "./RoomTeacherHub";
import { RoomMemberHub } from "./RoomMemberHub";
import { RoomRoleManagementModal } from "./RoomRoleManagementModal";
import type { RoleTier } from "../roles/roleConfig";

type RoleFilter = "all" | "admin" | "teacher" | "member";

export type RoomMoreViewProps = {
  room: Room;
  members: Profile[];
  currentUserId?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isTeacher?: boolean;
  role?: string | null;
  canManageMembers?: boolean;
  canManageRoles?: boolean;
  canModerate?: boolean;
  canStartLive?: boolean;
  canAnnounce?: boolean;
  canPin?: boolean;
  onPromoteRole?: (memberId: string, newRole: RoleTier) => void;
  onRemoveMember?: (memberId: string) => void;
  onLeaveRoom?: () => void;
  onOpenPinnedHub?: () => void;
  onOpenModerationCenter?: () => void;
  onOpenAnalytics?: () => void;
  onOpenSettings?: () => void;
  onOpenMonitoringCenter?: () => void;
  onOpenKnockRequests?: () => void;
  onOpenStudyPermissions?: () => void;
  onTabChange?: (tab: any) => void;
  onRoomUpdated?: (updated: Partial<Room>) => void;
};

export function RoomMoreView({
  room,
  members,
  currentUserId,
  isOwner,
  isAdmin,
  isTeacher,
  role,
  canManageMembers,
  canManageRoles,
  canModerate,
  canStartLive,
  canAnnounce,
  canPin,
  onPromoteRole,
  onRemoveMember,
  onLeaveRoom,
  onOpenPinnedHub,
  onOpenModerationCenter,
  onOpenAnalytics,
  onOpenSettings,
  onOpenMonitoringCenter,
  onOpenKnockRequests,
  onOpenStudyPermissions,
  onTabChange,
  onRoomUpdated,
}: RoomMoreViewProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  // Strict role-based capability boundaries
  const isUserAdmin = Boolean(isOwner || role === "owner" || role === "admin");
  const isUserTeacher = Boolean(isTeacher || role === "teacher");
  const canAccessAdminHub = Boolean(isUserAdmin);
  const canAccessTeacherHub = Boolean(isUserAdmin || isUserTeacher);
  const isActualTeacher = Boolean(!isUserAdmin && isUserTeacher);

  // Dynamic role filter tabs: Only show tabs the user is authorized to see
  const availableRoleTabs = useMemo(() => {
    if (canAccessAdminHub) {
      return [
        { key: "all" as const, label: "🌟 All Hubs" },
        { key: "admin" as const, label: "👑 Admin" },
        { key: "teacher" as const, label: "🎓 Teacher" },
        { key: "member" as const, label: "🎒 Member" },
      ];
    }
    if (canAccessTeacherHub) {
      return [
        { key: "teacher" as const, label: "🎓 Teacher Hub" },
        { key: "member" as const, label: "🎒 Member Hub" },
      ];
    }
    // Standard member / student has no need for tabs — they only have the member tools!
    return [];
  }, [canAccessAdminHub, canAccessTeacherHub]);

  // Initial and reactive activeRoleFilter
  const initialFilter: RoleFilter = canAccessAdminHub
    ? "all"
    : canAccessTeacherHub
      ? "teacher"
      : "member";
  const [activeRoleFilter, setActiveRoleFilter] = useState<RoleFilter>(initialFilter);

  useEffect(() => {
    if (!canAccessAdminHub && activeRoleFilter === "admin") {
      setActiveRoleFilter(canAccessTeacherHub ? "teacher" : "member");
    } else if (!canAccessTeacherHub && (activeRoleFilter === "teacher" || activeRoleFilter === "all")) {
      setActiveRoleFilter("member");
    }
  }, [canAccessAdminHub, canAccessTeacherHub, activeRoleFilter]);

  // Role management staff modal
  const [roleManagementModalOpen, setRoleManagementModalOpen] = useState(false);

  // Member search & filter
  const [searchMember, setSearchMember] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState<"all" | "online" | "leaders">("all");

  // Real mute state read from conversation_members.muted_until
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

  // Report room mutation
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

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search text filter
      const q = searchMember.toLowerCase().trim();
      if (q) {
        const matchesName = m.full_name?.toLowerCase().includes(q);
        const matchesUser = m.username?.toLowerCase().includes(q);
        if (!matchesName && !matchesUser) return false;
      }
      // Quick filter
      if (memberRoleFilter === "online") return Boolean((m as any).is_online);
      if (memberRoleFilter === "leaders") return m.id === room.owner_id;
      return true;
    });
  }, [members, searchMember, memberRoleFilter, room.owner_id]);

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

    if (canAccessAdminHub && !isMe && Boolean(canManageRoles || canManageMembers || isOwner) && onPromoteRole) {
      options.push({
        text: "Manage Member Role (Faculty Center)",
        onPress: () => {
          setRoleManagementModalOpen(true);
        },
      });
    }

    if (Boolean(canManageMembers || isOwner) && !isMe && onRemoveMember) {
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

    Alert.alert(member.full_name || `@${member.username}`, `@${member.username}`, options);
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. HERO IDENTITY CARD                                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={[s.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <View style={[s.topicPill, { backgroundColor: `${colors.primary}1A` }]}>
                <Text style={[s.topicText, { color: colors.primary }]}>{room.topic}</Text>
              </View>
              <View style={[s.modePill, { backgroundColor: colors.surface2 }]}>
                <Text style={[s.modeText, { color: colors.text }]}>{room.mode.toUpperCase()}</Text>
              </View>
            </Row>

            <Text style={[s.roomTitle, { color: colors.text }]} numberOfLines={2}>
              {room.title}
            </Text>

            <Text style={[s.roomDesc, { color: colors.muted }]} numberOfLines={3}>
              {room.description || `Academic learning and peer collaboration space for ${room.topic}.`}
            </Text>
          </View>

          {/* User's Role Badge */}
          <View
            style={[
              s.myRoleBadge,
              {
                backgroundColor: canAccessAdminHub ? "#F59E0B22" : isActualTeacher ? "#3B82F622" : "#10B98122",
                borderColor: canAccessAdminHub ? "#F59E0B" : isActualTeacher ? "#3B82F6" : "#10B981",
              },
            ]}
          >
            <Text
              style={[
                s.myRoleText,
                { color: canAccessAdminHub ? "#F59E0B" : isActualTeacher ? "#3B82F6" : "#10B981" },
              ]}
            >
              {canAccessAdminHub ? "👑 ADMIN" : isActualTeacher ? "🎓 TEACHER" : "🎒 MEMBER"}
            </Text>
          </View>
        </Row>

        <View style={[s.divider, { backgroundColor: colors.divider }]} />

        {/* Hero Quick Toolbar */}
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 10 }}>
            {/* Real Mute Switch */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                toggleMute.mutate(!isMuted);
              }}
              style={[
                s.iconActionBtn,
                {
                  backgroundColor: isMuted ? "#EF44441A" : colors.surface2,
                  borderColor: isMuted ? "#EF4444" : colors.divider,
                },
              ]}
            >
              {toggleMute.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons
                    name={isMuted ? "bell-off-outline" : "bell-outline"}
                    size={16}
                    color={isMuted ? "#EF4444" : colors.text}
                  />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: isMuted ? "#EF4444" : colors.text }}>
                    {isMuted ? "Muted" : "Active"}
                  </Text>
                </Row>
              )}
            </Pressable>

            {/* Pinned Content quick link */}
            {onOpenPinnedHub && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  onOpenPinnedHub();
                }}
                style={[s.iconActionBtn, { backgroundColor: colors.surface2, borderColor: colors.divider }]}
              >
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="pin-outline" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>Pinned Hub</Text>
                </Row>
              </Pressable>
            )}
          </Row>

          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>
            {members.length} member{members.length !== 1 ? "s" : ""}
          </Text>
        </Row>
      </View>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. ROLE FILTER TABS (ONLY SHOWN IF USER HAS MULTIPLE HUBS)         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {availableRoleTabs.length > 1 && (
        <View style={s.filterRow}>
          {availableRoleTabs.map((tab) => {
            const isActive = activeRoleFilter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  triggerHaptic();
                  setActiveRoleFilter(tab.key);
                }}
                style={[
                  s.roleTabBtn,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.roleTabText,
                    { color: isActive ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. DEDICATED ROLE HUBS (STRICT ROLE-BASED ACCESS CONTROL)           */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* ADMIN HUB — STRICTLY Admin / Owner only */}
      {canAccessAdminHub && (activeRoleFilter === "all" || activeRoleFilter === "admin") && (
        <RoomAdminHub
          room={room}
          members={members}
          currentUserId={currentUserId}
          isOwner={isOwner}
          canManageMembers={Boolean(canManageMembers || canManageRoles || isOwner)}
          canModerate={Boolean(canModerate || isOwner)}
          canAnnounce={Boolean(canAnnounce || isOwner)}
          onOpenRoleManagement={() => setRoleManagementModalOpen(true)}
          onOpenPinnedHub={onOpenPinnedHub}
          onOpenModerationCenter={onOpenModerationCenter}
          onOpenAnalytics={onOpenAnalytics}
          onOpenSettings={onOpenSettings}
          onOpenKnockRequests={onOpenKnockRequests}
          onOpenStudyPermissions={onOpenStudyPermissions}
          onOpenMonitoringCenter={onOpenMonitoringCenter}
          onRoomUpdated={onRoomUpdated}
        />
      )}

      {/* TEACHER HUB — STRICTLY Teacher, Admin, or Owner only */}
      {canAccessTeacherHub && (activeRoleFilter === "all" || activeRoleFilter === "teacher") && (
        <RoomTeacherHub
          room={room}
          members={members}
          currentUserId={currentUserId}
          isOwner={isOwner}
          isTeacher={Boolean(isTeacher || role === "teacher" || canAccessAdminHub)}
          canStartLive={canStartLive}
          onOpenPinnedHub={onOpenPinnedHub}
          onTabChange={onTabChange}
        />
      )}

      {/* MEMBER HUB — Shown when selected, or for everyone if standard student */}
      {(activeRoleFilter === "all" || activeRoleFilter === "member" || (!canAccessAdminHub && !canAccessTeacherHub)) && (
        <RoomMemberHub
          room={room}
          members={members}
          currentUserId={currentUserId}
          onOpenPinnedHub={onOpenPinnedHub}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. MEMBERS DIRECTORY                                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={s.sectionBlock}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.text }]}>
              MEMBERS DIRECTORY ({members.length})
            </Text>
          </Row>

          {canAccessAdminHub && Boolean(canManageRoles || canManageMembers || isOwner) && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setRoleManagementModalOpen(true);
              }}
              style={[s.manageRolesBtn, { backgroundColor: `${colors.primary}1A`, borderColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="shield-account" size={14} color={colors.primary} />
              <Text style={[s.manageRolesBtnText, { color: colors.primary }]}>Manage Roles</Text>
            </Pressable>
          )}
        </Row>

        {/* Member Search Field */}
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            value={searchMember}
            onChangeText={setSearchMember}
            placeholder="Search by name, handle..."
            placeholderTextColor={colors.muted}
            style={[s.searchInput, { color: colors.text }]}
          />
          {searchMember ? (
            <Pressable onPress={() => setSearchMember("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Quick Filter Chips */}
        <Row style={{ gap: 8 }}>
          {(
            [
              { key: "all", label: `All (${members.length})` },
              { key: "online", label: "Online Now" },
              { key: "leaders", label: "Room Owner" },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => {
                triggerHaptic();
                setMemberRoleFilter(f.key);
              }}
              style={[
                s.filterChip,
                {
                  backgroundColor: memberRoleFilter === f.key ? `${colors.primary}22` : colors.surface,
                  borderColor: memberRoleFilter === f.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: memberRoleFilter === f.key ? colors.primary : colors.muted,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </Row>

        {/* Members List */}
        <View style={[s.membersList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {filteredMembers.slice(0, 50).map((member, idx) => {
            const isLast = idx === Math.min(filteredMembers.length, 50) - 1;
            const isMemberOwner = member.id === room.owner_id;
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
                <View style={{ position: "relative" }}>
                  <View style={[s.memberAvatar, { backgroundColor: `${colors.primary}1A` }]}>
                    <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>
                      {(member.full_name || member.username || "U")[0].toUpperCase()}
                    </Text>
                  </View>
                  <ActiveDot
                    userId={member.id}
                    size={11}
                    style={{ position: "absolute", bottom: -1, right: -1 }}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ alignItems: "center", gap: 6 }}>
                    <Text style={[s.memberName, { color: colors.text }]} numberOfLines={1}>
                      {member.full_name || `@${member.username}`}
                    </Text>
                    {isMemberOwner && (
                      <View style={[s.roleBadge, { backgroundColor: "#F59E0B22" }]}>
                        <Text style={[s.roleBadgeText, { color: "#F59E0B" }]}>OWNER</Text>
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

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. SAFETY & ACTIONS ZONE                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={s.sectionBlock}>
        <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM ACTIONS & INTEGRITY</Text>
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

    {/* WORLD-CLASS ROLE MANAGEMENT & STAFF MODAL */}
    <RoomRoleManagementModal
      visible={roleManagementModalOpen}
      room={room}
      members={members}
      currentUserId={currentUserId}
      isOwner={isOwner}
      canManageRoles={isUserAdmin}
      userRole={role}
      onClose={() => setRoleManagementModalOpen(false)}
      onPromoteRole={onPromoteRole}
      onRemoveMember={onRemoveMember}
      onOwnershipTransferred={(newOwnerId) => {
        onRoomUpdated?.({ owner_id: newOwnerId });
        qc.invalidateQueries({ queryKey: ["room", room.id] });
        qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
        qc.invalidateQueries({ queryKey: ["room-teachers", room.id] });
        qc.invalidateQueries({ queryKey: ["room-members", room.id] });
      }}
    />
    </>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  topicText: {
    fontSize: 11,
    fontWeight: "800",
  },
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  roomDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  myRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  myRoleText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
  },
  iconActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTabText: {
    fontSize: 11,
    fontWeight: "800",
  },
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  infoCard: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  manageRolesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  manageRolesBtnText: {
    fontSize: 11,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  actionRowText: {
    fontSize: 13,
  },
});
