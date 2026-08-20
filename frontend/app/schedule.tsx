import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { EventItem, Room, Session } from "@/types";
import { Button, Card, Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { router } from "expo-router";

type ScheduleItem = {
  id: string;
  kind: "session" | "room" | "event";
  title: string;
  subtitle?: string;
  startsAt: string;
  locationOrUrl?: string;
  status: string;
  mode?: string;
  roomId?: string;
};

const FILTERS = [
  { key: "all", label: "🗓️ All Events" },
  { key: "sessions", label: "👥 Peer Classes" },
  { key: "rooms", label: "🏫 Study Rooms" },
  { key: "events", label: "🎪 Club Seminars" },
];

export default function Schedule() {
  const { colors, isDark } = useTheme();
  const [filter, setFilter] = useState("all");

  const sessionsQuery = useQuery({
    queryKey: ["sessions-mine"],
    queryFn: () => api<{ sessions: Session[] }>("/sessions/mine"),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms-schedule"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms?limit=30"),
  });

  const eventsQuery = useQuery({
    queryKey: ["events-schedule"],
    queryFn: () => api<{ events: EventItem[] }>("/events"),
  });

  const isLoading = sessionsQuery.isLoading || roomsQuery.isLoading || eventsQuery.isLoading;

  // Merge into unified timeline
  const items: ScheduleItem[] = [];

  for (const s of sessionsQuery.data?.sessions ?? []) {
    items.push({
      id: `session-${s.id}`,
      kind: "session",
      title: `Peer Session: ${s.mode.toUpperCase()}`,
      subtitle: s.campus_location || s.meeting_url || "Online room",
      startsAt: s.starts_at,
      locationOrUrl: s.meeting_url || s.campus_location || undefined,
      status: s.status,
      mode: s.mode,
      roomId: s.room_id,
    });
  }

  for (const r of roomsQuery.data?.rooms ?? []) {
    if (r.scheduled_at) {
      items.push({
        id: `room-${r.id}`,
        kind: "room",
        title: `Room: ${r.title}`,
        subtitle: `Topic: ${r.topic} · ${r.member_count} members`,
        startsAt: r.scheduled_at,
        locationOrUrl: r.campus_location || "LiveKit Classroom",
        status: r.status,
        mode: r.mode,
        roomId: r.id,
      });
    }
  }

  for (const e of eventsQuery.data?.events ?? []) {
    items.push({
      id: `event-${e.id}`,
      kind: "event",
      title: `Seminar: ${e.title}`,
      subtitle: e.description,
      startsAt: e.starts_at,
      locationOrUrl: e.location || "Campus Auditorium",
      status: e.status,
      mode: e.location ? "offline" : "online",
    });
  }

  // Sort chronologically
  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const filteredItems = items.filter((item) => {
    if (filter === "sessions") return item.kind === "session";
    if (filter === "rooms") return item.kind === "room";
    if (filter === "events") return item.kind === "event";
    return true;
  });

  return (
    <Screen>
      <H1>Campus Calendar & Schedule 📅</H1>
      <Muted>
        Consolidated timeline of your peer tutoring sessions, study room live classes, and club seminars.
      </Muted>

      {/* Filter Tabs */}
      <View style={s.filterBar}>
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                triggerHaptic();
                setFilter(f.key);
              }}
              style={[
                s.filterTab,
                {
                  backgroundColor: selected ? colors.primary : colors.surface2,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? colors.white : colors.text,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </>
      ) : null}

      {filteredItems.map((item) => {
        const isLive = item.status === "live";
        const dateStr = new Date(item.startsAt).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const timeStr = new Date(item.startsAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <Card key={item.id} tone={isLive ? "glow" : "soft"}>
            <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
              <Row>
                <Pill tone={isLive ? "danger" : item.kind === "event" ? "accent" : "primary"}>
                  {isLive ? "● LIVE NOW" : item.kind.toUpperCase()}
                </Pill>
                {item.mode ? <Pill>{item.mode}</Pill> : null}
              </Row>
              <Text style={[s.dateTag, { color: colors.primary }]}>{dateStr}</Text>
            </Row>

            <View style={{ gap: 4, marginTop: 4 }}>
              <Text style={[s.itemTitle, { color: colors.text }]}>{item.title}</Text>
              {item.subtitle ? <Muted numberOfLines={2}>{item.subtitle}</Muted> : null}
            </View>

            <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <View style={s.timeRow}>
                <MaterialCommunityIcons name="clock-outline" size={16} color={colors.muted} />
                <Text style={[s.timeText, { color: colors.text }]}>{timeStr}</Text>
              </View>

              {item.roomId ? (
                <Button
                  title={isLive ? "Join Live Class →" : "View Room →"}
                  compact
                  variant={isLive ? "primary" : "secondary"}
                  onPress={() => {
                    triggerHaptic();
                    if (isLive) {
                      router.push(`/live/${item.roomId}` as any);
                    } else {
                      router.push(`/room/${item.roomId}` as any);
                    }
                  }}
                />
              ) : item.locationOrUrl?.startsWith("http") ? (
                <Button
                  title="Open Link ↗"
                  compact
                  variant="secondary"
                  onPress={() => {
                    Linking.openURL(item.locationOrUrl!).catch(() => undefined);
                  }}
                />
              ) : null}
            </Row>
          </Card>
        );
      })}

      {filteredItems.length === 0 && !isLoading ? (
        <Empty
          title="No upcoming events"
          detail="No scheduled classes, rooms, or seminars match this filter. Create a room or volunteer to teach to add to your calendar."
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  filterBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  itemTitle: { fontSize: 16, fontWeight: "800" },
  dateTag: { fontSize: 12, fontWeight: "900" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  timeText: { fontSize: 13, fontWeight: "700" },
});
