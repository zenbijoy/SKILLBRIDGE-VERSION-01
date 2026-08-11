import React, { useState } from "react";
import { Pressable, ActivityIndicator, ScrollView, Text } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import type { Profile, Room, EventItem } from "@/types";
import { Card, Field, H1, H2, Muted, Pill, Row, Screen } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { RoomCard } from "@/components/RoomCard";

type Result = {
  people: Profile[];
  rooms: Room[];
  events: EventItem[];
  skills: { id: string; name: string; category: string }[];
  clubs: any[];
  research: any[];
  resources: any[];
  nextCursor: number | null;
};

const KINDS = ["all", "people", "rooms", "events", "skills", "clubs", "research", "resources"] as const;
type Kind = typeof KINDS[number];

export default function Discover() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [kind, setKind] = useState<Kind>("all");

  const q = useInfiniteQuery({
    queryKey: ["search", debouncedQuery, kind],
    queryFn: ({ pageParam = 0, signal }) => 
      api<Result>(`/search?${qs({ q: debouncedQuery, kind, cursor: pageParam })}`, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    enabled: debouncedQuery.trim().length >= 2,
  });

  const isEmpty = q.isSuccess && 
    q.data.pages.every(page => 
      !page.people.length && 
      !page.rooms.length && 
      !page.events.length && 
      !page.skills.length &&
      !page.clubs.length &&
      !page.research.length &&
      !page.resources.length
    );

  return (
    <Screen>
      <ScrollView>
        <H1>Discover your network</H1>
        <Muted>
          Search people, skills, research interests, rooms and seminars.
        </Muted>
        
        <Field
          placeholder="Try: thermodynamics, ML, calculus…"
          value={query}
          onChangeText={setQuery}
        />
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
          <Row>
            {KINDS.map((x) => (
              <Pressable key={x} onPress={() => setKind(x)}>
                <Pill tone={kind === x ? "accent" : "default"}>
                  {x}
                </Pill>
              </Pressable>
            ))}
          </Row>
        </ScrollView>

        {query.length < 2 ? (
          <Card>
            <H2>Smart discovery</H2>
            <Muted>
              Type at least two characters. Results exclude blocked users and
              private content.
            </Muted>
          </Card>
        ) : null}

        {q.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 20 }} />
        ) : null}

        {q.isError ? (
          <Card>
            <H2 style={{ color: 'red' }}>Error loading results</H2>
            <Muted>{(q.error as Error).message}</Muted>
          </Card>
        ) : null}

        {query.length >= 2 && isEmpty ? (
          <Card>
            <H2>No results found</H2>
            <Muted>Try adjusting your search query or filters.</Muted>
          </Card>
        ) : null}

        {q.data?.pages.map((page, i) => (
          <React.Fragment key={i}>
            {page.skills?.length ? (
              <>
                <H2>Skills & interests</H2>
                <Row>
                  {page.skills.map((s: any) => (
                    <Pill key={s.id} tone="accent">
                      {s.name}
                    </Pill>
                  ))}
                </Row>
              </>
            ) : null}

            {page.people?.length ? (
              <>
                <H2>People</H2>
                {page.people.map((p: any) => (
                  <ProfileCard key={p.id} profile={p} />
                ))}
              </>
            ) : null}

            {page.rooms?.length ? (
              <>
                <H2>Rooms</H2>
                {page.rooms.map((r: any) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </>
            ) : null}

            {page.events?.length ? (
              <>
                <H2>Events</H2>
                {page.events.map((e: any) => (
                  <Card key={e.id}>
                    <H2>{e.title}</H2>
                    <Muted>{new Date(e.starts_at).toLocaleString()}</Muted>
                  </Card>
                ))}
              </>
            ) : null}
            
            {page.clubs?.length ? (
              <>
                <H2>Clubs</H2>
                {page.clubs.map((c: any) => (
                  <Card key={c.id}>
                    <H2>{c.name}</H2>
                    <Muted>{c.description}</Muted>
                  </Card>
                ))}
              </>
            ) : null}
            
            {page.research?.length ? (
              <>
                <H2>Research</H2>
                {page.research.map((r: any) => (
                  <Card key={r.id}>
                    <H2>{r.title}</H2>
                    <Muted>{r.description}</Muted>
                  </Card>
                ))}
              </>
            ) : null}
            
            {page.resources?.length ? (
              <>
                <H2>Resources</H2>
                {page.resources.map((r: any) => (
                  <Card key={r.id}>
                    <H2>{r.title}</H2>
                    <Muted>{r.description}</Muted>
                  </Card>
                ))}
              </>
            ) : null}
          </React.Fragment>
        ))}

        {q.hasNextPage ? (
          <Pressable onPress={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} style={{ padding: 16, alignItems: 'center' }}>
            {q.isFetchingNextPage ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: '#007AFF' }}>Load More</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
