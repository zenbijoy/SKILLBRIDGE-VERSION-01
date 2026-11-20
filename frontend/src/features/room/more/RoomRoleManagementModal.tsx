import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Profile, Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { ActiveDot } from "@/features/presence/ActiveDot";
import {
  ROLE_CONFIGS,
  PERMISSIONS_MATRIX_LIST,
  canActorManageTargetRole,
  getAssignableRolesForActor,
} from "../roles/roleConfig";
import type { RoleTier } from "../roles/roleConfig";

export type { RoleTier };

type MemberWithRole = Profile & { role?: string; is_online?: boolean };

type RoomRoleManagementModalProps = {
  visible: boolean;
  room: Room;
  members: MemberWithRole[];
  currentUserId?: string;
  isOwner?: boolean;
  canManageRoles?: boolean;
  userRole?: string | null;
  onClose: () => void;
  onPromoteRole?: (memberId: string, newRole: RoleTier) => void;
  onRemoveMember?: (memberId: string) => void;
  onOwnershipTransferred?: (newOwnerId: string) => void;
};

export function RoomRoleManagementModal({
  visible,
  room,
  members,
  currentUserId,
  isOwner = false,
  canManageRoles = false,
  userRole = "member",
  onClose,
  onPromoteRole,
  onRemoveMember,
  onOwnershipTransferred,
}: RoomRoleManagementModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"staff" | "students" | "matrix">("staff");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberWithRole | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<RoleTier>("member");

  // Determine which roles this user is permitted to assign
  const assignableRoles = useMemo(() => {
    return getAssignableRolesForActor(userRole, isOwner);
  }, [userRole, isOwner]);

  // Transfer room ownership mutation (Owner only)
  const transferOwnershipMutation = useMutation({
    mutationFn: (newOwnerId: string) =>
      api<{ success: boolean; newOwnerId: string }>(`/rooms/${room.id}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ newOwnerId }),
      }),
    onSuccess: (_, newOwnerId) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
      qc.invalidateQueries({ queryKey: ["room-teachers", room.id] });
      onOwnershipTransferred?.(newOwnerId);
      setSelectedMember(null);
      Alert.alert(
        "Room Sovereignty Transferred! 👑",
        "The room ownership has been successfully assigned. You are now a designated Room Admin.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Transfer Failed", err.message);
    },
  });

  // Promote / demote role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: RoleTier }) =>
      api<{ success: boolean; role: string }>(`/rooms/${room.id}/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_, vars) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
      qc.invalidateQueries({ queryKey: ["room-teachers", room.id] });
      onPromoteRole?.(vars.memberId, vars.role);
      setSelectedMember(null);
      Alert.alert(
        "Role Updated! 🎉",
        `Successfully appointed to: ${ROLE_CONFIGS[vars.role].name}`,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Role Update Failed", err.message);
    },
  });

  const getMemberEffectiveRole = (m: MemberWithRole): RoleTier => {
    if (m.id === room.owner_id) return "owner";
    const rawRole = (m.role || "member").toLowerCase() as RoleTier;
    return ROLE_CONFIGS[rawRole] ? rawRole : "member";
  };

  // Staff and student breakdown stats
  const stats = useMemo(() => {
    let teachersCount = 0;
    let adminsCount = 0;
    let studentsCount = 0;
    let onlineCount = 0;

    members.forEach((m) => {
      if (m.is_online) onlineCount += 1;
      const effRole = getMemberEffectiveRole(m);
      if (effRole === "owner" || effRole === "admin") adminsCount += 1;
      if (effRole === "teacher") teachersCount += 1;
      if (effRole === "member" || effRole === "guest") studentsCount += 1;
    });

    return {
      teachersCount: Math.max(1, teachersCount),
      adminsCount: Math.max(1, adminsCount),
      studentsCount,
      onlineCount,
      totalCount: members.length,
    };
  }, [members, room.owner_id]);

  // Filtered members list
  const filteredList = useMemo(() => {
    return members.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesName = m.full_name?.toLowerCase().includes(q);
        const matchesUser = m.username?.toLowerCase().includes(q);
        if (!matchesName && !matchesUser) return false;
      }
      const effRole = getMemberEffectiveRole(m);
      if (activeTab === "staff") {
        return effRole === "owner" || effRole === "admin" || effRole === "teacher" || effRole === "moderator";
      }
      if (activeTab === "students") {
        return effRole === "member" || effRole === "guest";
      }
      return true;
    });
  }, [members, searchQuery, activeTab, room.owner_id]);

  const handleOpenMemberEditor = (m: MemberWithRole) => {
    triggerHaptic();
    const effRole = getMemberEffectiveRole(m);
    setSelectedMember(m);
    setSelectedNewRole(effRole === "owner" ? "admin" : effRole);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* MODAL APP BAR */}
        <Row style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            hitSlop={10}
            style={s.backBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>

          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="shield-crown" size={20} color="#F59E0B" />
              <Text style={[s.headerTitle, { color: colors.text }]}>Room Roles & Faculty Center</Text>
            </Row>
            <Text style={[s.headerSub, { color: colors.muted }]} numberOfLines={1}>
              {room.title} · Staff & Role-Based Access Control
            </Text>
          </View>

          <View style={{ width: 28 }} />
        </Row>

        {/* 4-METRICS STATS STRIP */}
        <Row style={[s.statsStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={s.statCol}>
            <Text style={[s.statNum, { color: "#3B82F6" }]}>{stats.teachersCount}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Instructors</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <View style={s.statCol}>
            <Text style={[s.statNum, { color: "#6366F1" }]}>{stats.adminsCount}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Admins & Lead</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <View style={s.statCol}>
            <Text style={[s.statNum, { color: "#10B981" }]}>{stats.totalCount}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Enrolled</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.divider }]} />
          <View style={s.statCol}>
            <Text style={[s.statNum, { color: colors.primary }]}>{stats.onlineCount}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Active Now</Text>
          </View>
        </Row>

        {/* CATEGORY TABS */}
        <Row style={[s.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {(
            [
              { key: "staff", label: `Faculty & Staff (${stats.teachersCount + stats.adminsCount})` },
              { key: "students", label: `Students (${stats.studentsCount})` },
              { key: "matrix", label: "Permissions Matrix" },
            ] as const
          ).map((t) => {
            const isActive = activeTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  triggerHaptic();
                  setActiveTab(t.key);
                }}
                style={[
                  s.tabBtn,
                  { borderBottomColor: isActive ? colors.primary : "transparent" },
                ]}
              >
                <Text
                  style={[
                    s.tabBtnText,
                    {
                      color: isActive ? colors.primary : colors.muted,
                      fontWeight: isActive ? "800" : "600",
                    },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        {/* TAB 1 & 2: STAFF & STUDENTS DIRECTORY */}
        {activeTab !== "matrix" ? (
          <View style={{ flex: 1 }}>
            {/* Search Box */}
            <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search member by name or username..."
                placeholderTextColor={colors.muted}
                style={[s.searchInput, { color: colors.text }]}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={filteredList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
              ListEmptyComponent={
                <View style={[s.emptyState, { borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="account-search-outline" size={36} color={colors.muted} />
                  <Text style={[s.emptyText, { color: colors.text }]}>No members match your search</Text>
                  <Text style={[s.emptySub, { color: colors.muted }]}>
                    Try searching with another name or filter tab.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const effRole = getMemberEffectiveRole(item);
                const roleDef = ROLE_CONFIGS[effRole];
                const isMe = item.id === currentUserId;
                const manageCheck = canActorManageTargetRole(userRole, isOwner, effRole);
                const canEditThisMember = (isOwner || canManageRoles) && manageCheck.allowed && !isMe;

                return (
                  <Pressable
                    onPress={() => canEditThisMember && handleOpenMemberEditor(item)}
                    disabled={!canEditThisMember}
                    style={({ pressed }) => [
                      s.memberCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        opacity: pressed && canEditThisMember ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={{ position: "relative" }}>
                      <View style={[s.memberAvatar, { backgroundColor: roleDef.bgColor }]}>
                        <MaterialCommunityIcons name={roleDef.icon} size={18} color={roleDef.color} />
                      </View>
                      <ActiveDot
                        userId={item.id}
                        size={11}
                        style={{ position: "absolute", bottom: -1, right: -1 }}
                      />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <Text style={[s.memberName, { color: colors.text }]} numberOfLines={1}>
                          {item.full_name || `@${item.username}`}
                        </Text>
                        {isMe && (
                          <View style={[s.youBadge, { backgroundColor: `${colors.primary}1A` }]}>
                            <Text style={{ fontSize: 9, fontWeight: "900", color: colors.primary }}>YOU</Text>
                          </View>
                        )}
                      </Row>

                      <Text style={[s.memberHandle, { color: colors.muted }]} numberOfLines={1}>
                        @{item.username}{item.department ? ` · ${item.department}` : ""}
                      </Text>
                    </View>

                    {/* Role Pill */}
                    <View style={[s.roleBadgePill, { backgroundColor: roleDef.bgColor }]}>
                      <MaterialCommunityIcons name={roleDef.icon} size={12} color={roleDef.color} />
                      <Text style={[s.roleBadgePillText, { color: roleDef.color }]}>
                        {roleDef.badgeLabel}
                      </Text>
                    </View>

                    {canEditThisMember && (
                      <MaterialCommunityIcons name="account-edit-outline" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        ) : (
          /* TAB 3: SERVER-ENFORCED PERMISSIONS MATRIX */
          <ScrollView contentContainerStyle={s.matrixScroll} showsVerticalScrollIndicator={false}>
            <Text style={[s.matrixHeading, { color: colors.muted }]}>
              SERVER-ENFORCED CAPABILITIES BY ROLE
            </Text>

            <View style={[s.matrixCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {PERMISSIONS_MATRIX_LIST.map((perm, idx) => {
                const isLast = idx === PERMISSIONS_MATRIX_LIST.length - 1;
                return (
                  <View
                    key={perm.key}
                    style={[
                      s.permRow,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                    ]}
                  >
                    <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={[s.permIcon, { backgroundColor: `${colors.primary}1A` }]}>
                        <MaterialCommunityIcons name={perm.icon} size={16} color={colors.primary} />
                      </View>
                      <Text style={[s.permTitle, { color: colors.text }]}>{perm.title}</Text>
                    </Row>

                    <Row style={{ gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "48%" }}>
                      {perm.roles.map((r) => {
                        const rDef = ROLE_CONFIGS[r];
                        return (
                          <View key={r} style={[s.miniRoleTag, { backgroundColor: rDef.bgColor }]}>
                            <Text style={[s.miniRoleTagText, { color: rDef.color }]}>
                              {rDef.badgeLabel}
                            </Text>
                          </View>
                        );
                      })}
                    </Row>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* ROLE ASSIGNMENT & MEMBER MANAGEMENT MODAL SHEET                   */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <Modal
          visible={Boolean(selectedMember)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMember(null)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="account-cog-outline" size={22} color={colors.primary} />
                  <Text style={[s.modalTitle, { color: colors.text }]}>Appoint or Change Role</Text>
                </Row>
                <Pressable
                  onPress={() => setSelectedMember(null)}
                  hitSlop={8}
                  style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
                >
                  <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                </Pressable>
              </Row>

              {selectedMember && (
                <Row style={[s.candidateBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <View style={[s.memberAvatar, { backgroundColor: `${colors.primary}20` }]}>
                    <Text style={{ fontSize: 13, fontWeight: "900", color: colors.primary }}>
                      {(selectedMember.full_name || selectedMember.username || "U")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.memberName, { color: colors.text }]}>{selectedMember.full_name}</Text>
                    <Text style={[s.memberHandle, { color: colors.muted }]}>@{selectedMember.username}</Text>
                  </View>
                  <View
                    style={[
                      s.roleBadgePill,
                      { backgroundColor: ROLE_CONFIGS[getMemberEffectiveRole(selectedMember)].bgColor },
                    ]}
                  >
                    <Text
                      style={[
                        s.roleBadgePillText,
                        { color: ROLE_CONFIGS[getMemberEffectiveRole(selectedMember)].color },
                      ]}
                    >
                      {ROLE_CONFIGS[getMemberEffectiveRole(selectedMember)].badgeLabel}
                    </Text>
                  </View>
                </Row>
              )}

              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.muted }}>
                SELECT NEW ROLE TO APPOINT
              </Text>

              {/* ROLE TIERS PICKER */}
              <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
                {assignableRoles.map((tierKey) => {
                  const tDef = ROLE_CONFIGS[tierKey];
                  const isSelected = selectedNewRole === tierKey;
                  return (
                    <Pressable
                      key={tierKey}
                      onPress={() => {
                        triggerHaptic();
                        setSelectedNewRole(tierKey);
                      }}
                      style={[
                        s.roleRadioCard,
                        {
                          backgroundColor: isSelected ? `${tDef.color}15` : colors.background,
                          borderColor: isSelected ? tDef.color : colors.border,
                        },
                      ]}
                    >
                      <Row style={{ alignItems: "center", gap: 10 }}>
                        <View style={[s.radioIcon, { backgroundColor: tDef.bgColor }]}>
                          <MaterialCommunityIcons name={tDef.icon} size={18} color={tDef.color} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Row style={{ alignItems: "center", gap: 6 }}>
                            <Text style={[s.radioTitle, { color: colors.text }]}>{tDef.name}</Text>
                            <View style={[s.miniRoleTag, { backgroundColor: tDef.bgColor }]}>
                              <Text style={[s.miniRoleTagText, { color: tDef.color }]}>{tDef.badgeLabel}</Text>
                            </View>
                          </Row>
                          <Text style={[s.radioSub, { color: colors.muted }]} numberOfLines={2}>
                            {tDef.desc}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                          size={20}
                          color={isSelected ? tDef.color : colors.muted}
                        />
                      </Row>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* OWNERSHIP TRANSFER BUTTON (EXCLUSIVELY FOR CURRENT SOVEREIGN OWNER) */}
              {isOwner && selectedMember && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    Alert.alert(
                      "Transfer Room Sovereignty",
                      `Are you sure you want to transfer sovereign Room Ownership to ${selectedMember.full_name}? You will step down to a Room Admin.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Transfer Ownership",
                          style: "destructive",
                          onPress: () => transferOwnershipMutation.mutate(selectedMember.id),
                        },
                      ],
                    );
                  }}
                  disabled={transferOwnershipMutation.isPending}
                  style={[s.transferBtn, { borderColor: "#F59E0B", backgroundColor: "rgba(245, 158, 11, 0.12)" }]}
                >
                  <MaterialCommunityIcons name="crown" size={16} color="#F59E0B" />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#F59E0B" }}>
                    Transfer Sovereignty to this Member
                  </Text>
                </Pressable>
              )}

              {/* ACTIONS: REMOVE, CANCEL & CONFIRM */}
              <Row style={{ gap: 8, marginTop: 6 }}>
                {onRemoveMember && selectedMember && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      Alert.alert(
                        "Remove Member",
                        `Remove ${selectedMember.full_name} from ${room.title}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => {
                              onRemoveMember(selectedMember.id);
                              setSelectedMember(null);
                            },
                          },
                        ],
                      );
                    }}
                    style={[s.modalBtn, { backgroundColor: "rgba(239, 68, 68, 0.12)", flex: 1 }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.danger }}>Remove</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => setSelectedMember(null)}
                  style={[s.modalBtn, { backgroundColor: colors.surface2, flex: 1 }]}
                >
                  <Text style={[s.modalBtnText, { color: colors.text }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (!selectedMember) return;
                    updateRoleMutation.mutate({
                      memberId: selectedMember.id,
                      role: selectedNewRole,
                    });
                  }}
                  disabled={updateRoleMutation.isPending}
                  style={[s.modalBtn, { backgroundColor: colors.primary, flex: 2 }]}
                >
                  {updateRoleMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[s.modalBtnText, { color: "#FFFFFF", fontWeight: "800" }]}>
                      Confirm Appointment
                    </Text>
                  )}
                </Pressable>
              </Row>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  headerSub: {
    fontSize: 11,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  statCol: {
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  statNum: {
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 2,
  },
  tabBtnText: {
    fontSize: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 12,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
  },
  memberHandle: {
    fontSize: 11,
  },
  youBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  roleBadgePillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  matrixScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  matrixHeading: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  matrixCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 10,
  },
  permIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  miniRoleTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  miniRoleTagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    maxHeight: "85%",
  },
  closeModalBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  candidateBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  roleRadioCard: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  radioTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  radioSub: {
    fontSize: 10,
  },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  modalBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  modalBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
