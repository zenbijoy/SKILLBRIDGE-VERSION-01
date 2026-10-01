import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import type { Room } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { useAppStore } from "@/state/useAppStore";
import { nextGenAnimations } from "@/assets/nextgen";
import {
  Empty,
  ErrorState,
  Field,
  Muted,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";

type RoomFilter = "all" | "live" | "online" | "campus" | "scheduled" | "mine";

const POPULAR_TOPICS = [
  "Algorithms",
  "Web Dev",
  "Python",
  "Calculus",
  "AI & ML",
  "Exam Prep",
  "Database",
  "System Design",
];

const PAGE_SIZE = 20;

export default function RoomsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();

  // Filter & Search state
  const { mode: userRoleMode, setMode: setUserRoleMode } = useAppStore();
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Debounce search so typing does not fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 350);
  }, []);

  const isMine = filter === "mine";

  // Search + topic + "my rooms" scope are resolved server-side so that
  // pagination and the result count stay correct.
  const roomsQuery = useInfiniteQuery({
    queryKey: ["rooms", filter, isMine, selectedTopic, debouncedSearch.trim()],
    queryFn: ({ pageParam }) =>
      api<{ rooms: Room[]; total: number }>(
        `/rooms?${qs({
          page: pageParam as number,
          limit: PAGE_SIZE,
          mine: isMine ? "true" : undefined,
          topic: selectedTopic ?? undefined,
          q: debouncedSearch.trim() || undefined,
          status: filter === "live" ? "live" : filter === "scheduled" ? "scheduled" : undefined,
          mode: filter === "online" ? "online" : filter === "campus" ? "offline" : undefined,
        })}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * PAGE_SIZE < (lastPage.total ?? 0) ? allPages.length + 1 : undefined,
  });

  const allRooms = useMemo(
    () => roomsQuery.data?.pages.flatMap((p) => p.rooms) ?? [],
    [roomsQuery.data],
  );
  const serverTotal = roomsQuery.data?.pages[0]?.total ?? 0;

  // live/online/campus/scheduled now filtered server-side (correct pagination).
  const filteredRooms = useMemo(() => {
    if (filter === "campus") {
      return allRooms.filter((room) => room.mode === "offline" || room.mode === "hybrid");
    }
    return allRooms;
  }, [allRooms, filter]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = serverTotal;
    const live = allRooms.filter((r) => r.status === "live").length;
    const online = allRooms.filter((r) => r.mode === "online").length;
    const campus = allRooms.filter((r) => r.mode === "offline" || r.mode === "hybrid").length;
    return { total, live, online, campus };
  }, [allRooms, serverTotal]);


  const hasActiveFilters = Boolean(searchQuery.trim()) || filter !== "all" || Boolean(selectedTopic);

  const clearAllFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFilter("all");
    setSelectedTopic(null);
  };

  return (
    <Screen
      header={
        <AppHeader
          searchPlaceholder={t("rooms.searchPlaceholder")}
          actionIcon="plus"
          actionLabel={t("rooms.create")}
          onAction={() => {
            triggerHaptic();
            router.push("/room/create" as any);
          }}
        />
      }
      onRefresh={async () => {
        await roomsQuery.refetch();
      }}
      refreshing={roomsQuery.isRefetching}
    >
      {/* Hero Stats & Quick Action */}
      <View style={s.heroSection}>

        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="door-open" size={18} color={colors.primary} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.total}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.totalRooms")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <Image
                source={nextGenAnimations.livePulse}
                style={{ width: 14, height: 14 }}
                resizeMode="contain"
              />
              <Text style={[s.statValue, { color: colors.danger }]}>{metrics.live}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.liveNow")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="video-outline" size={18} color={colors.info} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.online}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.online")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={colors.accent} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.campus}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.campus")}</Text>
          </View>
        </View>

        {/* Role Toggle: Learn vs Teach Mode */}
        <View style={s.roleSwitcherContainer}>
          <View style={[s.roleToggleWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("rooms.roleLearn", "Learn")}
              onPress={() => {
                if (userRoleMode !== "learn") {
                  triggerHaptic();
                  setUserRoleMode("learn");
                }
              }}
              style={[
                s.roleTab,
                userRoleMode === "learn" && [s.activeRoleTab, { backgroundColor: colors.primary }],
              ]}
            >
              <MaterialCommunityIcons
                name="school-outline"
                size={16}
                color={userRoleMode === "learn" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  s.roleTabText,
                  { color: userRoleMode === "learn" ? "#FFFFFF" : colors.muted },
                  userRoleMode === "learn" && s.activeRoleTabText,
                ]}
              >
                {t("rooms.roleLearn", "Learn")}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("rooms.roleTeach", "Teach")}
              onPress={() => {
                if (userRoleMode !== "teach") {
                  triggerHaptic();
                  setUserRoleMode("teach");
                }
              }}
              style={[
                s.roleTab,
                userRoleMode === "teach" && [s.activeRoleTab, { backgroundColor: colors.primary }],
              ]}
            >
              <MaterialCommunityIcons
                name="human-male-board"
                size={16}
                color={userRoleMode === "teach" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  s.roleTabText,
                  { color: userRoleMode === "teach" ? "#FFFFFF" : colors.muted },
                  userRoleMode === "teach" && s.activeRoleTabText,
                ]}
              >
                {t("rooms.roleTeach", "Teach")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Dynamic Context Banner based on Learn / Teach role */}
        {userRoleMode === "learn" ? (
            <Pressable
              onPress={() => {
                triggerHaptic();
                // Jump to the rooms this user has actually joined, where the real
                // Q&A board (POST /rooms/:id/questions) lives.
                setFilter("mine");
              }}
              style={({ pressed }) => [
                s.launchBanner,
                { backgroundColor: `${colors.info}14`, borderColor: `${colors.info}40`, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
                <View style={[s.launchIconBox, { backgroundColor: colors.info }]}>
                  <MaterialCommunityIcons name="comment-question-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.launchTitle, { color: colors.text }]}>
                    {t("rooms.myRoomsTitle", "My Rooms")}
                  </Text>
                  <Text style={[s.launchSubtitle, { color: colors.muted }]}>
                    {t("rooms.roleLearnBanner", "Ask questions and get help inside the rooms you joined.")}
                  </Text>
                </View>
              </Row>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.info} />
            </Pressable>
          ) : (
          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push("/room/create" as any);
            }}
            style={({ pressed }) => [
              s.launchBanner,
              { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}40`, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
              <View style={[s.launchIconBox, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.launchTitle, { color: colors.text }]}>{t("rooms.hostSessionTitle")}</Text>
                <Text style={[s.launchSubtitle, { color: colors.muted }]}>
                  {t("rooms.roleTeachBanner", "Share your expertise & mentor your campus peers!")}
                </Text>
              </View>
            </Row>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
          </Pressable>
        )}
      </View>


      {/* Server-backed Search (debounced) */}
      <View style={s.searchContainer}>
        <Field
          placeholder={t("rooms.searchInPage")}
          value={searchQuery}
          onChangeText={handleSearchChange}
          leftIcon="magnify"
          clearable={true}
          onClear={() => handleSearchChange("")}
        />
      </View>

      {/* Filter Chips Bar */}
      <View style={s.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersScroll}>
          {(
            [
              { key: "all", label: t("rooms.filterAll"), icon: "view-grid-outline" },
              { key: "live", label: t("rooms.filterLive"), icon: "broadcast" },
              { key: "mine", label: t("rooms.filterMine", "My Rooms"), icon: "account-group-outline" },
              { key: "online", label: t("rooms.filterOnline"), icon: "video-outline" },
              { key: "campus", label: t("rooms.filterCampus"), icon: "map-marker-outline" },
              { key: "scheduled", label: t("rooms.filterUpcoming"), icon: "calendar-clock" },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                triggerHaptic();
                setFilter(item.key);
              }}
              style={[
                s.filterChip,
                {
                  backgroundColor: filter === item.key ? colors.primary : colors.surface,
                  borderColor: filter === item.key ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={14}
                color={filter === item.key ? "#FFFFFF" : colors.muted}
                style={{ marginRight: 5 }}
              />
              <Text
                style={[
                  s.filterChipText,
                  { color: filter === item.key ? "#FFFFFF" : colors.text, fontWeight: filter === item.key ? "800" : "600" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Topic Filter â€” real server-side topic query (no more dead state) */}
      <View style={s.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersScroll}>
          {POPULAR_TOPICS.map((item) => {
            const isActive = selectedTopic === item;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  triggerHaptic();
                  setSelectedTopic(isActive ? null : item);
                }}
                style={[
                  s.filterChip,
                  {
                    backgroundColor: isActive ? colors.accent : "transparent",
                    borderColor: isActive ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.filterChipText,
                    { color: isActive ? "#FFFFFF" : colors.textSecondary, fontWeight: isActive ? "800" : "600" },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Active search / topic summary */}
      {(searchQuery.trim() || selectedTopic) && (
        <Row style={{ gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
          {searchQuery.trim() && (
            <Pressable onPress={() => handleSearchChange("")} style={[s.activeFilterChip, { borderColor: colors.primary }]}>
              <Text style={[s.activeFilterChipText, { color: colors.primary }]}>
                â€œ{searchQuery.trim()}â€  âœ•
              </Text>
            </Pressable>
          )}
          {selectedTopic && (
            <Pressable onPress={() => setSelectedTopic(null)} style={[s.activeFilterChip, { borderColor: colors.accent }]}>
              <Text style={[s.activeFilterChipText, { color: colors.accent }]}>
                #{selectedTopic}  âœ•
              </Text>
            </Pressable>
          )}
        </Row>
      )}

      {/* Loading Skeletons */}
      {roomsQuery.isLoading ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
        </View>
      ) : null}

      {/* Error State */}
      {roomsQuery.isError ? (
        <ErrorState
          title={t("common.error")}
          detail={(roomsQuery.error as Error).message}
          onRetry={() => roomsQuery.refetch()}
        />
      ) : null}

      {/* Empty State */}
      {roomsQuery.isSuccess && filteredRooms.length === 0 ? (
        <Empty
          icon={filter === "mine" ? "account-group-outline" : "google-classroom"}
          title={
            filter === "mine" && !hasActiveFilters
              ? t("rooms.myRoomsEmpty")
              : hasActiveFilters
                ? t("rooms.noMatch")
                : t("rooms.empty")
          }
          detail={
            filter === "mine" && !hasActiveFilters
              ? t("rooms.myRoomsEmptyDetail", "Join a room from the list to see it here and ask questions.")
              : hasActiveFilters
                ? t("rooms.noMatchDetail")
                : t("rooms.emptyDetail")
          }
          actionTitle={hasActiveFilters ? t("rooms.clearFilters") : t("rooms.create")}
          onAction={() => {
            if (hasActiveFilters) {
              clearAllFilters();
            } else {
              router.push("/room/create" as any);
            }
          }}
        />
      ) : null}

      {/* Room Cards List */}
      <View style={s.roomList}>
        {filteredRooms.map((room, idx) => (
          <Animated.View key={room.id} entering={ZoomIn.delay(Math.min(idx * 40, 400)).springify()}>
            <RoomCard room={room} />
          </Animated.View>
        ))}
      </View>

      {/* Pagination - load the rest of the real result set */}
      {roomsQuery.hasNextPage ? (
        <Pressable
          onPress={() => roomsQuery.fetchNextPage()}
          disabled={roomsQuery.isFetchingNextPage}
          style={[s.loadMoreBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          {roomsQuery.isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.loadMoreText, { color: colors.primary }]}>
              {t("rooms.loadMore", "Load more rooms")}
            </Text>
          )}
        </Pressable>
      ) : null}

      {/* Result count */}
      {!hasActiveFilters && allRooms.length > 0 && !roomsQuery.hasNextPage ? (
        <Muted style={{ textAlign: "center", paddingVertical: 12 }}>
          {t("rooms.resultCount", "Showing all {n} rooms").replace("{n}", String(serverTotal))}
        </Muted>
      ) : null}

      {/* Single, unified room creation flow lives in /room/create.
          The list screen only provides the entry point so there is exactly one
          source of truth for creation logic. */}
      <Pressable
        onPress={() => {
          triggerHaptic();
          router.push("/room/create" as any);
        }}
        style={({ pressed }) => [
          s.createFab,
          { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t("rooms.create", "Create room")}
      >
        <MaterialCommunityIcons name="plus" size={26} color="#FFFFFF" />
        <Text style={s.createFabText}>{t("rooms.create", "Create room")}</Text>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  roleSwitcherContainer: {
    alignItems: "center",
    marginBottom: 6,
  },
  roleToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
  },
  roleTab: {
    flexDirection: "row",
    alignItems: "center",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  activeRoleTab: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  activeRoleTabText: {
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  heroSection: {
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 12,
    marginVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 8,
  },
  statCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 4,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  launchBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  launchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  launchTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  launchSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  creatorCard: {
    padding: 16,
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 14,
    marginVertical: 6,
  },
  creatorIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBlock: {
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  topicSuggestions: {
    marginTop: 4,
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 4,
  },
  suggestionScroll: {
    flexDirection: "row",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 6,
    paddingVertical: 2,
  },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modeTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeTileText: {
    fontSize: 12,
  },
  creatorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 10,
    marginTop: 4,
  },
  searchContainer: {
    marginTop: 4,
  },
  filtersContainer: {
    marginVertical: 2,
  },
  filtersScroll: {
    flexDirection: "row",
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
  },
  activeFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  loadMoreBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "800",
  },
  createFab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  createFabText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  roomList: {
    // @ts-ignore â€“ gap not in RN 0.69 types
    gap: 8,
    marginTop: 4,
  },
} as any);
