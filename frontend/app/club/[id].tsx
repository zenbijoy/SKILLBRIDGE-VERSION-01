import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import api from "@/services/api";
import {
  ClubDetail,
  ClubHero,
  ClubFeedTab,
  ClubEventsTab,
  ClubProjectsTab,
  ClubMembersTab,
  ClubRecruitmentTab,
  ClubResourcesTab,
  ClubAchievementsTab,
  ClubAboutTab,
  ClubAdminModal,
} from "@/features/clubs";
import { RoomChatTab } from "@/features/room/RoomChatTab";
import type { Room } from "@/types";

type ProfileTab =
  | "home"
  | "feed"
  | "events"
  | "projects"
  | "members"
  | "recruitment"
  | "resources"
  | "achievements"
  | "about"
  | "chat";

export default function ClubProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<ProfileTab>("home");
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Fetch full club details
  const clubQuery = useQuery({
    queryKey: ["club", id],
    queryFn: async () => {
      const res = await api.get<{
        club: ClubDetail;
        events?: any[];
        members?: any[];
        projects?: any[];
        recruitments?: any[];
        resources?: any[];
        achievements?: any[];
      }>(`/clubs/${id}`);

      const c = res.data?.club;
      return {
        ...c,
        events: res.data?.events ?? c?.events ?? [],
        members: res.data?.members ?? c?.members ?? [],
        projects: res.data?.projects ?? c?.projects ?? [],
        recruitments: res.data?.recruitments ?? [],
        resources: res.data?.resources ?? [],
        achievements: res.data?.achievements ?? [],
      } as ClubDetail & {
        recruitments?: any[];
        resources?: any[];
        achievements?: any[];
      };
    },
    enabled: Boolean(id),
  });

  // Fetch club posts for feed tab
  const postsQuery = useQuery({
    queryKey: ["club-posts", id],
    queryFn: async () => {
      const res = await api.get<{ posts: any[] }>(`/clubs/${id}/posts`);
      return res.data?.posts ?? [];
    },
    enabled: Boolean(id),
  });

  const club = clubQuery.data;
  const roomId = club?.room_id;

  // Linked Room OS Query for Chat
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: async () => {
      const res = await api.get<{ room: Room }>(`/rooms/${roomId}`);
      return res.data?.room;
    },
    enabled: Boolean(roomId),
  });

  const room = roomQuery.data;
  const isMember = Boolean(club?.is_member || club?.my_role);
  const isLeader =
    club?.my_role &&
    [
      "owner",
      "admin",
      "president",
      "vice_president",
      "secretary",
      "executive",
    ].includes(club.my_role);

  const handleShare = () => {
    if (!club) return;
    void Share.share({
      message: `Join ${club.name} on SkillBridge: https://skillbridge.app/club/${club.id}`,
    });
  };

  const handleOpenWorkspace = () => {
    if (club?.room_id) {
      router.push(`/room/${club.room_id}` as any);
    }
  };

  const tabs: Array<{ id: ProfileTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: "home", label: "Home", icon: "home-outline" },
    { id: "feed", label: "Feed", icon: "chatbubble-ellipses-outline" },
    { id: "events", label: "Events", icon: "calendar-outline" },
    { id: "projects", label: "Projects", icon: "rocket-outline" },
    { id: "members", label: "Members", icon: "people-outline" },
    { id: "recruitment", label: "Recruit", icon: "briefcase-outline" },
    { id: "resources", label: "Library", icon: "folder-outline" },
    { id: "achievements", label: "Awards", icon: "trophy-outline" },
    { id: "about", label: "About", icon: "information-circle-outline" },
    ...(roomId ? [{ id: "chat" as ProfileTab, label: "Live Chat", icon: "chatbubbles-outline" as keyof typeof Ionicons.glyphMap }] : []),
  ];

  if (clubQuery.isLoading) {
    return (
      <Screen>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading club platform...
          </Text>
        </View>
      </Screen>
    );
  }

  if (clubQuery.isError || !club) {
    return (
      <Screen>
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Club Not Found
          </Text>
          <Text style={[styles.errorSub, { color: colors.textSecondary }]}>
            This club may have been disbanded, renamed, or is currently undergoing
            maintenance.
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => clubQuery.refetch()}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Profile Hero Header */}
        <ClubHero
          club={club}
          onJoinToggle={async () => {
            try {
              if (club.is_member) {
                await api.post(`/clubs/${club.id}/leave`);
              } else {
                await api.post(`/clubs/${club.id}/join`);
              }
              clubQuery.refetch();
            } catch {}
          }}
          onFollowToggle={async () => {
            try {
              await api.post(`/clubs/${club.id}/follow`);
              clubQuery.refetch();
            } catch {}
          }}
          onOpenAdminModal={() => setShowAdminModal(true)}
        />

        {/* Horizontal Segmented Tab Bar */}
        <View style={[styles.tabBarWrap, { borderBottomColor: colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScroll}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tabItem,
                    isActive && {
                      borderBottomColor: colors.primary,
                      borderBottomWidth: 2,
                    },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setActiveTab(tab.id);
                  }}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: isActive ? colors.primary : colors.textSecondary,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab Content Display */}
        <View style={{ flex: 1 }}>
          {/* TAB 1: HOME / OVERVIEW */}
          {activeTab === "home" && (
            <ScrollView
              contentContainerStyle={styles.homeOverviewContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Latest Announcement Card */}
              {club.latest_announcement ? (
                <View
                  style={[
                    styles.announcementCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.announcementHeader}>
                    <View style={styles.announcementBadge}>
                      <Ionicons name="megaphone" size={14} color="#f59e0b" />
                      <Text style={styles.announcementBadgeText}>
                        PINNED ANNOUNCEMENT
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.announcementDate,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {new Date(
                        club.latest_announcement.created_at
                      ).toLocaleDateString()}
                    </Text>
                  </View>

                  {club.latest_announcement.title && (
                    <Text
                      style={[styles.announcementTitle, { color: colors.text }]}
                    >
                      {club.latest_announcement.title}
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.announcementBody,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {club.latest_announcement.content}
                  </Text>
                </View>
              ) : null}

              {/* Next Event Spotlight */}
              {club.next_event ? (
                <View
                  style={[
                    styles.spotlightCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.spotlightHeader}>
                    <Ionicons name="calendar" size={18} color="#3b82f6" />
                    <Text style={[styles.spotlightTitle, { color: colors.text }]}>
                      Next Upcoming Event
                    </Text>
                  </View>
                  <Text style={[styles.eventSpotTitle, { color: colors.text }]}>
                    {club.next_event.title}
                  </Text>
                  <Text
                    style={[
                      styles.eventSpotDate,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Starts: {new Date(club.next_event.starts_at).toLocaleString()}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.eventSpotBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setActiveTab("events")}
                  >
                    <Ionicons name="calendar-outline" size={16} color="#fff" />
                    <Text style={styles.eventSpotBtnText}>
                      View Event & Register
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* About Summary Snippet */}
              <View
                style={[
                  styles.aboutSnippetCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  About the Community
                </Text>
                <Text
                  style={[styles.aboutText, { color: colors.textSecondary }]}
                  numberOfLines={4}
                >
                  {club.description ||
                    "This university student club brings together students to collaborate, build projects, and compete."}
                </Text>
                <TouchableOpacity
                  style={styles.readMoreBtn}
                  onPress={() => setActiveTab("about")}
                >
                  <Text style={[styles.readMoreText, { color: colors.primary }]}>
                    Read Mission, Vision & Contacts →
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick Navigation Cards */}
              <View style={styles.quickNavRow}>
                <TouchableOpacity
                  style={[
                    styles.quickNavCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setActiveTab("feed")}
                >
                  <Ionicons
                    name="chatbubbles"
                    size={24}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.quickNavTitle, { color: colors.text }]}
                  >
                    Community Feed
                  </Text>
                  <Text
                    style={[
                      styles.quickNavSub,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Join discussions & Q&As
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickNavCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setActiveTab("recruitment")}
                >
                  <Ionicons
                    name="briefcase"
                    size={24}
                    color="#10b981"
                  />
                  <Text
                    style={[styles.quickNavTitle, { color: colors.text }]}
                  >
                    Recruitment
                  </Text>
                  <Text
                    style={[
                      styles.quickNavSub,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Apply for open roles
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Room OS Workspace Banner */}
              {club.room_id && (
                <TouchableOpacity
                  style={[
                    styles.roomOsBanner,
                    {
                      backgroundColor: "rgba(59, 130, 246, 0.12)",
                      borderColor: "rgba(59, 130, 246, 0.3)",
                    },
                  ]}
                  onPress={handleOpenWorkspace}
                >
                  <View style={styles.roomOsLeft}>
                    <Ionicons
                      name="cube-outline"
                      size={28}
                      color={colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.roomOsTitle, { color: colors.text }]}
                      >
                        Room OS Collaborative Workspace
                      </Text>
                      <Text
                        style={[
                          styles.roomOsSub,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Whiteboards, live meetings, tasks, and file repository
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* TAB 2: COMMUNITY FEED */}
          {activeTab === "feed" && (
            <ClubFeedTab
              clubId={club.id}
              isMember={isMember}
              isLeader={!!isLeader}
              posts={postsQuery.data ?? []}
              onRefresh={() => postsQuery.refetch()}
            />
          )}

          {/* TAB 3: EVENTS */}
          {activeTab === "events" && (
            <ClubEventsTab
              clubId={club.id}
              myRole={club.my_role}
              events={club.events || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
            />
          )}

          {/* TAB 4: PROJECTS */}
          {activeTab === "projects" && (
            <ClubProjectsTab
              clubId={club.id}
              myRole={club.my_role}
              projects={club.projects || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
            />
          )}

          {/* TAB 5: MEMBERS */}
          {activeTab === "members" && (
            <ClubMembersTab
              clubId={club.id}
              myRole={club.my_role}
              members={club.members || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
            />
          )}

          {/* TAB 6: RECRUITMENT */}
          {activeTab === "recruitment" && (
            <ClubRecruitmentTab
              clubId={club.id}
              myRole={club.my_role}
              recruitments={club.recruitments || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
              onOpenAdminKanban={
                isLeader ? () => setShowAdminModal(true) : undefined
              }
            />
          )}

          {/* TAB 7: RESOURCES */}
          {activeTab === "resources" && (
            <ClubResourcesTab
              clubId={club.id}
              myRole={club.my_role}
              resources={club.resources || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
            />
          )}

          {/* TAB 8: ACHIEVEMENTS */}
          {activeTab === "achievements" && (
            <ClubAchievementsTab
              clubId={club.id}
              myRole={club.my_role}
              achievements={club.achievements || []}
              isLoading={clubQuery.isRefetching}
              onRefresh={() => clubQuery.refetch()}
            />
          )}

          {/* TAB 9: ABOUT */}
          {activeTab === "about" && <ClubAboutTab club={club} />}

          {/* TAB 10: ROOM OS LIVE CHAT */}
          {activeTab === "chat" && (
            <View style={{ flex: 1, minHeight: 400 }}>
              {room ? (
                <RoomChatTab
                  conversationId={room.conversation_id}
                  isMember={isMember}
                />
              ) : (
                <View style={styles.centerBox}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={48}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Club chat channel is connecting...
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Club Leader Admin Dashboard Modal */}
        {isLeader && (
          <ClubAdminModal
            visible={showAdminModal}
            club={club}
            onClose={() => setShowAdminModal(false)}
            onRefreshClub={() => clubQuery.refetch()}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  errorSub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tabBarWrap: {
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  tabScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 13,
  },
  homeOverviewContent: {
    padding: 16,
    paddingBottom: 60,
    gap: 14,
  },
  announcementCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  announcementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  announcementBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  announcementBadgeText: {
    color: "#f59e0b",
    fontSize: 10,
    fontWeight: "800",
  },
  announcementDate: {
    fontSize: 11,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  announcementBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  spotlightCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  spotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  spotlightTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  eventSpotTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  eventSpotDate: {
    fontSize: 13,
    marginBottom: 12,
  },
  eventSpotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  eventSpotBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  aboutSnippetCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  aboutText: {
    fontSize: 13,
    lineHeight: 19,
  },
  readMoreBtn: {
    marginTop: 8,
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },
  quickNavRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickNavCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  quickNavTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  quickNavSub: {
    fontSize: 11,
  },
  roomOsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  roomOsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  roomOsTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  roomOsSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
