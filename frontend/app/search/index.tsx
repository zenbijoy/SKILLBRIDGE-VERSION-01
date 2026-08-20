import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import type { EventItem, Profile, Room } from "@/types";
import { Card, Empty, ErrorState, Field, H2, Muted, Pill, Row, Screen } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { RoomCard } from "@/components/RoomCard";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";

type Result = {
  people: Profile[];
  rooms: Room[];
  events: EventItem[];
  skills: { id: string; name: string; category: string }[];
  clubs: { id: string; name: string; description?: string }[];
  research: { id: string; title: string; description?: string }[];
  resources: { id: string; title: string; description?: string }[];
  nextCursor: number | null;
};

const KINDS = ["all", "people", "rooms", "events", "skills", "clubs", "research", "resources"] as const;
type Kind = (typeof KINDS)[number];

export default function GlobalSearch() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const debounced = useDebounce(query.trim(), 280);
  const recentSearches = usePreferencesStore((state) => state.recentSearches);
  const addRecentSearch = usePreferencesStore((state) => state.addRecentSearch);
  const clearRecentSearches = usePreferencesStore((state) => state.clearRecentSearches);

  const result = useInfiniteQuery({
    queryKey: ["search", debounced, kind],
    queryFn: ({ pageParam = 0, signal }) => api<Result>(`/search?${qs({ q: debounced, kind, cursor: pageParam })}`, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: 0,
    enabled: debounced.length >= 2,
  });

  const pages = result.data?.pages ?? [];
  const hasAny = pages.some((page) => page.people.length || page.rooms.length || page.events.length || page.skills.length || page.clubs.length || page.research.length || page.resources.length);

  const submit = (value = query) => {
    const next = value.trim();
    if (next.length >= 2) addRecentSearch(next);
  };

  return (
    <Screen>
      <View style={s.header}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={[s.back, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => submit()}
            placeholder={t("search.placeholder")}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {KINDS.map((item) => (
          <Pressable key={item} onPress={() => setKind(item)}>
            <Pill tone={kind === item ? "primary" : "default"}>{item.charAt(0).toUpperCase() + item.slice(1)}</Pill>
          </Pressable>
        ))}
      </ScrollView>

      {query.trim().length < 2 ? (
        <>
          <Card tone="soft">
            <H2>{t("search.title")}</H2>
            <Muted>{t("search.tip")}</Muted>
          </Card>
          {recentSearches.length ? (
            <Card>
              <View style={s.sectionRow}>
                <H2>{t("search.recent")}</H2>
                <Pressable onPress={clearRecentSearches}><Text style={{ color: colors.primary, fontWeight: "800" }}>{t("search.clear")}</Text></Pressable>
              </View>
              <View style={{ gap: 2 }}>
                {recentSearches.map((item) => (
                  <Pressable key={item} onPress={() => { setQuery(item); submit(item); }} style={s.recentRow}>
                    <MaterialCommunityIcons name="history" size={20} color={colors.muted} />
                    <Text style={{ color: colors.text, flex: 1 }}>{item}</Text>
                    <MaterialCommunityIcons name="arrow-top-left" size={19} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      {result.isLoading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      {result.isError ? <ErrorState detail={(result.error as Error).message} onRetry={() => result.refetch()} /> : null}
      {result.isSuccess && !hasAny ? <Empty title={t("search.noResults")} detail={t("search.noResultsDetail")} /> : null}

      {pages.map((page, pageIndex) => (
        <React.Fragment key={pageIndex}>
          {page.skills.length ? <><H2>Skills</H2><Row>{page.skills.map((skill) => <Pressable key={skill.id} onPress={() => { setQuery(skill.name); submit(skill.name); }}><Pill tone="primary">{skill.name}</Pill></Pressable>)}</Row></> : null}
          {page.people.length ? <><H2>People</H2>{page.people.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}</> : null}
          {page.rooms.length ? <><H2>Rooms</H2>{page.rooms.map((room) => <RoomCard key={room.id} room={room} />)}</> : null}
          {page.events.length ? <><H2>Events</H2>{page.events.map((event) => <Card key={event.id}><H2>{event.title}</H2><Muted>{new Date(event.starts_at).toLocaleString()}</Muted></Card>)}</> : null}
          {page.clubs.length ? <><H2>Clubs</H2>{page.clubs.map((club) => <Pressable key={club.id} onPress={() => router.push("/clubs" as any)}><Card><H2>{club.name}</H2>{club.description ? <Muted numberOfLines={2}>{club.description}</Muted> : null}</Card></Pressable>)}</> : null}
          {page.research.length ? <><H2>Research</H2>{page.research.map((item) => <Pressable key={item.id} onPress={() => router.push("/research" as any)}><Card><H2>{item.title}</H2>{item.description ? <Muted numberOfLines={2}>{item.description}</Muted> : null}</Card></Pressable>)}</> : null}
          {page.resources.length ? <><H2>Resources</H2>{page.resources.map((item) => <Card key={item.id}><H2>{item.title}</H2>{item.description ? <Muted numberOfLines={2}>{item.description}</Muted> : null}</Card>)}</> : null}
        </React.Fragment>
      ))}

      {result.hasNextPage ? (
        <Pressable disabled={result.isFetchingNextPage} onPress={() => result.fetchNextPage()} style={[s.loadMore, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {result.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: "800" }}>Load more</Text>}
        </Pressable>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", gap: 10, alignItems: "center" },
  back: { width: 48, height: 48, borderWidth: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recentRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  loadMore: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
