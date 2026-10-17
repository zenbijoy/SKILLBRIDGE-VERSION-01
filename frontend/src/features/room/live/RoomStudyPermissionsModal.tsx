import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  Switch,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";
import type { Profile } from "@/types";

interface StudyPermissionEntry {
  userId: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
}

interface RoomMemberWithRole extends Profile {
  role?: string;
}

export interface RoomStudyPermissionsModalProps {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}

export const RoomStudyPermissionsModal: React.FC<RoomStudyPermissionsModalProps> = ({
  visible,
  roomId,
  onClose,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Fetch room members
  const membersQuery = useQuery({
    queryKey: ["room-members", roomId],
    queryFn: () => api<{ members: RoomMemberWithRole[] }>(`/rooms/${roomId}/members`),
    enabled: visible && Boolean(roomId),
  });

  // Fetch current study permissions
  const permissionsQuery = useQuery({
    queryKey: ["room-study-permissions", roomId],
    queryFn: () => api<{ permissions: StudyPermissionEntry[] }>(`/rooms/${roomId}/study-permissions`),
    enabled: visible && Boolean(roomId),
  });

  // Grant mutation
  const grantMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/rooms/${roomId}/study-permissions/${userId}`, {
        method: "PUT",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      triggerHaptic();
      queryClient.invalidateQueries({ queryKey: ["room-study-permissions", roomId] });
      queryClient.invalidateQueries({ queryKey: ["room-live-status", roomId] });
    },
    onError: (err: any) => {
      Alert.alert("Permission Error", err.message || "Failed to grant study permission");
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/rooms/${roomId}/study-permissions/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      triggerHaptic();
      queryClient.invalidateQueries({ queryKey: ["room-study-permissions", roomId] });
      queryClient.invalidateQueries({ queryKey: ["room-live-status", roomId] });
    },
    onError: (err: any) => {
      Alert.alert("Permission Error", err.message || "Failed to revoke study permission");
    },
  });

  if (!visible) return null;

  const permissions = permissionsQuery.data?.permissions || [];
  const permittedUserIds = new Set(permissions.map((p) => p.userId));
  const members = membersQuery.data?.members || [];

  const filteredMembers = members.filter((m) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(query) ||
      m.username?.toLowerCase().includes(query)
    );
  });

  const handleToggle = (member: RoomMemberWithRole) => {
    const isCurrentlyPermitted = permittedUserIds.has(member.id);
    if (isCurrentlyPermitted) {
      revokeMutation.mutate(member.id);
    } else {
      grantMutation.mutate(member.id);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {t("live.studyPermissionsTitle")}
              </Text>
              <Text style={[styles.subTitle, { color: colors.muted }]}>
                {t("live.studyPermissionsSub")}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t("live.searchMembers")}
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {Boolean(search) && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Members List */}
          {membersQuery.isLoading || permissionsQuery.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    {t("live.noMembersFound")}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isPermitted = permittedUserIds.has(item.id);
                const isOwnerRole = item.role === "owner";

                return (
                  <View
                    style={[
                      styles.memberRow,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Avatar */}
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                        <Text style={styles.avatarInitial}>
                          {(item.full_name?.[0] || item.username?.[0] || "?").toUpperCase()}
                        </Text>
                      </View>
                    )}

                    {/* Member Info */}
                    <View style={styles.memberInfo}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                          {item.full_name || item.username}
                        </Text>
                        {item.role && (
                          <View
                            style={[
                              styles.roleBadge,
                              {
                                backgroundColor:
                                  item.role === "owner" ? colors.primary : colors.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleBadgeText,
                                {
                                  color: item.role === "owner" ? "#FFFFFF" : colors.muted,
                                },
                              ]}
                            >
                              {item.role.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.memberUsername, { color: colors.muted }]}>
                        @{item.username}
                      </Text>
                    </View>

                    {/* Permission Switch */}
                    {isOwnerRole ? (
                      <Text style={[styles.alwaysAllowedText, { color: colors.primary }]}>
                        Owner
                      </Text>
                    ) : (
                      <Switch
                        value={isPermitted}
                        onValueChange={() => handleToggle(item)}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 34,
    maxHeight: "82%",
    maxWidth: 680,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subTitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md || 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  listContent: {
    gap: 8,
    paddingBottom: 24,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyBox: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md || 10,
    borderWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  memberUsername: {
    fontSize: 12,
    marginTop: 2,
  },
  alwaysAllowedText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
