import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EventItem, Profile, Room } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { nextGenAnimations, nextGenAnimationsV2 } from "@/assets/nextgen";
import { InstagramProfileCard } from "@/components/InstagramProfileCard";
import { SuggestedRoomCard } from "@/components/SuggestedRoomCard";

type AIMatch = {
  profile: Profile;
  matchPercentage: number;
  sharedSkills: string[];
  matchReason: string;
};

type ClubItem = {
  id: string;
  name: string;
  category?: string;
  university?: string;
  member_count?: number;
  description?: string;
  avatar_url?: string;
};

type ResearchItem = {
  id: string;
  title: string;
  field?: string;
  status: string;
  looking_for_collaborators?: boolean;
  lead?: { full_name?: string };
  description?: string;
};

const CATEGORIES = [
  { key: "for_you", labelKey: "discover.catForYou", icon: "creation" },
  { key: "people", labelKey: "discover.catPeople", icon: "account-multiple-outline" },
  { key: "rooms", labelKey: "discover.catRooms", icon: "door-open" },
  { key: "clubs", labelKey: "discover.catClubs", icon: "account-group-outline" },
  { key: "research", labelKey: "discover.catResearch", icon: "flask-outline" },
  { key: "events", labelKey: "discover.catEvents", icon: "calendar-star" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<CategoryKey>("for_you");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  // Recommendation Queries
  const aiMatches = useQuery({
    queryKey: ["recommendations", "ai-matches"],
    queryFn: () => api<{ matches: AIMatch[] }>("/recommendations/ai-matches"),
  });

  const peopleQuery = useQuery({
    queryKey: ["recommendations", "people"],
    queryFn: () => api<{ people: Profile[] }>("/recommendations/people"),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms-discover"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms?limit=25"),
  });

  const clubsQuery = useQuery({
    queryKey: ["clubs-discover"],
    queryFn: () => api<{ clubs: ClubItem[] }>("/clubs"),
    enabled: activeTab === "for_you" || activeTab === "clubs",
  });

  const researchQuery = useQuery({
    queryKey: ["research-discover"],
    queryFn: () => api<{ projects: ResearchItem[] }>("/research"),
    enabled: activeTab === "for_you" || activeTab === "research",
  });

  const eventsQuery = useQuery({
    queryKey: ["events-discover"],
    queryFn: () => api<{ events: EventItem[] }>("/events"),
    enabled: activeTab === "for_you" || activeTab === "events",
  });

  const isRefreshing =
    aiMatches.isRefetching ||
    peopleQuery.isRefetching ||
    roomsQuery.isRefetching ||
    clubsQuery.isRefetching ||
    researchQuery.isRefetching ||
    eventsQuery.isRefetching;

  const onRefresh = async () => {
    await Promise.all([
      aiMatches.refetch(),
      peopleQuery.refetch(),
      roomsQuery.refetch(),
      clubsQuery.refetch(),
      researchQuery.refetch(),
      eventsQuery.refetch(),
    ]);
  };

  // Compact Person Row Component
  const renderPersonRow = (p: Profile, matchMetadata?: string) => (
    <Pressable
      key={p.id}
      onPress={() => {
        triggerHaptic();
        router.push(`/user/${p.id}` as any);
      }}
      style={({ pressed }) => [
        s.compactRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={s.avatarImg} />
        ) : (
          <Text style={[s.avatarText, { color: colors.primary }]}>
            {p.full_name?.[0] || "U"}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {p.full_name}
          </Text>
          {matchMetadata ? (
            <Pill tone="accent">{matchMetadata}</Pill>
          ) : null}
        </Row>
        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
          {[p.department, p.university].filter(Boolean).join(" • ") || `@${p.username}`}
        </Muted>
      </View>
      <Button
        title={t("discover.view")}
        compact
        variant="secondary"
        onPress={() => {
          triggerHaptic();
          router.push(`/user/${p.id}` as any);
        }}
      />
    </Pressable>
  );

  // Compact Room Row Component
  const renderRoomRow = (r: Room) => (
    <Pressable
      key={r.id}
      onPress={() => {
        triggerHaptic();
        router.push(`/room/${r.id}` as any);
      }}
      style={({ pressed }) => [
        s.compactRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.iconSquare, { backgroundColor: colors.primarySoft }]}>
        <MaterialCommunityIcons name="door-open" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {r.title}
          </Text>
          {r.status === "live" ? (
            <Row style={{ alignItems: "center", gap: 4 }}>
              <Image
                source={nextGenAnimations.livePulse}
                style={{ width: 12, height: 12 }}
                resizeMode="contain"
              />
              <Pill tone="danger">LIVE</Pill>
            </Row>
          ) : null}
        </Row>
        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
          {r.topic ? `${r.topic} • ` : ""}{r.member_count} {t("discover.members")}
        </Muted>
      </View>
      <Button
        title={t("discover.join")}
        compact
        variant={r.status === "live" ? "primary" : "secondary"}
        onPress={() => {
          triggerHaptic();
          router.push(`/room/${r.id}` as any);
        }}
      />
    </Pressable>
  );

  // Compact Club Row Component
  const renderClubRow = (c: ClubItem) => (
    <Pressable
      key={c.id}
      onPress={() => {
        triggerHaptic();
        router.push(`/club/${c.id}` as any);
      }}
      style={({ pressed }) => [
        s.compactRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.iconSquare, { backgroundColor: `${colors.accent}18` }]}>
        <MaterialCommunityIcons name="account-group-outline" size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {c.name}
        </Text>
        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
          {[c.category, c.university, c.member_count ? `${c.member_count} ${t("discover.members")}` : null]
            .filter(Boolean)
            .join(" • ")}
        </Muted>
      </View>
      <Button
        title={t("discover.view")}
        compact
        variant="secondary"
        onPress={() => {
          triggerHaptic();
          router.push(`/club/${c.id}` as any);
        }}
      />
    </Pressable>
  );

  // Compact Research Row Component
  const renderResearchRow = (resItem: ResearchItem) => (
    <Pressable
      key={resItem.id}
      onPress={() => {
        triggerHaptic();
        router.push(`/research/${resItem.id}` as any);
      }}
      style={({ pressed }) => [
        s.compactRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.iconSquare, { backgroundColor: `${colors.info}18` }]}>
        <MaterialCommunityIcons name="flask-outline" size={20} color={colors.info} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {resItem.title}
          </Text>
          {resItem.looking_for_collaborators ? (
            <Pill tone="success">{t("discover.recruiting")}</Pill>
          ) : null}
        </Row>
        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
          {resItem.field || "Academic Research"}
        </Muted>
      </View>
      <Button
        title={t("discover.view")}
        compact
        variant="secondary"
        onPress={() => {
          triggerHaptic();
          router.push(`/research/${resItem.id}` as any);
        }}
      />
    </Pressable>
  );

  // Compact Event Row Component
  const renderEventRow = (e: EventItem) => (
    <Pressable
      key={e.id}
      onPress={() => {
        triggerHaptic();
        router.push(`/event/${e.id}` as any);
      }}
      style={({ pressed }) => [
        s.compactRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.iconSquare, { backgroundColor: `${colors.danger}18` }]}>
        <MaterialCommunityIcons name="calendar-star" size={20} color={colors.danger} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {e.title}
        </Text>
        <Muted numberOfLines={1} style={{ fontSize: 12 }}>
          {new Date(e.starts_at).toLocaleDateString()} • {e.location || "Online Campus"}
        </Muted>
      </View>
      <Button
        title={t("discover.view")}
        compact
        variant="secondary"
        onPress={() => {
          triggerHaptic();
          router.push(`/event/${e.id}` as any);
        }}
      />
    </Pressable>
  );

  return (
    <Screen
      header={
        <AppHeader
          title={t("discover.title")}
          actionIcon="magnify"
          actionLabel={t("common.search")}
          onAction={() => {
            triggerHaptic();
            router.push("/search" as any);
          }}
        />
      }
      onRefresh={onRefresh}
      refreshing={isRefreshing}
    >
      {/* Search Bar with Filter Button */}
      <View style={s.searchBarContainer}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            router.push("/search" as any);
          }}
          style={[s.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <Text style={[s.searchPlaceholderText, { color: colors.muted }]} numberOfLines={1}>
            {t("common.searchEverything", "Search skills, people, rooms...")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter options"
          onPress={() => {
            triggerHaptic();
            setShowFilterModal((prev) => !prev);
          }}
          style={[
            s.filterBtn,
            {
              backgroundColor: showFilterModal || selectedFilter !== "all" ? colors.primary : colors.surface,
              borderColor: showFilterModal || selectedFilter !== "all" ? colors.primary : colors.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={19}
            color={showFilterModal || selectedFilter !== "all" ? "#FFFFFF" : colors.text}
          />
        </Pressable>
      </View>

      {/* Filter Options Row */}
      {showFilterModal && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterChipsScroll}
        >
          {[
            { key: "all", label: t("discover.filterAll", "All") },
            { key: "live", label: t("discover.filterLive", "Live Rooms") },
            { key: "peers", label: t("discover.filterPeers", "Peers") },
            { key: "clubs", label: t("discover.filterClubs", "Clubs") },
            { key: "research", label: t("discover.filterResearch", "Research") },
            { key: "events", label: t("discover.filterEvents", "Events") },
          ].map((item) => {
            const isSel = selectedFilter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  triggerHaptic();
                  setSelectedFilter(item.key);
                  if (item.key === "peers") setActiveTab("people");
                  else if (item.key === "live") setActiveTab("rooms");
                  else if (item.key === "clubs") setActiveTab("clubs");
                  else if (item.key === "research") setActiveTab("research");
                  else if (item.key === "events") setActiveTab("events");
                }}
                style={[
                  s.filterChip,
                  {
                    backgroundColor: isSel ? colors.primarySoft : colors.surface,
                    borderColor: isSel ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.filterChipText,
                    { color: isSel ? colors.primary : colors.text, fontWeight: isSel ? "800" : "600" },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Compact Horizontal Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryScroll}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeTab === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => {
                triggerHaptic();
                setActiveTab(cat.key);
              }}
              style={[
                s.catTab,
                {
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={cat.icon as any}
                size={16}
                color={isActive ? colors.white : colors.muted}
              />
              <Text
                style={[
                  s.catTabText,
                  { color: isActive ? colors.white : colors.text, fontWeight: isActive ? "800" : "600" },
                ]}
              >
                {t(cat.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* TAB 1: FOR YOU (Synthesized personalized recommendations) */}
      {activeTab === "for_you" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 16 }}>

          {/* People You May Want to Meet - Instagram Style Cards */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={t("discover.meetPeople")}
              action={t("common.seeAll")}
              onAction={() => {
                triggerHaptic();
                setActiveTab("people");
              }}
            />
            {aiMatches.isLoading && peopleQuery.isLoading ? (
              <Skeleton height={140} />
            ) : aiMatches.data?.matches && aiMatches.data.matches.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {aiMatches.data.matches.map((m) => (
                  <InstagramProfileCard
                    key={m.profile.id}
                    profile={m.profile}
                    matchReason={`${m.matchPercentage}% match`}
                  />
                ))}
              </ScrollView>
            ) : peopleQuery.data?.people && peopleQuery.data.people.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {peopleQuery.data.people.map((p) => (
                  <InstagramProfileCard key={p.id} profile={p} />
                ))}
              </ScrollView>
            ) : (
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>
                {t("discover.noPeerSuggestions")}
              </Muted>
            )}
          </View>

          {/* Recommended Rooms - Card Carousel */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={t("discover.recommendedRooms")}
              action={t("common.seeAll")}
              onAction={() => {
                triggerHaptic();
                setActiveTab("rooms");
              }}
            />
            {roomsQuery.isLoading ? (
              <Skeleton height={130} />
            ) : roomsQuery.data?.rooms && roomsQuery.data.rooms.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {roomsQuery.data.rooms.map((r) => (
                  <SuggestedRoomCard key={r.id} room={r} />
                ))}
              </ScrollView>
            ) : (
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>{t("discover.noRoomsActive")}</Muted>
            )}
          </View>

          {/* Clubs to Explore */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={t("discover.clubsExplore")}
              action={t("common.seeAll")}
              onAction={() => {
                triggerHaptic();
                setActiveTab("clubs");
              }}
            />
            {clubsQuery.isLoading ? (
              <Skeleton height={64} />
            ) : clubsQuery.data?.clubs && clubsQuery.data.clubs.length > 0 ? (
              clubsQuery.data.clubs.slice(0, 3).map(renderClubRow)
            ) : (
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>{t("discover.noClubsFound")}</Muted>
            )}
          </View>

          {/* Research Opportunities */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={t("discover.researchOpportunities")}
              action={t("common.seeAll")}
              onAction={() => {
                triggerHaptic();
                setActiveTab("research");
              }}
            />
            {researchQuery.isLoading ? (
              <Skeleton height={64} />
            ) : researchQuery.data?.projects && researchQuery.data.projects.length > 0 ? (
              researchQuery.data.projects.slice(0, 3).map(renderResearchRow)
            ) : (
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>
                {t("discover.noResearchFound")}
              </Muted>
            )}
          </View>

          {/* Upcoming Events */}
          <View style={{ gap: 8 }}>
            <SectionHeader
              title={t("discover.upcomingEvents")}
              action={t("common.seeAll")}
              onAction={() => {
                triggerHaptic();
                setActiveTab("events");
              }}
            />
            {eventsQuery.isLoading ? (
              <Skeleton height={64} />
            ) : eventsQuery.data?.events && eventsQuery.data.events.length > 0 ? (
              eventsQuery.data.events.slice(0, 3).map(renderEventRow)
            ) : (
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>{t("discover.noEventsFound")}</Muted>
            )}
          </View>
        </Animated.View>
      )}

      {/* TAB 2: PEOPLE */}
      {activeTab === "people" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 12 }}>
          {/* Card View vs List View Switcher */}
          <View style={s.viewModeHeader}>
            <Text style={[s.viewModeCountText, { color: colors.muted }]}>
              {`${(peopleQuery.data?.people?.length || aiMatches.data?.matches?.length || 0)} ${t("discover.catPeople")}`}
            </Text>
            <View style={[s.viewModeToggleWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setViewMode("card");
                }}
                style={[
                  s.viewModeBtn,
                  viewMode === "card" && [s.viewModeActiveBtn, { backgroundColor: colors.primary }],
                ]}
              >
                <MaterialCommunityIcons
                  name="view-grid"
                  size={15}
                  color={viewMode === "card" ? "#FFFFFF" : colors.muted}
                />
                <Text style={[s.viewModeBtnText, { color: viewMode === "card" ? "#FFFFFF" : colors.muted }]}>
                  {t("discover.cardView", "Card View")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setViewMode("list");
                }}
                style={[
                  s.viewModeBtn,
                  viewMode === "list" && [s.viewModeActiveBtn, { backgroundColor: colors.primary }],
                ]}
              >
                <MaterialCommunityIcons
                  name="format-list-bulleted"
                  size={15}
                  color={viewMode === "list" ? "#FFFFFF" : colors.muted}
                />
                <Text style={[s.viewModeBtnText, { color: viewMode === "list" ? "#FFFFFF" : colors.muted }]}>
                  {t("discover.listView", "List View")}
                </Text>
              </Pressable>
            </View>
          </View>

          {peopleQuery.isLoading || aiMatches.isLoading ? (
            <Skeleton height={140} />
          ) : viewMode === "card" ? (
            <View style={s.peopleCardsGrid}>
              {(aiMatches.data?.matches?.length ?? 0) > 0
                ? aiMatches.data!.matches.map((m) => (
                    <InstagramProfileCard
                      key={m.profile.id}
                      profile={m.profile}
                      matchReason={`${m.matchPercentage}% match`}
                      isCompact
                    />
                  ))
                : peopleQuery.data?.people?.map((p) => (
                    <InstagramProfileCard key={p.id} profile={p} isCompact />
                  ))}
            </View>
          ) : (aiMatches.data?.matches?.length ?? 0) > 0 ? (
            aiMatches.data!.matches.map((m) =>
              renderPersonRow(m.profile, `${m.matchPercentage}% match`),
            )
          ) : (peopleQuery.data?.people?.length ?? 0) > 0 ? (
            peopleQuery.data!.people.map((p) => renderPersonRow(p))
          ) : (
            <Empty title="No people recommendations" detail="Try adding more skills or university details to your profile." />
          )}
        </Animated.View>
      )}

      {/* TAB 3: ROOMS */}
      {activeTab === "rooms" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 12 }}>
          {/* Card View vs List View Switcher */}
          <View style={s.viewModeHeader}>
            <Text style={[s.viewModeCountText, { color: colors.muted }]}>
              {`${(roomsQuery.data?.rooms?.length || 0)} ${t("discover.catRooms")}`}
            </Text>
            <View style={[s.viewModeToggleWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setViewMode("card");
                }}
                style={[
                  s.viewModeBtn,
                  viewMode === "card" && [s.viewModeActiveBtn, { backgroundColor: colors.primary }],
                ]}
              >
                <MaterialCommunityIcons
                  name="view-grid"
                  size={15}
                  color={viewMode === "card" ? "#FFFFFF" : colors.muted}
                />
                <Text style={[s.viewModeBtnText, { color: viewMode === "card" ? "#FFFFFF" : colors.muted }]}>
                  {t("discover.cardView", "Card View")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setViewMode("list");
                }}
                style={[
                  s.viewModeBtn,
                  viewMode === "list" && [s.viewModeActiveBtn, { backgroundColor: colors.primary }],
                ]}
              >
                <MaterialCommunityIcons
                  name="format-list-bulleted"
                  size={15}
                  color={viewMode === "list" ? "#FFFFFF" : colors.muted}
                />
                <Text style={[s.viewModeBtnText, { color: viewMode === "list" ? "#FFFFFF" : colors.muted }]}>
                  {t("discover.listView", "List View")}
                </Text>
              </Pressable>
            </View>
          </View>

          {roomsQuery.isLoading ? (
            <Skeleton height={130} />
          ) : viewMode === "card" ? (
            <View style={{ gap: 10 }}>
              {roomsQuery.data?.rooms?.map((r) => (
                <SuggestedRoomCard key={r.id} room={r} isFullWidth />
              ))}
            </View>
          ) : (roomsQuery.data?.rooms?.length ?? 0) > 0 ? (
            roomsQuery.data!.rooms.map(renderRoomRow)
          ) : (
            <Empty
              icon="google-classroom"
              title="No study rooms active"
              detail="Create or schedule a room to start collaborating."
            />
          )}
        </Animated.View>
      )}

      {/* TAB 4: CLUBS */}
      {activeTab === "clubs" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 10 }}>
          {clubsQuery.isLoading ? (
            <>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </>
          ) : (clubsQuery.data?.clubs?.length ?? 0) > 0 ? (
            clubsQuery.data!.clubs.map(renderClubRow)
          ) : (
            <Empty
              icon="account-group"
              title="No student clubs found"
              detail="Join or lead a campus student organization."
            />
          )}
        </Animated.View>
      )}

      {/* TAB 5: RESEARCH */}
      {activeTab === "research" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 10 }}>
          {researchQuery.isLoading ? (
            <>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </>
          ) : (researchQuery.data?.projects?.length ?? 0) > 0 ? (
            researchQuery.data!.projects.map(renderResearchRow)
          ) : (
            <Empty title="No research opportunities found" detail="Adjust your research interests or check back later." />
          )}
        </Animated.View>
      )}

      {/* TAB 6: EVENTS */}
      {activeTab === "events" && (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 10 }}>
          {eventsQuery.isLoading ? (
            <>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </>
          ) : (eventsQuery.data?.events?.length ?? 0) > 0 ? (
            eventsQuery.data!.events.map(renderEventRow)
          ) : (
            <Empty title="No upcoming campus events" detail="Workshops and hackathons will appear here." />
          )}
        </Animated.View>
      )}

      {/* EXPLORE SKILLBRIDGE 2-COLUMN TOOLS GRID (Picture 1 & Picture 2) */}
      <View style={s.exploreSection}>
        <View style={s.exploreHeader}>
          <Text style={[s.exploreTitle, { color: colors.text }]}>
            {t("discover.exploreSkillBridge", "Explore SkillBridge")}
          </Text>
          <Text style={[s.exploreSubtitle, { color: colors.muted }]}>
            {t("discover.exploreSub", "Quick access to all campus collaboration tools")}
          </Text>
        </View>

        <View style={s.toolsGrid}>
          {[
            {
              title: t("discover.toolCampusFeed", "Campus Feed"),
              sub: t("discover.toolCampusFeedSub", "Realtime student updates"),
              icon: "newspaper-variant-outline",
              route: "/feed",
            },
            {
              title: t("discover.toolAskHelp", "Ask Help"),
              sub: t("discover.toolAskHelpSub", "Solve doubts with peers"),
              icon: "help-circle-outline",
              route: "/help/questions",
            },
            {
              title: t("discover.toolStartRoom", "Start Room"),
              sub: t("discover.toolStartRoomSub", "Host instant study room"),
              icon: "account-group-outline",
              route: "/room/create",
            },
            {
              title: t("discover.toolSchedule", "Schedule"),
              sub: t("discover.toolScheduleSub", "Calendar & class routine"),
              icon: "calendar-clock-outline",
              route: "/schedule",
            },
            {
              title: t("discover.toolQuiz", "Skill Quizzes"),
              sub: t("discover.toolQuizSub", "Test skills & earn badges"),
              icon: "brain",
              route: "/quiz",
            },
            {
              title: t("discover.toolResearch", "Research Hub"),
              sub: t("discover.toolResearchSub", "Collaborate on projects"),
              icon: "flask-outline",
              route: "/research",
            },
            {
              title: t("discover.toolEvents", "Campus Events"),
              sub: t("discover.toolEventsSub", "Workshops, hackathons"),
              icon: "calendar-star",
              route: "/events",
            },
            {
              title: t("discover.toolSaved", "Saved Items"),
              sub: t("discover.toolSavedSub", "Bookmarks & notes"),
              icon: "bookmark-outline",
              route: "/saved",
            },
            {
              title: t("discover.toolConnections", "Connections"),
              sub: t("discover.toolConnectionsSub", "Find peers & mentors"),
              icon: "account-multiple-outline",
              route: "/connections",
            },
            {
              title: t("discover.toolLeaderboard", "Leaderboard"),
              sub: t("discover.toolLeaderboardSub", "Top teachers & peers"),
              icon: "trophy-outline",
              route: "/leaderboard",
            },
            {
              title: t("discover.toolClubs", "Clubs"),
              sub: t("discover.toolClubsSub", "Join or lead student clubs"),
              icon: "account-group",
              route: "/clubs",
            },
          ].map((item, idx) => (
            <Pressable
              key={idx}
              onPress={() => {
                triggerHaptic();
                router.push(item.route as any);
              }}
              style={({ pressed }) => [
                s.toolCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={[s.toolIconBox, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name={item.icon as any} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.toolCardTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[s.toolCardSub, { color: colors.muted }]} numberOfLines={1}>
                  {item.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  categoryScroll: {
    gap: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  catTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  catTabText: {
    fontSize: 13,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "900",
  },
  iconSquare: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  searchPlaceholderText: {
    fontSize: 13,
    flex: 1,
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  filterChipsScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  viewModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  viewModeCountText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  viewModeToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 2,
  },
  viewModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  viewModeActiveBtn: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  viewModeBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  peopleCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  exploreSection: {
    marginTop: 24,
    marginBottom: 20,
    gap: 12,
  },
  exploreHeader: {
    gap: 2,
  },
  exploreTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  exploreSubtitle: {
    fontSize: 12,
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  toolCard: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  toolIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toolCardTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  toolCardSub: {
    fontSize: 10,
  },
});
