import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";
import {
  ClubItem,
  CreateClubModal,
} from "@/features/clubs";

type TabMode = "created" | "joined";

const LEADERSHIP_ROLES = ["owner", "admin", "president", "vice_president", "executive", "moderator", "team_lead"];

export default function ClubManageScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabMode>("created");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Invite Member Modal State
  const [inviteModalClub, setInviteModalClub] = useState<ClubItem | null>(null);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInviteUser, setSelectedInviteUser] = useState<any>(null);
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteTitle, setInviteTitle] = useState("");

  // Advanced Settings Modal State
  const [settingsModalClub, setSettingsModalClub] = useState<ClubItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<string>("Academic & Tech");
  const [formMembershipType, setFormMembershipType] = useState<"open" | "application" | "invite_only">("open");
  const [formMission, setFormMission] = useState("");
  const [formVision, setFormVision] = useState("");
  const [formEmail, setFormEmail] = useState("");

  // Quick Activities Modal State
  const [activitiesClub, setActivitiesClub] = useState<ClubItem | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");

  // Fetch my clubs
  const myClubsQuery = useQuery({
    queryKey: ["my-clubs-manage"],
    queryFn: async () => {
      const res = await api<{
        memberships: { role: string; title?: string; joined_at?: string; clubs: ClubItem }[];
        follows?: { club_id: string; clubs: ClubItem }[];
      }>("/clubs/mine");

      const all = (res.memberships ?? [])
        .map((m) => {
          if (!m.clubs) return null;
          return {
            ...m.clubs,
            my_role: m.role,
            my_title: m.title,
            joined_at: m.joined_at,
            is_member: true,
          };
        })
        .filter(Boolean) as (ClubItem & { my_role?: string; my_title?: string; joined_at?: string })[];

      const created = all.filter((c) =>
        c.my_role ? LEADERSHIP_ROLES.includes(c.my_role.toLowerCase()) : false
      );
      const joined = all.filter((c) =>
        c.my_role ? !LEADERSHIP_ROLES.includes(c.my_role.toLowerCase()) : true
      );

      return { all, created, joined };
    },
  });

  // User search query for member invites
  const searchUsersQuery = useQuery({
    queryKey: ["club-invite-search", inviteSearch.trim()],
    queryFn: () =>
      api<{ results: Array<{ id: string; title: string; subtitle?: string; imageUrl?: string }> }>(
        `/search?q=${encodeURIComponent(inviteSearch.trim())}&kind=person`
      ),
    enabled: Boolean(inviteModalClub) && inviteSearch.trim().length > 0,
  });

  // Connections contacts for fallback invite list
  const connectionsQuery = useQuery({
    queryKey: ["connections-contacts-invite"],
    queryFn: () => api<{ connections: any[] }>("/connections"),
    enabled: Boolean(inviteModalClub) && inviteSearch.trim().length === 0,
  });

  // Mutation: Invite member
  const inviteMutation = useMutation({
    mutationFn: ({ clubId, userId, role, title }: { clubId: string; userId: string; role: string; title?: string }) =>
      api(`/clubs/${clubId}/members/invite`, {
        method: "POST",
        body: JSON.stringify({ userId, role, title }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Member Invited! 🎉", "The member has been added to the club and notified.");
      setInviteModalClub(null);
      setSelectedInviteUser(null);
      setInviteSearch("");
      setInviteTitle("");
      qc.invalidateQueries({ queryKey: ["my-clubs-manage"] });
    },
    onError: (err: any) => {
      Alert.alert("Invite Failed", err.message || "Could not invite user to club");
    },
  });

  // Mutation: Update club settings
  const updateSettingsMutation = useMutation({
    mutationFn: ({ clubId, data }: { clubId: string; data: any }) =>
      api(`/clubs/${clubId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Success", "Club settings and branding updated.");
      setSettingsModalClub(null);
      qc.invalidateQueries({ queryKey: ["my-clubs-manage"] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
    },
    onError: (err: any) => {
      Alert.alert("Update Failed", err.message || "Failed to save club settings");
    },
  });

  // Mutation: Post quick announcement
  const postAnnouncementMutation = useMutation({
    mutationFn: ({ clubId, title, content }: { clubId: string; title: string; content: string }) =>
      api(`/clubs/${clubId}/posts`, {
        method: "POST",
        body: JSON.stringify({
          type: "announcement",
          title: title.trim() || undefined,
          content: content.trim(),
          is_pinned: true,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Announcement Published! 📢", "All club members have received this announcement.");
      setActivitiesClub(null);
      setAnnouncementText("");
      setAnnouncementTitle("");
      qc.invalidateQueries({ queryKey: ["my-clubs-manage"] });
    },
    onError: (err: any) => {
      Alert.alert("Post Failed", err.message || "Could not publish announcement");
    },
  });

  // Mutation: Leave club
  const leaveMutation = useMutation({
    mutationFn: (clubId: string) => api(`/clubs/${clubId}/leave`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Left Club", "You have left this club.");
      qc.invalidateQueries({ queryKey: ["my-clubs-manage"] });
    },
    onError: (err: any) => Alert.alert("Error", err.message),
  });

  const createdList = myClubsQuery.data?.created ?? [];
  const joinedList = myClubsQuery.data?.joined ?? [];

  const openSettings = (club: ClubItem) => {
    triggerHaptic();
    setSettingsModalClub(club);
    setFormName(club.name || "");
    setFormTagline(club.tagline || "");
    setFormDescription(club.description || "");
    setFormCategory(club.category || "Academic & Tech");
    setFormMembershipType((club.membership_type as any) || "open");
    setFormMission((club as any).mission || "");
    setFormVision((club as any).vision || "");
    setFormEmail((club as any).contact_email || "");
  };

  const handleSaveSettings = () => {
    if (!settingsModalClub) return;
    if (!formName.trim()) {
      Alert.alert("Validation", "Club name is required.");
      return;
    }
    updateSettingsMutation.mutate({
      clubId: settingsModalClub.id,
      data: {
        name: formName.trim(),
        tagline: formTagline.trim(),
        description: formDescription.trim(),
        category: formCategory,
        membership_type: formMembershipType,
        mission: formMission.trim() || null,
        vision: formVision.trim() || null,
        contact_email: formEmail.trim() || null,
      },
    });
  };

  return (
    <Screen>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
          <Row style={{ alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <View>
              <H1 style={{ fontSize: 20 }}>Club Control Center</H1>
              <Muted style={{ fontSize: 12 }}>Manage societies, invites & activities</Muted>
            </View>
          </Row>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setShowCreateModal(true);
            }}
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.createBtnText}>New Club</Text>
          </Pressable>
        </Row>

        {/* Tab Switcher: Created (Lead) vs Joined */}
        <View style={[styles.tabTrack, { backgroundColor: colors.surface2 }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("created");
            }}
            style={[
              styles.tabPill,
              activeTab === "created" && [styles.tabPillActive, { backgroundColor: colors.surface }],
            ]}
          >
            <MaterialCommunityIcons
              name="shield-crown"
              size={16}
              color={activeTab === "created" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "created" ? colors.primary : colors.muted },
                activeTab === "created" && styles.tabTextBold,
              ]}
            >
              Created & Leading ({createdList.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("joined");
            }}
            style={[
              styles.tabPill,
              activeTab === "joined" && [styles.tabPillActive, { backgroundColor: colors.surface }],
            ]}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={16}
              color={activeTab === "joined" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "joined" ? colors.primary : colors.muted },
                activeTab === "joined" && styles.tabTextBold,
              ]}
            >
              Joined Clubs ({joinedList.length})
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={myClubsQuery.isRefetching}
            onRefresh={() => myClubsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {myClubsQuery.isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </View>
        ) : myClubsQuery.isError ? (
          <ErrorState
            detail={(myClubsQuery.error as Error).message}
            onRetry={() => myClubsQuery.refetch()}
          />
        ) : activeTab === "created" ? (
          createdList.length === 0 ? (
            <Empty
              icon="shield-crown-outline"
              title="No Clubs Created Yet"
              detail="You haven't founded or been appointed executive of any campus societies yet."
              actionTitle="Create Your First Club"
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <View style={{ gap: 16 }}>
              {createdList.map((club) => (
                <Card key={club.id} style={[styles.clubCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Top info */}
                  <Row style={{ alignItems: "center", gap: 12 }}>
                    {club.logo_url ? (
                      <Image source={{ uri: club.logo_url }} style={styles.clubLogo} />
                    ) : (
                      <View style={[styles.clubLogoPlaceholder, { backgroundColor: colors.primarySoft }]}>
                        <MaterialCommunityIcons name="account-group" size={26} color={colors.primary} />
                      </View>
                    )}

                    <View style={{ flex: 1, gap: 2 }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <Text style={[styles.clubTitle, { color: colors.text }]} numberOfLines={1}>
                          {club.name}
                        </Text>
                        {club.verified && (
                          <MaterialCommunityIcons name="check-decagram" size={16} color={colors.primary} />
                        )}
                      </Row>
                      <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                        {club.tagline || club.category || "Campus Society"}
                      </Muted>
                      <Row style={{ alignItems: "center", gap: 8, marginTop: 2 }}>
                        <Pill tone="primary">
                          {(club.my_role || "Admin").toUpperCase()}
                        </Pill>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          {club.member_count ?? 1} members
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>• {club.membership_type || "open"}</Text>
                      </Row>
                    </View>
                  </Row>

                  {/* Actions Grid */}
                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  <Row style={{ flexWrap: "wrap", gap: 8 }}>
                    {/* 1. Activities button */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setActivitiesClub(club);
                      }}
                      style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
                    >
                      <MaterialCommunityIcons name="bullhorn-outline" size={16} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Activities</Text>
                    </Pressable>

                    {/* 2. Invite Member button */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setInviteModalClub(club);
                        setInviteSearch("");
                        setSelectedInviteUser(null);
                        setInviteRole("member");
                      }}
                      style={[styles.actionBtn, { backgroundColor: `${colors.success}18` }]}
                    >
                      <MaterialCommunityIcons name="account-plus-outline" size={16} color={colors.success} />
                      <Text style={[styles.actionBtnText, { color: colors.success }]}>Invite Member</Text>
                    </Pressable>

                    {/* 3. Settings button */}
                    <Pressable
                      onPress={() => openSettings(club)}
                      style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="tune" size={16} color={colors.text} />
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>Settings</Text>
                    </Pressable>

                    {/* 4. Open Club */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/club/${club.id}` as any);
                      }}
                      style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="arrow-top-right" size={16} color={colors.text} />
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>Open Club</Text>
                    </Pressable>
                  </Row>
                </Card>
              ))}
            </View>
          )
        ) : (
          joinedList.length === 0 ? (
            <Empty
              icon="account-group-outline"
              title="No Joined Clubs"
              detail="You haven't joined any campus clubs yet. Explore and join societies to collaborate."
              actionTitle="Discover Campus Clubs"
              onAction={() => router.push("/clubs" as any)}
            />
          ) : (
            <View style={{ gap: 14 }}>
              {joinedList.map((club) => (
                <Card key={club.id} style={[styles.clubCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", gap: 12 }}>
                    {club.logo_url ? (
                      <Image source={{ uri: club.logo_url }} style={styles.clubLogo} />
                    ) : (
                      <View style={[styles.clubLogoPlaceholder, { backgroundColor: colors.primarySoft }]}>
                        <MaterialCommunityIcons name="account-group" size={26} color={colors.primary} />
                      </View>
                    )}

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.clubTitle, { color: colors.text }]} numberOfLines={1}>
                        {club.name}
                      </Text>
                      <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                        {club.tagline || club.category}
                      </Muted>
                      <Row style={{ alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Pill tone="default">{club.my_title || "Member"}</Pill>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          {club.member_count ?? 1} members
                        </Text>
                      </Row>
                    </View>
                  </Row>

                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  <Row style={{ justifyContent: "flex-end", gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        Alert.alert("Leave Club", `Are you sure you want to leave "${club.name}"?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate(club.id) },
                        ]);
                      }}
                      style={[styles.smallBtn, { backgroundColor: `${colors.danger}15` }]}
                    >
                      <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>Leave</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push(`/club/${club.id}` as any);
                      }}
                      style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>Enter Club Space</Text>
                    </Pressable>
                  </Row>
                </Card>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: INVITE MEMBER MODAL                                  */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(inviteModalClub)}
        animationType="slide"
        onRequestClose={() => setInviteModalClub(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Invite Member</Text>
              <Muted style={{ fontSize: 12 }}>Invite to {inviteModalClub?.name}</Muted>
            </View>
            <Pressable onPress={() => setInviteModalClub(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Search Student / Friend */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>SEARCH STUDENT OR FRIEND</Text>
              <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
                <TextInput
                  placeholder="Type name or username..."
                  placeholderTextColor={colors.muted}
                  value={inviteSearch}
                  onChangeText={setInviteSearch}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {inviteSearch ? (
                  <Pressable onPress={() => setInviteSearch("")} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Selected User preview if chosen */}
            {selectedInviteUser && (
              <View style={[styles.selectedUserCard, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                <MaterialCommunityIcons name="account-check" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>{selectedInviteUser.title || selectedInviteUser.full_name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Ready to invite</Text>
                </View>
                <Pressable onPress={() => setSelectedInviteUser(null)}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            )}

            {/* Candidate List */}
            {!selectedInviteUser && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.subLabel, { color: colors.muted }]}>
                  {inviteSearch ? "SEARCH RESULTS" : "FRIENDS & CONNECTIONS"}
                </Text>

                {inviteSearch ? (
                  searchUsersQuery.isLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (searchUsersQuery.data?.results ?? []).length === 0 ? (
                    <Empty title="No users found" detail="Try a different search term." />
                  ) : (
                    (searchUsersQuery.data?.results ?? []).map((u) => (
                      <Pressable
                        key={u.id}
                        onPress={() => {
                          triggerHaptic();
                          setSelectedInviteUser(u);
                        }}
                        style={[styles.userRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <View style={[styles.userRowAvatar, { backgroundColor: colors.primarySoft }]}>
                          <Text style={{ color: colors.primary, fontWeight: "700" }}>
                            {(u.title || "U").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "600", color: colors.text }}>{u.title}</Text>
                          {u.subtitle ? <Text style={{ fontSize: 11, color: colors.muted }}>{u.subtitle}</Text> : null}
                        </View>
                        <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.primary} />
                      </Pressable>
                    ))
                  )
                ) : (
                  (connectionsQuery.data?.connections ?? []).map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        triggerHaptic();
                        setSelectedInviteUser({ id: c.id, title: c.full_name || c.username });
                      }}
                      style={[styles.userRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <View style={[styles.userRowAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>
                          {(c.full_name || c.username || "U").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600", color: colors.text }}>{c.full_name || c.username}</Text>
                        {c.department ? <Text style={{ fontSize: 11, color: colors.muted }}>{c.department}</Text> : null}
                      </View>
                      <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.primary} />
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {/* Select Role */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>ASSIGN ROLE</Text>
              <Row style={{ flexWrap: "wrap", gap: 8 }}>
                {[
                  { key: "member", label: "General Member" },
                  { key: "executive", label: "Executive Committee" },
                  { key: "team_lead", label: "Team Lead" },
                  { key: "moderator", label: "Moderator" },
                  { key: "secretary", label: "Secretary" },
                  { key: "vice_president", label: "Vice President" },
                ].map((r) => (
                  <Pressable
                    key={r.key}
                    onPress={() => {
                      triggerHaptic();
                      setInviteRole(r.key);
                    }}
                    style={[
                      styles.roleChip,
                      {
                        backgroundColor: inviteRole === r.key ? colors.primary : colors.surface,
                        borderColor: inviteRole === r.key ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: inviteRole === r.key ? "#FFFFFF" : colors.text,
                      }}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Custom Title (Optional) */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>CUSTOM POSITION TITLE (OPTIONAL)</Text>
              <TextInput
                placeholder="e.g. Lead Designer, Hackathon Lead..."
                placeholderTextColor={colors.muted}
                value={inviteTitle}
                onChangeText={setInviteTitle}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </ScrollView>

          {/* Submit Action */}
          <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Button
              title={inviteMutation.isPending ? "Inviting..." : "Send Club Invite"}
              disabled={!selectedInviteUser || inviteMutation.isPending}
              onPress={() => {
                if (!inviteModalClub || !selectedInviteUser) return;
                inviteMutation.mutate({
                  clubId: inviteModalClub.id,
                  userId: selectedInviteUser.id,
                  role: inviteRole,
                  title: inviteTitle.trim() || undefined,
                });
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: ADVANCED SETTINGS MODAL                               */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(settingsModalClub)}
        animationType="slide"
        onRequestClose={() => setSettingsModalClub(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Club Advanced Settings</Text>
              <Muted style={{ fontSize: 12 }}>Modify branding, mission & rules</Muted>
            </View>
            <Pressable onPress={() => setSettingsModalClub(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>CLUB NAME</Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>TAGLINE</Text>
              <TextInput
                value={formTagline}
                onChangeText={setFormTagline}
                placeholder="Short motto or focus..."
                placeholderTextColor={colors.muted}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>DESCRIPTION</Text>
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={4}
                style={[styles.inputBox, { minHeight: 90, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>MEMBERSHIP MODEL</Text>
              <Row style={{ gap: 8 }}>
                {(["open", "application", "invite_only"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => {
                      triggerHaptic();
                      setFormMembershipType(mode);
                    }}
                    style={[
                      styles.roleChip,
                      {
                        backgroundColor: formMembershipType === mode ? colors.primary : colors.surface,
                        borderColor: formMembershipType === mode ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: formMembershipType === mode ? "#FFFFFF" : colors.text }}>
                      {mode === "open" ? "Open Join" : mode === "application" ? "Application" : "Invite Only"}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>MISSION STATEMENT</Text>
              <TextInput
                value={formMission}
                onChangeText={setFormMission}
                placeholder="What is the primary goal of this club?"
                placeholderTextColor={colors.muted}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>OFFICIAL CONTACT EMAIL</Text>
              <TextInput
                value={formEmail}
                onChangeText={setFormEmail}
                keyboardType="email-address"
                placeholder="club@campus.edu"
                placeholderTextColor={colors.muted}
                style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </ScrollView>

          <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Button
              title={updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              disabled={updateSettingsMutation.isPending}
              onPress={handleSaveSettings}
            />
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 3: ACTIVITIES COMMAND MODAL                              */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(activitiesClub)}
        animationType="slide"
        onRequestClose={() => setActivitiesClub(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Club Activities & Hub</Text>
              <Muted style={{ fontSize: 12 }}>{activitiesClub?.name}</Muted>
            </View>
            <Pressable onPress={() => setActivitiesClub(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Quick Post Announcement */}
            <View style={[styles.activitySection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
                <MaterialCommunityIcons name="bullhorn" size={18} color={colors.primary} />
                <Text style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>Post Official Announcement</Text>
              </Row>
              <TextInput
                placeholder="Announcement Title (e.g. Annual Hackathon Opening)"
                placeholderTextColor={colors.muted}
                value={announcementTitle}
                onChangeText={setAnnouncementTitle}
                style={[styles.inputBox, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text, marginBottom: 8 }]}
              />
              <TextInput
                placeholder="Write message to all club members..."
                placeholderTextColor={colors.muted}
                value={announcementText}
                onChangeText={setAnnouncementText}
                multiline
                numberOfLines={3}
                style={[styles.inputBox, { minHeight: 70, backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text, marginBottom: 10 }]}
              />
              <Button
                title={postAnnouncementMutation.isPending ? "Broadcasting..." : "Broadcast Announcement"}
                disabled={!announcementText.trim() || postAnnouncementMutation.isPending}
                onPress={() => {
                  if (!activitiesClub) return;
                  postAnnouncementMutation.mutate({
                    clubId: activitiesClub.id,
                    title: announcementTitle,
                    content: announcementText,
                  });
                }}
              />
            </View>

            {/* Activity Navigation Hub */}
            <Text style={[styles.fieldLabel, { color: colors.text }]}>MANAGE CLUB MODULES</Text>

            {[
              {
                title: "Club Events & Meetups",
                desc: "Schedule workshops, bootcamps and conflict-free calendar events",
                icon: "calendar-star",
                action: () => {
                  setActivitiesClub(null);
                  router.push(`/events` as any);
                },
              },
              {
                title: "Recruitment Campaigns",
                desc: "Open executive & volunteer hiring pipeline with Kanban review",
                icon: "briefcase-account",
                action: () => {
                  const id = activitiesClub?.id;
                  setActivitiesClub(null);
                  router.push(`/club/${id}` as any);
                },
              },
              {
                title: "Projects & Lab Initiatives",
                desc: "Showcase open projects, member milestones and code repositories",
                icon: "folder-star-outline",
                action: () => {
                  const id = activitiesClub?.id;
                  setActivitiesClub(null);
                  router.push(`/club/${id}` as any);
                },
              },
              {
                title: "Shared Academic Vault",
                desc: "Upload question banks, slide decks and learning resources",
                icon: "file-cabinet",
                action: () => {
                  const id = activitiesClub?.id;
                  setActivitiesClub(null);
                  router.push(`/club/${id}` as any);
                },
              },
            ].map((item, idx) => (
              <Pressable
                key={idx}
                onPress={() => {
                  triggerHaptic();
                  item.action();
                }}
                style={[styles.moduleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.moduleIconBox, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>{item.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{item.desc}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* New Club Creation Modal */}
      <CreateClubModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["my-clubs-manage"] });
          qc.invalidateQueries({ queryKey: ["clubs"] });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  backBtn: {
    padding: 4,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  tabTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
  },
  tabPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tabPillActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tabTextBold: {
    fontWeight: "700",
  },
  clubCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  clubLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  clubLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  clubTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    paddingTop: 48,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  userRowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedUserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  activitySection: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  moduleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  moduleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
