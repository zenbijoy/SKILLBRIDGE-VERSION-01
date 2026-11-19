import React, { useState, useMemo } from "react";
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
  Share,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubMember, ClubRole } from "../types";
import {
  CLUB_ROLES,
  ROLE_CONFIG,
  isClubAdmin,
  isClubLeader,
} from "../constants";
import { useI18n } from "../../../i18n";
import { clubErrorMessage } from "../lib/apiErrors";
import api from "../../../services/api";
import { triggerHaptic } from "../../../components/ui";
import { useSession } from "../../../hooks/useSession";

// High-resolution generated community artwork
const COMMUNITY_HERO_IMG = require("../../../../assets/clubs/members-community.jpg");
const EMPTY_STATE_IMG = require("../../../../assets/clubs/members-empty.jpg");

interface ClubMembersTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  members: ClubMember[];
  isLoading: boolean;
  onRefresh: () => void;
}

type FilterTab = "all" | "leadership" | "executives" | "leads" | "members";

// Role hierarchy rank for sorting leadership cards
const ROLE_PRIORITY: Record<ClubRole, number> = {
  owner: 1,
  president: 2,
  vice_president: 3,
  admin: 4,
  secretary: 5,
  treasurer: 6,
  executive: 7,
  team_lead: 8,
  moderator: 9,
  member: 10,
};

// Generative avatar palette based on member seed string
const AVATAR_PALETTES = [
  { bg: "#3B82F620", text: "#2563EB" },
  { bg: "#8B5CF620", text: "#7C3AED" },
  { bg: "#10B98120", text: "#059669" },
  { bg: "#F59E0B20", text: "#D97706" },
  { bg: "#EC489920", text: "#DB2777" },
  { bg: "#06B6D420", text: "#0891B2" },
  { bg: "#6366F120", text: "#4F46E5" },
  { bg: "#14B8A620", text: "#0D9488" },
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

export const ClubMembersTab: React.FC<ClubMembersTabProps> = ({
  clubId,
  myRole,
  members,
  isLoading,
  onRefresh,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useSession();
  const currentUserId = session?.user?.id;

  const isLeader = isClubAdmin(myRole);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("all");

  // Quick Action Sheet modal for a member
  const [actionMember, setActionMember] = useState<ClubMember | null>(null);
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);

  // Manage Role Modal
  const [editingMember, setEditingMember] = useState<ClubMember | null>(null);
  const [targetRole, setTargetRole] = useState<ClubRole>("member");
  const [targetTitle, setTargetTitle] = useState("");
  const [updating, setUpdating] = useState(false);

  // Categorize members
  const leaders = useMemo(() => {
    return members
      .filter((m) => isClubLeader(m.role))
      .sort((a, b) => (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99));
  }, [members]);

  const executives = useMemo(() => {
    return members.filter((m) =>
      ["owner", "president", "vice_president", "secretary", "treasurer", "executive"].includes(m.role)
    );
  }, [members]);

  const teamLeads = useMemo(() => {
    return members.filter((m) => ["team_lead", "moderator"].includes(m.role));
  }, [members]);

  const generalMembers = useMemo(() => {
    return members.filter((m) => m.role === "member");
  }, [members]);

  // Unique departments represented
  const departmentsCount = useMemo(() => {
    const depts = new Set<string>();
    members.forEach((m) => {
      if (m.profiles?.department?.trim()) {
        depts.add(m.profiles.department.trim().toLowerCase());
      }
    });
    return depts.size;
  }, [members]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return members.filter((m) => {
      // 1. Role / Tab category filter
      let matchesFilter = true;
      if (selectedFilter === "leadership") {
        matchesFilter = isClubLeader(m.role);
      } else if (selectedFilter === "executives") {
        matchesFilter = ["owner", "president", "vice_president", "secretary", "treasurer", "executive"].includes(m.role);
      } else if (selectedFilter === "leads") {
        matchesFilter = ["team_lead", "moderator"].includes(m.role);
      } else if (selectedFilter === "members") {
        matchesFilter = m.role === "member";
      }

      // 2. Search query filter
      const roleLabel = ROLE_CONFIG[m.role]?.label || "";
      const matchesSearch =
        !query ||
        (m.profiles?.full_name?.toLowerCase().includes(query) ?? false) ||
        (m.profiles?.username?.toLowerCase().includes(query) ?? false) ||
        (m.profiles?.department?.toLowerCase().includes(query) ?? false) ||
        (m.title?.toLowerCase().includes(query) ?? false) ||
        roleLabel.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [members, selectedFilter, searchQuery]);

  // Safe Profile Navigation (solves 404 router bug)
  const handleNavigateToProfile = (member: ClubMember) => {
    triggerHaptic();
    const targetId = member.profiles?.id || member.user_id;
    if (targetId) {
      router.push(`/user/${targetId}` as any);
    } else {
      Alert.alert(
        t("clubs.members.profileUnavailable", "Profile Unavailable"),
        t("clubs.members.profileMissingId", "Could not locate the requested user profile ID.")
      );
    }
  };

  // Direct 1-on-1 Chat Initiation
  const handleStartChat = async (member: ClubMember) => {
    triggerHaptic();
    const targetId = member.profiles?.id || member.user_id;
    if (!targetId) return;

    if (currentUserId && targetId === currentUserId) {
      Alert.alert("Direct Message", "You cannot start a direct message conversation with yourself.");
      return;
    }

    try {
      setStartingChatUserId(targetId);
      const res = await api.post("/chat/conversations", { participantId: targetId });
      const convId = res.data?.id || res.data?.conversation?.id;
      if (convId) {
        setActionMember(null);
        router.push(`/chat/${convId}` as any);
      } else {
        Alert.alert("Chat", "Conversation started. Please check your inbox messages.");
      }
    } catch (err: unknown) {
      Alert.alert(
        t("clubs.members.chatError", "Could not open chat"),
        clubErrorMessage(err, t)
      );
    } finally {
      setStartingChatUserId(null);
    }
  };

  // Mentorship / 1:1 Peer Session Booking
  const handleBookSession = (member: ClubMember) => {
    triggerHaptic();
    const targetId = member.profiles?.id || member.user_id;
    if (!targetId) return;

    if (currentUserId && targetId === currentUserId) {
      Alert.alert("Book Session", "You cannot schedule a mentorship session with yourself.");
      return;
    }

    setActionMember(null);
    router.push(`/booking/${targetId}` as any);
  };

  // Share Member Profile
  const handleShareProfile = async (member: ClubMember) => {
    triggerHaptic();
    const targetId = member.profiles?.id || member.user_id;
    const name = member.profiles?.full_name || member.profiles?.username || "SkillBridge Member";
    try {
      await Share.share({
        title: `${name} | SkillBridge`,
        message: `Connect with ${name} on SkillBridge: https://skillbridge.app/user/${targetId}`,
      });
    } catch {
      // Ignored if user dismissed share dialog
    }
  };

  // Role updating logic
  const handleUpdateRole = async () => {
    if (!editingMember) return;
    try {
      setUpdating(true);
      await api.patch(`/clubs/${clubId}/members/${editingMember.user_id}`, {
        role: targetRole,
        title: targetTitle.trim() || undefined,
      });
      triggerHaptic();
      Alert.alert(
        t("common.success", "Success"),
        t("clubs.members.roleUpdated", "Member role and title updated successfully.")
      );
      setEditingMember(null);
      onRefresh();
    } catch (err: unknown) {
      Alert.alert(
        t("common.error", "Update Failed"),
        clubErrorMessage(err, t)
      );
    } finally {
      setUpdating(false);
    }
  };

  // Remove member logic with destructive confirmation
  const handleRemoveMember = (member: ClubMember) => {
    triggerHaptic();
    const name = member.profiles?.full_name || "this member";
    Alert.alert(
      t("clubs.members.removeTitle", "Remove Member"),
      `Are you sure you want to remove ${name} from the club? They will lose access to member-only resources and workspaces.`,
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("common.remove", "Remove"),
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/clubs/${clubId}/members/${member.user_id}`);
              triggerHaptic();
              Alert.alert(
                t("common.removed", "Removed"),
                t("clubs.members.removedSuccess", "Member removed from the club.")
              );
              if (actionMember?.user_id === member.user_id) {
                setActionMember(null);
              }
              onRefresh();
            } catch (err: unknown) {
              Alert.alert(t("common.error", "Error"), clubErrorMessage(err, t));
            }
          },
        },
      ]
    );
  };

  // Role display details from ROLE_CONFIG
  const getRoleBadgeDetails = (role: ClubRole, customTitle?: string | null) => {
    const config = ROLE_CONFIG[role] || {
      label: role,
      color: "#6B7280",
      bgLight: "#F9FAFB",
      bgDark: "#111827",
      isLeadership: false,
    };

    return {
      label: customTitle?.trim() || config.label,
      color: config.color,
      bg: isDark ? config.bgDark : config.bgLight,
    };
  };

  // Distinct role icon
  const getRoleIconName = (role: ClubRole): keyof typeof Ionicons.glyphMap => {
    switch (role) {
      case "owner":
      case "president":
        return "ribbon";
      case "vice_president":
        return "star";
      case "admin":
        return "shield-checkmark";
      case "secretary":
        return "document-text";
      case "treasurer":
        return "wallet";
      case "executive":
        return "briefcase";
      case "team_lead":
        return "construct";
      case "moderator":
        return "shield-half";
      default:
        return "school";
    }
  };

  // Filter tab chips definition
  const filterTabs: Array<{ id: FilterTab; label: string; count: number; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: "all", label: "All", count: members.length, icon: "people" },
    { id: "leadership", label: "Leadership", count: leaders.length, icon: "shield-checkmark" },
    { id: "executives", label: "Officers", count: executives.length, icon: "ribbon" },
    { id: "leads", label: "Team Leads", count: teamLeads.length, icon: "construct" },
    { id: "members", label: "Members", count: generalMembers.length, icon: "school" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: isDark ? colors.surface : "#FFFFFF",
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name, role, handle, or department..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              triggerHaptic();
              setSearchQuery("");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filter Chips Bar */}
      <View style={styles.filterScrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsContainer}
        >
          {filterTabs.map((tab) => {
            const isSelected = selectedFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDark
                      ? colors.surface
                      : "#FFFFFF",
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic();
                  setSelectedFilter(tab.id);
                }}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isSelected ? "#FFFFFF" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? "#FFFFFF" : colors.text,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.filterCountBadge,
                    {
                      backgroundColor: isSelected
                        ? "rgba(255, 255, 255, 0.28)"
                        : isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(0, 0, 0, 0.06)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      { color: isSelected ? "#FFFFFF" : colors.textSecondary },
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Loading state indicator */}
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading club directory...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListHeaderComponent={() => (
            <>
              {/* Community Pulse Hero Card */}
              {!searchQuery.trim() && selectedFilter === "all" && (
                <View
                  style={[
                    styles.communityHeroCard,
                    {
                      backgroundColor: isDark ? colors.surface : "#FFFFFF",
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Image
                    source={COMMUNITY_HERO_IMG}
                    style={styles.communityHeroImage}
                    resizeMode="cover"
                  />
                  <View style={styles.communityHeroContent}>
                    <View style={styles.communityHeroBadge}>
                      <Ionicons name="sparkles" size={13} color="#2563EB" />
                      <Text style={styles.communityHeroBadgeText}>Verified Chapter</Text>
                    </View>
                    <Text style={[styles.communityHeroTitle, { color: colors.text }]}>
                      Club Members & Peer Network
                    </Text>
                    <Text style={[styles.communityHeroSub, { color: colors.textSecondary }]}>
                      Connect with students, find project mentors, and collaborate across departments.
                    </Text>

                    {/* Stats strip */}
                    <View style={[styles.statsStrip, { borderColor: colors.border }]}>
                      <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: colors.primary }]}>
                          {members.length}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                          Members
                        </Text>
                      </View>
                      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: "#F59E0B" }]}>
                          {leaders.length}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                          Leaders
                        </Text>
                      </View>
                      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: "#10B981" }]}>
                          {departmentsCount || 1}
                        </Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                          Depts
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* Leadership Spotlight Grid (shown on All/Leadership tabs without active search) */}
              {!searchQuery.trim() &&
                (selectedFilter === "all" || selectedFilter === "leadership" || selectedFilter === "executives") &&
                leaders.length > 0 && (
                  <View style={styles.leadershipSection}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="ribbon" size={20} color="#F59E0B" />
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        Executive Leadership ({leaders.length})
                      </Text>
                    </View>

                    <View style={styles.leadersGrid}>
                      {leaders.map((leader) => {
                        const badge = getRoleBadgeDetails(leader.role, leader.title);
                        const isSelf = currentUserId === leader.user_id;
                        const avatarPalette = getAvatarColor(
                          leader.profiles?.full_name || leader.profiles?.username || leader.user_id
                        );

                        return (
                          <TouchableOpacity
                            key={leader.user_id}
                            activeOpacity={0.85}
                            style={[
                              styles.leaderCard,
                              {
                                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                                borderColor: colors.border,
                              },
                            ]}
                            onPress={() => handleNavigateToProfile(leader)}
                          >
                            {/* Role Icon Ribbon */}
                            <View style={styles.leaderBadgeCorner}>
                              <Ionicons
                                name={getRoleIconName(leader.role)}
                                size={14}
                                color={badge.color}
                              />
                            </View>

                            {/* Avatar */}
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
                                  { backgroundColor: avatarPalette.bg },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.avatarInitial,
                                    { color: avatarPalette.text },
                                  ]}
                                >
                                  {leader.profiles?.full_name?.charAt(0).toUpperCase() ||
                                    leader.profiles?.username?.charAt(0).toUpperCase() ||
                                    "U"}
                                </Text>
                              </View>
                            )}

                            {/* Full Name & Self Badge */}
                            <View style={styles.nameContainer}>
                              <Text
                                style={[styles.leaderName, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {leader.profiles?.full_name || "Member"}
                              </Text>
                              {isSelf && (
                                <View style={styles.selfBadgePill}>
                                  <Text style={styles.selfBadgeText}>You</Text>
                                </View>
                              )}
                            </View>

                            {/* Role & Designation Badge */}
                            <View
                              style={[
                                styles.roleBadge,
                                { backgroundColor: badge.bg },
                              ]}
                            >
                              <Text
                                style={[styles.roleBadgeText, { color: badge.color }]}
                                numberOfLines={1}
                              >
                                {badge.label}
                              </Text>
                            </View>

                            {/* Department / Handle */}
                            <Text
                              style={[
                                styles.leaderDept,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {leader.profiles?.department || `@${leader.profiles?.username || "student"}`}
                            </Text>

                            {/* Quick Action Ribbon on Card */}
                            <View style={styles.leaderCardActionRow}>
                              {!isSelf && (
                                <TouchableOpacity
                                  style={[
                                    styles.leaderQuickBtn,
                                    { backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9" },
                                  ]}
                                  onPress={() => handleStartChat(leader)}
                                  disabled={startingChatUserId === leader.user_id}
                                >
                                  {startingChatUserId === leader.user_id ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                  ) : (
                                    <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                                  )}
                                </TouchableOpacity>
                              )}

                              <TouchableOpacity
                                style={[
                                  styles.leaderQuickBtn,
                                  { backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9" },
                                ]}
                                onPress={() => {
                                  triggerHaptic();
                                  setActionMember(leader);
                                }}
                              >
                                <Ionicons name="ellipsis-horizontal" size={14} color={colors.textSecondary} />
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

              {/* Directory Section Header */}
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Ionicons name="people" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {selectedFilter === "all"
                    ? `Member Directory (${filteredMembers.length})`
                    : `${filterTabs.find((f) => f.id === selectedFilter)?.label || "Filtered"} (${filteredMembers.length})`}
                </Text>
              </View>
            </>
          )}
          renderItem={({ item }) => {
            const badge = getRoleBadgeDetails(item.role, item.title);
            const isSelf = currentUserId === item.user_id;
            const avatarPalette = getAvatarColor(
              item.profiles?.full_name || item.profiles?.username || item.user_id
            );

            return (
              <TouchableOpacity
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => handleNavigateToProfile(item)}
              >
                {/* Member Avatar */}
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
                      { backgroundColor: avatarPalette.bg },
                    ]}
                  >
                    <Text style={[styles.avatarInitial, { color: avatarPalette.text }]}>
                      {item.profiles?.full_name?.charAt(0).toUpperCase() ||
                        item.profiles?.username?.charAt(0).toUpperCase() ||
                        "U"}
                    </Text>
                  </View>
                )}

                {/* Member Details */}
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.memberName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.profiles?.full_name || "Club Member"}
                    </Text>
                    {isSelf && (
                      <View style={styles.selfBadgePill}>
                        <Text style={styles.selfBadgeText}>You</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.inlineRoleBadge,
                        { backgroundColor: badge.bg },
                      ]}
                    >
                      <Ionicons
                        name={getRoleIconName(item.role)}
                        size={11}
                        color={badge.color}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.inlineRoleText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[styles.memberSub, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    @{item.profiles?.username || "student"}
                    {item.profiles?.department ? ` · ${item.profiles.department}` : ""}
                  </Text>
                </View>

                {/* Direct Action Cluster */}
                <View style={styles.actionCluster}>
                  {!isSelf && (
                    <TouchableOpacity
                      style={[
                        styles.iconActionBtn,
                        {
                          backgroundColor: isDark
                            ? "rgba(37, 99, 235, 0.15)"
                            : "rgba(37, 99, 235, 0.08)",
                        },
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleStartChat(item);
                      }}
                      disabled={startingChatUserId === item.user_id}
                    >
                      {startingChatUserId === item.user_id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={16}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Context options menu */}
                  <TouchableOpacity
                    style={[
                      styles.iconActionBtn,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.08)"
                          : "rgba(0, 0, 0, 0.04)",
                      },
                    ]}
                    onPress={(e) => {
                      e.stopPropagation();
                      triggerHaptic();
                      setActionMember(item);
                    }}
                  >
                    <Ionicons
                      name="ellipsis-vertical"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Image
                source={EMPTY_STATE_IMG}
                style={styles.emptyImage}
                resizeMode="contain"
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Members Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {searchQuery.trim()
                  ? `We couldn't find anyone matching "${searchQuery}". Try searching with another name, handle, or department.`
                  : "There are no members in this category yet."}
              </Text>
              {(searchQuery.trim().length > 0 || selectedFilter !== "all") && (
                <TouchableOpacity
                  style={[styles.resetSearchBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    triggerHaptic();
                    setSearchQuery("");
                    setSelectedFilter("all");
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.resetSearchBtnText}>Reset Filters & Search</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Member Quick Action Sheet Modal */}
      <Modal
        visible={Boolean(actionMember)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMember(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionMember(null)}
        >
          <View
            style={[
              styles.actionSheetCard,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: colors.border,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {actionMember && (
              <>
                {/* Header Profile Summary */}
                <View style={styles.actionSheetHeader}>
                  {actionMember.profiles?.avatar_url ? (
                    <Image
                      source={{ uri: actionMember.profiles.avatar_url }}
                      style={styles.actionSheetAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.actionSheetAvatar,
                        styles.avatarPlaceholder,
                        {
                          backgroundColor: getAvatarColor(
                            actionMember.profiles?.full_name || actionMember.user_id
                          ).bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarInitial,
                          {
                            color: getAvatarColor(
                              actionMember.profiles?.full_name || actionMember.user_id
                            ).text,
                          },
                        ]}
                      >
                        {actionMember.profiles?.full_name?.charAt(0).toUpperCase() || "U"}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[styles.actionSheetName, { color: colors.text }]}>
                      {actionMember.profiles?.full_name || "Club Member"}
                    </Text>
                    <Text style={[styles.actionSheetHandle, { color: colors.textSecondary }]}>
                      @{actionMember.profiles?.username || "student"}
                      {actionMember.profiles?.department
                        ? ` • ${actionMember.profiles.department}`
                        : ""}
                    </Text>

                    <View
                      style={[
                        styles.inlineRoleBadge,
                        {
                          backgroundColor: getRoleBadgeDetails(actionMember.role, actionMember.title).bg,
                          alignSelf: "flex-start",
                          marginTop: 6,
                        },
                      ]}
                    >
                      <Ionicons
                        name={getRoleIconName(actionMember.role)}
                        size={12}
                        color={getRoleBadgeDetails(actionMember.role, actionMember.title).color}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.inlineRoleText,
                          {
                            color: getRoleBadgeDetails(actionMember.role, actionMember.title).color,
                          },
                        ]}
                      >
                        {getRoleBadgeDetails(actionMember.role, actionMember.title).label}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => setActionMember(null)}
                    style={styles.closeModalBtn}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

                {/* Action Items List */}
                <View style={styles.actionItemsList}>
                  {/* View Profile */}
                  <TouchableOpacity
                    style={styles.actionItemRow}
                    onPress={() => {
                      const m = actionMember;
                      setActionMember(null);
                      handleNavigateToProfile(m);
                    }}
                  >
                    <View
                      style={[
                        styles.actionIconBox,
                        { backgroundColor: "rgba(37, 99, 235, 0.12)" },
                      ]}
                    >
                      <Ionicons name="person-circle-outline" size={20} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.actionItemTitle, { color: colors.text }]}>
                        View Full Profile
                      </Text>
                      <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                        Skills, achievements, portfolio & mutual connections
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Send Direct Message */}
                  {currentUserId !== actionMember.user_id && (
                    <TouchableOpacity
                      style={styles.actionItemRow}
                      onPress={() => handleStartChat(actionMember)}
                    >
                      <View
                        style={[
                          styles.actionIconBox,
                          { backgroundColor: "rgba(16, 185, 129, 0.12)" },
                        ]}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#10B981" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.actionItemTitle, { color: colors.text }]}>
                          Send Direct Message
                        </Text>
                        <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                          Start a real-time peer discussion or collaboration
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}

                  {/* Book 1:1 Peer Session */}
                  {currentUserId !== actionMember.user_id && (
                    <TouchableOpacity
                      style={styles.actionItemRow}
                      onPress={() => handleBookSession(actionMember)}
                    >
                      <View
                        style={[
                          styles.actionIconBox,
                          { backgroundColor: "rgba(245, 158, 11, 0.12)" },
                        ]}
                      >
                        <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.actionItemTitle, { color: colors.text }]}>
                          Book Peer Mentorship / Session
                        </Text>
                        <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                          Schedule a 1-on-1 skill exchange or study slot
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}

                  {/* Share Profile */}
                  <TouchableOpacity
                    style={styles.actionItemRow}
                    onPress={() => handleShareProfile(actionMember)}
                  >
                    <View
                      style={[
                        styles.actionIconBox,
                        { backgroundColor: "rgba(139, 92, 246, 0.12)" },
                      ]}
                    >
                      <Ionicons name="share-social-outline" size={20} color="#8B5CF6" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.actionItemTitle, { color: colors.text }]}>
                        Share Profile
                      </Text>
                      <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                        Copy link or share to campus study channels
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Admin Roles & Designation (Leader only) */}
                  {isLeader && actionMember.role !== "owner" && (
                    <>
                      <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

                      <TouchableOpacity
                        style={styles.actionItemRow}
                        onPress={() => {
                          const m = actionMember;
                          setActionMember(null);
                          setEditingMember(m);
                          setTargetRole(m.role);
                          setTargetTitle(m.title || "");
                        }}
                      >
                        <View
                          style={[
                            styles.actionIconBox,
                            { backgroundColor: "rgba(59, 130, 246, 0.12)" },
                          ]}
                        >
                          <Ionicons name="create-outline" size={20} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.actionItemTitle, { color: colors.text }]}>
                            Assign Role & Custom Title
                          </Text>
                          <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                            Promote to officer, lead, or add specific designation
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionItemRow}
                        onPress={() => handleRemoveMember(actionMember)}
                      >
                        <View
                          style={[
                            styles.actionIconBox,
                            { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                          ]}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.actionItemTitle, { color: "#EF4444" }]}>
                            Remove from Club
                          </Text>
                          <Text style={[styles.actionItemSub, { color: colors.textSecondary }]}>
                            Revoke membership and workspace privileges
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Role & Designation Modal */}
      <Modal
        visible={Boolean(editingMember)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMember(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Assign Role & Title
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingMember(null)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalMemberName, { color: colors.textSecondary }]}>
              Modifying privileges for{" "}
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                {editingMember?.profiles?.full_name}
              </Text>
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Select Club Role:
            </Text>
            <View style={styles.rolePickerGrid}>
              {CLUB_ROLES.filter((r) => r.id !== "owner").map((r) => {
                const conf = ROLE_CONFIG[r.id];
                const isSelected = targetRole === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.roleChoiceBtn,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : isDark
                          ? colors.background
                          : "#F8FAFC",
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setTargetRole(r.id);
                    }}
                  >
                    <Ionicons
                      name={getRoleIconName(r.id)}
                      size={13}
                      color={isSelected ? "#FFFFFF" : conf?.color || colors.text}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.roleChoiceText,
                        { color: isSelected ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Custom Designation / Title (optional):
            </Text>
            <TextInput
              style={[
                styles.titleInput,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: isDark ? colors.background : "#F8FAFC",
                },
              ]}
              placeholder="e.g. Lead Roboticist, Hackathon Lead, Treasurer"
              placeholderTextColor={colors.textSecondary}
              value={targetTitle}
              onChangeText={setTargetTitle}
              maxLength={60}
            />

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: updating ? 0.7 : 1 },
              ]}
              onPress={handleUpdateRole}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Save Role Assignment</Text>
                </View>
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
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  filterScrollWrapper: {
    marginBottom: 14,
  },
  filterTabsContainer: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  filterChipText: {
    fontSize: 13,
  },
  filterCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  communityHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  communityHeroImage: {
    width: "100%",
    height: 120,
  },
  communityHeroContent: {
    padding: 14,
  },
  communityHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  communityHeroBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  communityHeroTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  communityHeroSub: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  leadershipSection: {
    marginBottom: 14,
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
    width: "48.5%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    position: "relative",
  },
  leaderBadgeCorner: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  leaderAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: "800",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    maxWidth: "95%",
  },
  leaderName: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  selfBadgePill: {
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
    maxWidth: "96%",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  leaderDept: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 8,
  },
  leaderCardActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  leaderQuickBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
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
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
  },
  inlineRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inlineRoleText: {
    fontSize: 10,
    fontWeight: "700",
  },
  memberSub: {
    fontSize: 12,
  },
  actionCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 6,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyImage: {
    width: 150,
    height: 150,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
    maxWidth: 300,
  },
  resetSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  resetSearchBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  actionSheetCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  actionSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionSheetAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  actionSheetName: {
    fontSize: 16,
    fontWeight: "700",
  },
  actionSheetHandle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 4,
    alignSelf: "flex-start",
  },
  sheetDivider: {
    height: 1,
    marginVertical: 14,
  },
  actionItemsList: {
    gap: 8,
  },
  actionItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionItemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  actionItemSub: {
    fontSize: 11,
    marginTop: 2,
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
    fontSize: 13,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 4,
  },
  rolePickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  roleChoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  roleChoiceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 18,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
