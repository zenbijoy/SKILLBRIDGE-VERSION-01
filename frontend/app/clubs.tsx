import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, H1, Muted, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import api from "@/services/api";
import {
  ClubItem,
  ClubCategory,
  CLUB_CATEGORIES,
  ClubCard,
  CreateClubModal,
} from "@/features/clubs";

type DiscoveryTab = "explore" | "recommended" | "my_clubs";

export default function ClubsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<DiscoveryTab>("explore");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ClubCategory | "All">("All");

  // Filter chips
  const [filterRecruiting, setFilterRecruiting] = useState(false);
  const [filterEvents, setFilterEvents] = useState(false);
  const [filterVerified, setFilterVerified] = useState(false);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch all clubs
  const clubsQuery = useQuery({
    queryKey: ["clubs"],
    queryFn: async () => {
      const res = await api.get<{ clubs: ClubItem[] }>("/clubs");
      return res.data?.clubs ?? [];
    },
  });

  // Fetch user's clubs
  const myClubsQuery = useQuery({
    queryKey: ["my-clubs"],
    queryFn: async () => {
      const res = await api.get<{
        memberships: { role: string; clubs: ClubItem }[];
        followed_clubs?: ClubItem[];
      }>("/clubs/mine");
      const joined = (res.data?.memberships ?? [])
        .map((m: { role: string; clubs: ClubItem }) => {
          if (!m.clubs) return null;
          return {
            ...m.clubs,
            is_member: true,
            my_role: m.role as any,
          };
        })
        .filter(Boolean) as ClubItem[];

      const followed = (res.data?.followed_clubs ?? []).map((c: ClubItem) => ({
        ...c,
        is_following: true,
      }));

      return { joined, followed };
    },
  });

  // Fetch personalized recommended clubs
  const recommendedQuery = useQuery({
    queryKey: ["recommended-clubs"],
    queryFn: async () => {
      const res = await api.get<{ clubs: ClubItem[] }>("/clubs/recommended");
      return res.data?.clubs ?? [];
    },
  });

  const allClubs = clubsQuery.data ?? [];
  const myJoinedClubs = myClubsQuery.data?.joined ?? [];
  const myFollowedClubs = myClubsQuery.data?.followed ?? [];
  const recommendedClubs = recommendedQuery.data ?? [];

  const handleRefresh = async () => {
    triggerHaptic();
    await Promise.all([
      clubsQuery.refetch(),
      myClubsQuery.refetch(),
      recommendedQuery.refetch(),
    ]);
  };

  // Filter logic
  const filteredClubs = useMemo(() => {
    let source = allClubs;

    if (activeTab === "recommended") {
      source = recommendedClubs.length > 0 ? recommendedClubs : allClubs;
    } else if (activeTab === "my_clubs") {
      source = [...myJoinedClubs, ...myFollowedClubs];
    }

    return source.filter((club: ClubItem) => {
      // Search matching
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        club.name.toLowerCase().includes(query) ||
        club.description?.toLowerCase().includes(query) ||
        club.tagline?.toLowerCase().includes(query) ||
        club.university?.toLowerCase().includes(query) ||
        club.department?.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // Category matching
      if (selectedCategory !== "All") {
        if ((club.category || "").toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // Feature filters
      if (filterVerified && !club.verified) return false;
      if (filterEvents && !club.next_event) return false;

      return true;
    });
  }, [
    allClubs,
    recommendedClubs,
    myJoinedClubs,
    myFollowedClubs,
    activeTab,
    search,
    selectedCategory,
    filterVerified,
    filterEvents,
  ]);

  return (
    <Screen>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.headerTitleWrap}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.backBtn}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View>
                <H1 style={styles.pageTitle}>Club Hub</H1>
                <Muted style={styles.pageSubtitle}>
                  Student communities & campus organizations
                </Muted>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.createClubTopBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createClubTopBtnText}>Create Club</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            placeholder="Search clubs, interests, events, projects..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Discovery Segmented Tabs: Explore | Recommended | My Clubs */}
        <View style={[styles.tabSegmentWrap, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === "explore" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => {
              triggerHaptic();
              setActiveTab("explore");
            }}
          >
            <Ionicons
              name="compass-outline"
              size={18}
              color={activeTab === "explore" ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabSegmentText,
                {
                  color:
                    activeTab === "explore" ? colors.primary : colors.textSecondary,
                  fontWeight: activeTab === "explore" ? "700" : "500",
                },
              ]}
            >
              Explore
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === "recommended" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => {
              triggerHaptic();
              setActiveTab("recommended");
            }}
          >
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={
                activeTab === "recommended" ? colors.primary : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.tabSegmentText,
                {
                  color:
                    activeTab === "recommended"
                      ? colors.primary
                      : colors.textSecondary,
                  fontWeight: activeTab === "recommended" ? "700" : "500",
                },
              ]}
            >
              Recommended
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === "my_clubs" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => {
              triggerHaptic();
              setActiveTab("my_clubs");
            }}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={activeTab === "my_clubs" ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabSegmentText,
                {
                  color:
                    activeTab === "my_clubs" ? colors.primary : colors.textSecondary,
                  fontWeight: activeTab === "my_clubs" ? "700" : "500",
                },
              ]}
            >
              My Clubs ({myJoinedClubs.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category Pills (Horizontal Scroll) */}
        <View style={styles.categoryWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            <TouchableOpacity
              style={[
                styles.catPill,
                selectedCategory === "All" && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
                { borderColor: colors.border },
              ]}
              onPress={() => {
                triggerHaptic();
                setSelectedCategory("All");
              }}
            >
              <Text
                style={[
                  styles.catPillText,
                  {
                    color: selectedCategory === "All" ? "#fff" : colors.text,
                    fontWeight: selectedCategory === "All" ? "700" : "500",
                  },
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            {CLUB_CATEGORIES.map((cat) => {
              const isSel = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catPill,
                    isSel && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                    { borderColor: colors.border },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setSelectedCategory(cat.id as ClubCategory);
                  }}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={isSel ? "#fff" : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.catPillText,
                      {
                        color: isSel ? "#fff" : colors.text,
                        fontWeight: isSel ? "700" : "500",
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Filter Quick-Toggles */}
        <View style={styles.quickFiltersRow}>
          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              filterVerified && {
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                borderColor: colors.primary,
              },
              { borderColor: colors.border },
            ]}
            onPress={() => {
              triggerHaptic();
              setFilterVerified((prev) => !prev);
            }}
          >
            <Ionicons
              name={filterVerified ? "checkmark-circle" : "shield-checkmark-outline"}
              size={14}
              color={filterVerified ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.quickFilterText,
                { color: filterVerified ? colors.primary : colors.text },
              ]}
            >
              Verified Only
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              filterEvents && {
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                borderColor: "#10b981",
              },
              { borderColor: colors.border },
            ]}
            onPress={() => {
              triggerHaptic();
              setFilterEvents((prev) => !prev);
            }}
          >
            <Ionicons
              name={filterEvents ? "checkmark-circle" : "calendar-outline"}
              size={14}
              color={filterEvents ? "#10b981" : colors.textSecondary}
            />
            <Text
              style={[
                styles.quickFilterText,
                { color: filterEvents ? "#10b981" : colors.text },
              ]}
            >
              Upcoming Events
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main Clubs List */}
        {clubsQuery.isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Discovering student clubs...
            </Text>
          </View>
        ) : filteredClubs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={54} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeTab === "my_clubs"
                ? "Your community is waiting."
                : "No Clubs Found"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {activeTab === "my_clubs"
                ? "You haven't joined or followed any campus clubs yet. Explore university clubs or start your own!"
                : "Try adjusting your search terms or category filters to discover exciting campus societies."}
            </Text>
            <TouchableOpacity
              style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (activeTab === "my_clubs") {
                  setActiveTab("explore");
                } else {
                  setShowCreateModal(true);
                }
              }}
            >
              <Ionicons
                name={
                  activeTab === "my_clubs"
                    ? "compass-outline"
                    : "add-circle-outline"
                }
                size={18}
                color="#fff"
              />
              <Text style={styles.emptyActionBtnText}>
                {activeTab === "my_clubs" ? "Explore Clubs" : "Create a Club"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredClubs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={clubsQuery.isRefetching}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item }) => (
              <ClubCard
                club={item}
                onJoinToggle={() => handleRefresh()}
                onFollowToggle={() => handleRefresh()}
              />
            )}
          />
        )}

        {/* Create Club Modal */}
        <CreateClubModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newClubId) => {
            handleRefresh();
            router.push(`/club/${newClubId}` as any);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  backBtn: {
    padding: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  createClubTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createClubTopBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  tabSegmentWrap: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabSegmentText: {
    fontSize: 13,
  },
  categoryWrap: {
    marginVertical: 10,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 13,
  },
  quickFiltersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  quickFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickFilterText: {
    fontSize: 12,
    fontWeight: "600",
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyActionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
});
