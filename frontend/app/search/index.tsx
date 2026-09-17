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
import { useInfiniteQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { api, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { Card, Empty, ErrorState, Field, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";

export type SearchItem = {
  kind: "person" | "room" | "event" | "skill" | "club" | "research" | "resource";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  score: number;
  metadata: Record<string, any>;
};

type SearchResponse = {
  results: SearchItem[];
  total: number;
  nextCursor: number | null;
  query: string;
  kind: string;
};

const CATEGORIES = [
  { key: "all", label: "All", apiKind: "all" },
  { key: "people", label: "People", apiKind: "person" },
  { key: "rooms", label: "Rooms", apiKind: "room" },
  { key: "clubs", label: "Clubs", apiKind: "club" },
  { key: "research", label: "Research", apiKind: "research" },
  { key: "events", label: "Events", apiKind: "event" },
  { key: "resources", label: "Resources", apiKind: "resource" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function UniversalSearchScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const debounced = useDebounce(query.trim(), 300);

  const recentSearches = usePreferencesStore((state) => state.recentSearches);
  const addRecentSearch = usePreferencesStore((state) => state.addRecentSearch);
  const removeRecentSearch = usePreferencesStore((state) => state.removeRecentSearch);
  const clearRecentSearches = usePreferencesStore((state) => state.clearRecentSearches);

  const activeCategoryObj = CATEGORIES.find((c) => c.key === activeCategory) || CATEGORIES[0];

  const searchResult = useInfiniteQuery({
    queryKey: ["universal-search", debounced, activeCategoryObj.apiKind],
    queryFn: ({ pageParam = 0, signal }) =>
      api<SearchResponse>(
        `/search?${qs({
          q: debounced,
          kind: activeCategoryObj.apiKind,
          cursor: pageParam,
          limit: 20,
        })}`,
        { signal },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: 0,
    enabled: debounced.length >= 2,
  });

  const submit = (value = query) => {
    const next = value.trim();
    if (next.length >= 2) addRecentSearch(next);
  };

  const handleEntityPress = (item: SearchItem) => {
    triggerHaptic();
    submit(query);

    switch (item.kind) {
      case "person":
        router.push(`/user/${item.id}` as any);
        break;
      case "room":
        router.push(`/room/${item.id}` as any);
        break;
      case "club":
        router.push(`/club/${item.id}` as any);
        break;
      case "research":
        router.push(`/research/${item.id}` as any);
        break;
      case "event":
        router.push(`/event/${item.id}` as any);
        break;
      case "resource":
        if (item.metadata?.room_id) {
          router.push(`/room/${item.metadata.room_id}` as any);
        } else {
          router.push("/saved" as any);
        }
        break;
      case "skill":
        setQuery(item.title);
        submit(item.title);
        break;
    }
  };

  const pages = searchResult.data?.pages ?? [];
  const allItems: SearchItem[] = pages.flatMap((p) => p.results);

  // Group by category for the "All" view
  const groupedResults = {
    people: allItems.filter((i) => i.kind === "person"),
    rooms: allItems.filter((i) => i.kind === "room"),
    clubs: allItems.filter((i) => i.kind === "club"),
    research: allItems.filter((i) => i.kind === "research"),
    events: allItems.filter((i) => i.kind === "event"),
    resources: allItems.filter((i) => i.kind === "resource"),
  };

  const getEntityIcon = (kind: SearchItem["kind"]) => {
    switch (kind) {
      case "person":
        return "account-outline";
      case "room":
        return "door-open";
      case "club":
        return "account-group-outline";
      case "research":
        return "flask-outline";
      case "event":
        return "calendar-star";
      case "resource":
        return "file-document-outline";
      case "skill":
        return "school-outline";
    }
  };

  const renderResultRow = (item: SearchItem) => (
    <Pressable
      key={`${item.kind}-${item.id}`}
      onPress={() => handleEntityPress(item)}
      style={({ pressed }) => [
        s.resultRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={s.avatarImg} />
        ) : (
          <MaterialCommunityIcons name={getEntityIcon(item.kind) as any} size={20} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <Text style={[s.resultTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Pill tone="default">{item.kind.toUpperCase()}</Pill>
        </Row>
        {item.subtitle ? (
          <Muted numberOfLines={1} style={{ fontSize: 12 }}>
            {item.subtitle}
          </Muted>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <Screen>
      {/* Top Search Bar */}
      <View style={s.header}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => {
            triggerHaptic();
            router.back();
          }}
          style={[s.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => submit()}
            placeholder={t("search.placeholder") || "Search people, rooms, clubs, events..."}
            returnKeyType="search"
            leftIcon="magnify"
            clearable
            onClear={() => setQuery("")}
          />
        </View>
      </View>

      {/* Category Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryScroll}
      >
        {CATEGORIES.map((cat) => {
          const isSelected = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => {
                triggerHaptic();
                setActiveCategory(cat.key);
              }}
            >
              <Pill tone={isSelected ? "primary" : "default"}>{cat.label}</Pill>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Empty Query / Idle State: Recent Searches & Suggestions */}
      {query.trim().length < 2 ? (
        <Animated.View entering={FadeInUp.duration(250)} style={{ gap: 14 }}>
          {recentSearches.length > 0 ? (
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={{ fontSize: 15 }}>{t("search.recent") || "Recent Searches"}</H2>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    clearRecentSearches();
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                    {t("search.clear") || "Clear all"}
                  </Text>
                </Pressable>
              </Row>
              <View style={{ gap: 2 }}>
                {recentSearches.map((item) => (
                  <Row key={item} style={[s.recentRow, { borderBottomColor: colors.border }]}>
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                      onPress={() => {
                        triggerHaptic();
                        setQuery(item);
                        submit(item);
                      }}
                    >
                      <MaterialCommunityIcons name="history" size={18} color={colors.muted} />
                      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                        {item}
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        triggerHaptic();
                        removeRecentSearch(item);
                      }}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={colors.muted} />
                    </Pressable>
                  </Row>
                ))}
              </View>
            </Card>
          ) : (
            <Card tone="soft" style={{ padding: 16 }}>
              <H2 style={{ fontSize: 15 }}>Universal Campus Search</H2>
              <Muted style={{ fontSize: 13, marginTop: 4 }}>
                Search across students, peer tutors, study rooms, student clubs, research projects, and campus events.
              </Muted>
            </Card>
          )}

          {/* Quick Topics */}
          <View style={{ gap: 8 }}>
            <Muted style={{ fontSize: 13, fontWeight: "700" }}>Popular searches</Muted>
            <Row style={{ flexWrap: "wrap", gap: 8 }}>
              {["Machine Learning", "CSE", "Robotics Club", "Calculus", "Bangla NLP", "Web Development"].map((topic) => (
                <Pressable
                  key={topic}
                  onPress={() => {
                    triggerHaptic();
                    setQuery(topic);
                    submit(topic);
                  }}
                >
                  <Pill tone="default">{topic}</Pill>
                </Pressable>
              ))}
            </Row>
          </View>
        </Animated.View>
      ) : null}

      {/* Loading State */}
      {searchResult.isLoading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      {/* Error State */}
      {searchResult.isError ? (
        <ErrorState detail={(searchResult.error as Error).message} onRetry={() => searchResult.refetch()} />
      ) : null}

      {/* No Results Empty State */}
      {searchResult.isSuccess && allItems.length === 0 ? (
        <Empty
          icon="magnify"
          title={t("search.noResults") || "No results found"}
          detail={t("search.noResultsDetail") || `No matches for "${debounced}". Try searching for another skill, room or peer.`}
        />
      ) : null}

      {/* Active Results: Mode A — "All" Grouped View */}
      {searchResult.isSuccess && activeCategory === "all" && allItems.length > 0 ? (
        <View style={{ gap: 16 }}>
          {/* People Section */}
          {groupedResults.people.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>People ({groupedResults.people.length})</H2>
                <Pressable onPress={() => setActiveCategory("people")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.people.slice(0, 3).map(renderResultRow)}
            </View>
          )}

          {/* Rooms Section */}
          {groupedResults.rooms.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>Study Rooms ({groupedResults.rooms.length})</H2>
                <Pressable onPress={() => setActiveCategory("rooms")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.rooms.slice(0, 3).map(renderResultRow)}
            </View>
          )}

          {/* Clubs Section */}
          {groupedResults.clubs.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>Clubs ({groupedResults.clubs.length})</H2>
                <Pressable onPress={() => setActiveCategory("clubs")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.clubs.slice(0, 3).map(renderResultRow)}
            </View>
          )}

          {/* Research Section */}
          {groupedResults.research.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>Research ({groupedResults.research.length})</H2>
                <Pressable onPress={() => setActiveCategory("research")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.research.slice(0, 3).map(renderResultRow)}
            </View>
          )}

          {/* Events Section */}
          {groupedResults.events.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>Events ({groupedResults.events.length})</H2>
                <Pressable onPress={() => setActiveCategory("events")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.events.slice(0, 3).map(renderResultRow)}
            </View>
          )}

          {/* Resources Section */}
          {groupedResults.resources.length > 0 && (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <H2 style={s.sectionHeader}>Resources ({groupedResults.resources.length})</H2>
                <Pressable onPress={() => setActiveCategory("resources")}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>See all →</Text>
                </Pressable>
              </Row>
              {groupedResults.resources.slice(0, 3).map(renderResultRow)}
            </View>
          )}
        </View>
      ) : null}

      {/* Active Results: Mode B — Specific Category Paginated List */}
      {searchResult.isSuccess && activeCategory !== "all" && allItems.length > 0 ? (
        <View style={{ gap: 8 }}>
          {allItems.map(renderResultRow)}

          {searchResult.hasNextPage ? (
            <Pressable
              disabled={searchResult.isFetchingNextPage}
              onPress={() => searchResult.fetchNextPage()}
              style={[s.loadMoreBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {searchResult.isFetchingNextPage ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary, fontWeight: "800" }}>Load more results</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "700",
  },
  loadMoreBtn: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
});
