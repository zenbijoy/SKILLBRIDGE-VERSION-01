import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import type { Profile, Room, EventItem } from "@/types";
import { Card, Field, H1, H2, Muted, Pill, Row, Screen } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { RoomCard } from "@/components/RoomCard";
type Result = {
  people: Profile[];
  rooms: Room[];
  events: EventItem[];
  skills: { id: string; name: string; category: string }[];
};
export default function Discover() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const q = useQuery({
    queryKey: ["search", query, kind],
    queryFn: () => api<Result>(`/search?${qs({ q: query, kind })}`),
    enabled: query.trim().length >= 2,
  });
  return (
    <Screen>
      <H1>Discover your network</H1>
      <Muted>
        Search people, skills, research interests, rooms and seminars.
      </Muted>
      <Field
        placeholder="Try: thermodynamics, ML, calculus…"
        value={query}
        onChangeText={setQuery}
      />
      <Row>
        {["all", "people", "rooms", "events", "skills"].map((x) => (
          <Pill key={x} tone={kind === x ? "accent" : "default"}>
            {x}
          </Pill>
        ))}
      </Row>
      {query.length < 2 ? (
        <Card>
          <H2>Smart discovery</H2>
          <Muted>
            Type at least two characters. Results exclude blocked users and
            private content.
          </Muted>
        </Card>
      ) : null}
      {q.data?.skills?.length ? (
        <>
          <H2>Skills & interests</H2>
          <Row>
            {q.data.skills.map((s) => (
              <Pill key={s.id} tone="accent">
                {s.name}
              </Pill>
            ))}
          </Row>
        </>
      ) : null}
      {q.data?.people?.length ? (
        <>
          <H2>People</H2>
          {q.data.people.map((p) => (
            <ProfileCard key={p.id} profile={p} />
          ))}
        </>
      ) : null}
      {q.data?.rooms?.length ? (
        <>
          <H2>Rooms</H2>
          {q.data.rooms.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </>
      ) : null}
      {q.data?.events?.length ? (
        <>
          <H2>Events</H2>
          {q.data.events.map((e) => (
            <Card key={e.id}>
              <H2>{e.title}</H2>
              <Muted>{new Date(e.starts_at).toLocaleString()}</Muted>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
