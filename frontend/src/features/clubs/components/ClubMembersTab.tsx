import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubMember, ClubRole } from "../types";
import { CLUB_ROLES } from "../constants";
import api from "../../../services/api";

interface ClubMembersTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  members: ClubMember[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ClubMembersTab: React.FC<ClubMembersTabProps> = ({
  clubId,
  myRole,
  members,
  isLoading,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const router = useRouter();

  const isLeader =
    myRole &&
    ["owner", "admin", "president", "vice_president"].includes(myRole);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<ClubRole | "all">("all");

  // Manage Role Modal
  const [editingMember, setEditingMember] = useState<ClubMember | null>(null);
  const [targetRole, setTargetRole] = useState<ClubRole>("member");
  const [targetTitle, setTargetTitle] = useState("");
  const [updating, setUpdating] = useState(false);

  // Group into Leadership vs General
  const leadershipRoles: ClubRole[] = [
    "owner",
    "admin",
    "president",
    "vice_president",
    "secretary",
    "treasurer",
    "executive",
    "team_lead",
  ];

  const leaders = members.filter((m) => leadershipRoles.includes(m.role));
  const generalMembers = members.filter((m) => !leadershipRoles.includes(m.role));

  const filteredMembers = members.filter((m) => {
    const nameMatch =
      !searchQuery.trim() ||
      m.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.profiles?.department?.toLowerCase().includes(searchQuery.toLowerCase());
    const roleMatch = selectedRole === "all" || m.role === selectedRole;
    return nameMatch && roleMatch;
  });

  const handleUpdateRole = async () => {
    if (!editingMember) return;
    try {
      setUpdating(true);
      await api.patch(`/clubs/${clubId}/members/${editingMember.user_id}`, {
        role: targetRole,
        title: targetTitle.trim() || undefined,
      });
      Alert.alert("Success", "Member role updated.");
      setEditingMember(null);
      onRefresh();
    } catch (err: any) {
      Alert.alert(
        "Update Failed",
        err?.response?.data?.message || "Could not update member role."
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveMember = (member: ClubMember) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member.profiles?.full_name || "this member"} from the club?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/clubs/${clubId}/members/${member.user_id}`);
              Alert.alert("Removed", "Member removed from the club.");
              onRefresh();
            } catch (err: any) {
              Alert.alert("Error", "Could not remove member.");
            }
          },
        },
      ]
    );
  };

  const getRoleLabel = (role: ClubRole, customTitle?: string | null) => {
    if (customTitle) return customTitle;
    const found = CLUB_ROLES.find((r: { id: ClubRole; label: string }) => r.id === role);
    return found ? found.label : role;
  };

  const getRoleBadgeColor = (role: ClubRole) => {
    switch (role) {
      case "owner":
      case "president":
        return "#f59e0b";
      case "admin":
      case "vice_president":
        return "#3b82f6";
      case "secretary":
      case "treasurer":
      case "executive":
        return "#8b5cf6";
      case "team_lead":
        return "#10b981";
      case "moderator":
        return "#ec4899";
      default:
        return "#6b7280";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search & Filter Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search members by name or department..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>
            Loading member directory...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={() => (
            <>
              {/* Leadership Spotlight (shown when not searching) */}
              {!searchQuery.trim() && leaders.length > 0 && (
                <View style={styles.leadershipSection}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="shield-checkmark" size={18} color="#f59e0b" />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      Club Leadership ({leaders.length})
                    </Text>
                  </View>

                  <View style={styles.leadersGrid}>
                    {leaders.map((leader) => {
                      const color = getRoleBadgeColor(leader.role);
                      return (
                        <TouchableOpacity
                          key={leader.user_id}
                          style={[
                            styles.leaderCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => {
                            if (leader.profiles?.username) {
                              router.push(`/profile/${leader.profiles.username}` as any);
                            }
                          }}
                        >
                          {leader.profiles?.avatar_url ? (
                            <Image
                              source={{ uri: leader.profiles.avatar_url }}
                              style={styles.leaderAvatar}
                            />
                          ) : (
                            <View
                              style={[
                                styles.leaderAvatar,
                                styles.avatarPlaceholder,
                                { backgroundColor: `${color}20` },
                              ]}
                            >
                              <Text style={[styles.avatarInitial, { color }]}>
                                {leader.profiles?.full_name?.charAt(0) || "U"}
                              </Text>
                            </View>
                          )}

                          <Text
                            style={[styles.leaderName, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {leader.profiles?.full_name || "Member"}
                          </Text>

                          <View
                            style={[
                              styles.roleBadge,
                              { backgroundColor: `${color}18` },
                            ]}
                          >
                            <Text style={[styles.roleBadgeText, { color }]}>
                              {getRoleLabel(leader.role, leader.title)}
                            </Text>
                          </View>

                          {leader.profiles?.department && (
                            <Text
                              style={[
                                styles.leaderDept,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {leader.profiles.department}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Members Count Header */}
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <Ionicons name="people" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  All Members ({filteredMembers.length})
                </Text>
              </View>
            </>
          )}
          renderItem={({ item }) => {
            const color = getRoleBadgeColor(item.role);
            return (
              <TouchableOpacity
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  if (item.profiles?.username) {
                    router.push(`/profile/${item.profiles.username}` as any);
                  }
                }}
              >
                {item.profiles?.avatar_url ? (
                  <Image
                    source={{ uri: item.profiles.avatar_url }}
                    style={styles.memberAvatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.memberAvatar,
                      styles.avatarPlaceholder,
                      { backgroundColor: "rgba(150, 150, 150, 0.12)" },
                    ]}
                  >
                    <Text
                      style={[styles.avatarInitial, { color: colors.primary }]}
                    >
                      {item.profiles?.full_name?.charAt(0) || "U"}
                    </Text>
                  </View>
                )}

                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {item.profiles?.full_name || "Club Member"}
                    </Text>
                    <View
                      style={[
                        styles.inlineRoleBadge,
                        { backgroundColor: `${color}18` },
                      ]}
                    >
                      <Text style={[styles.inlineRoleText, { color }]}>
                        {getRoleLabel(item.role, item.title)}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[styles.memberSub, { color: colors.textSecondary }]}
                  >
                    @{item.profiles?.username || "student"}
                    {item.profiles?.department
                      ? ` · ${item.profiles.department}`
                      : ""}
                  </Text>
                </View>

                {/* Leader Actions */}
                {isLeader && item.role !== "owner" && (
                  <View style={styles.actionCluster}>
                    <TouchableOpacity
                      style={[
                        styles.iconActionBtn,
                        { backgroundColor: "rgba(150, 150, 150, 0.12)" },
                      ]}
                      onPress={() => {
                        setEditingMember(item);
                        setTargetRole(item.role);
                        setTargetTitle(item.title || "");
                      }}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={colors.text}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.iconActionBtn,
                        { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                      ]}
                      onPress={() => handleRemoveMember(item)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Edit Role Modal */}
      <Modal
        visible={!!editingMember}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMember(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Assign Role & Title
              </Text>
              <TouchableOpacity onPress={() => setEditingMember(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalMemberName, { color: colors.primary }]}>
              {editingMember?.profiles?.full_name}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Select Role:
            </Text>
            <View style={styles.rolePickerGrid}>
              {CLUB_ROLES.filter((r: { id: ClubRole; label: string }) => r.id !== "owner").map((r: { id: ClubRole; label: string }) => (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.roleChoiceBtn,
                    targetRole === r.id && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                    { borderColor: colors.border },
                  ]}
                  onPress={() => setTargetRole(r.id)}
                >
                  <Text
                    style={[
                      styles.roleChoiceText,
                      { color: targetRole === r.id ? "#fff" : colors.text },
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Custom Title / Designation (optional):
            </Text>
            <TextInput
              style={[
                styles.titleInput,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.background,
                },
              ]}
              placeholder="e.g. Lead Roboticist or Event Coordinator"
              placeholderTextColor={colors.textSecondary}
              value={targetTitle}
              onChangeText={setTargetTitle}
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleUpdateRole}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Role</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(150, 150, 150, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: "center",
  },
  leadershipSection: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  leadersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  leaderCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  leaderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: "700",
  },
  leaderName: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  leaderDept: {
    fontSize: 11,
    textAlign: "center",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
  },
  inlineRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inlineRoleText: {
    fontSize: 10,
    fontWeight: "700",
  },
  memberSub: {
    fontSize: 12,
    marginTop: 2,
  },
  actionCluster: {
    flexDirection: "row",
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalMemberName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 6,
  },
  rolePickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  roleChoiceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleChoiceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
