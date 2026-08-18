import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import type { Dashboard } from "@/types";
import {
  Button,
  Card,
  H2,
  Loading,
  Muted,
  Row,
  Screen,
} from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { ProfileCard } from "@/components/ProfileCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PremiumHero } from "@/components/PremiumHero";
import { useAppStore } from "@/state/useAppStore";
import { colors, radius } from "@/theme";
export default function Home() {
  const { mode, setMode } = useAppStore();
  const q = useQuery({
    queryKey: ["dashboard", mode],
    queryFn: () => api<Dashboard>(`/dashboard?mode=${mode}`),
  });
  if (q.isLoading) return <Loading />;
  const d = q.data;
  return (
    <Screen>
      <PremiumHero
        eyebrow="SKILLBRIDGE CAMPUS NETWORK"
        title={
          mode === "learn"
            ? "What do you want to master?"
            : "Who can you help today?"
        }
        detail="Searchable peer knowledge, realtime rooms, research matches and live collaborative learning."
      >
        <Row>
          <View style={s.mode}>
            <Button
              title="I need help"
              variant={mode === "learn" ? "primary" : "ghost"}
              onPress={() => setMode("learn")}
            />
            <Button
              title="I can help"
              variant={mode === "teach" ? "primary" : "ghost"}
              onPress={() => setMode("teach")}
            />
          </View>
        </Row>
      </PremiumHero>
      <Card>
        <H2>Your momentum</H2>
        <Row>
          <Stat n={d?.stats.reputation ?? 0} label="Reputation" />
          <Stat n={d?.stats.connections ?? 0} label="Connections" />
          <Stat n={d?.stats.sessionsTaught ?? 0} label="Taught" />
          <Stat n={d?.stats.sessionsAttended ?? 0} label="Learned" />
        </Row>
      </Card>
      <H2>Quick access</H2>
      <FeatureGrid />
      <H2>
        {mode === "learn" ? "Urgent learning rooms" : "Open teaching requests"}
      </H2>
      {d?.urgentRooms?.length ? (
        d.urgentRooms.slice(0, 4).map((r) => <RoomCard key={r.id} room={r} />)
      ) : (
        <Muted>No rooms yet. Create the first one.</Muted>
      )}
      <H2>People matched to you</H2>
      {d?.recommendedPeople?.slice(0, 3).map((p) => (
        <ProfileCard key={p.id} profile={p} />
      ))}
      <H2>Upcoming sessions</H2>
      {d?.upcomingSessions?.slice(0, 3).map((x) => (
        <Card key={x.id}>
          <Text style={s.title}>{new Date(x.starts_at).toLocaleString()}</Text>
          <Muted>
            {x.mode} session · status {x.status}
          </Muted>
        </Card>
      ))}
      <H2>Campus events</H2>
      {d?.events?.slice(0, 3).map((e) => (
        <Card key={e.id}>
          <Text style={s.title}>{e.title}</Text>
          <Muted>{new Date(e.starts_at).toLocaleString()}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.n}>{n}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}
const s = StyleSheet.create({
  header: { gap: 14 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  mode: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    flex: 1,
  },
  stat: { minWidth: 70, flex: 1 },
  n: { color: colors.text, fontSize: 22, fontWeight: "900" },
  title: { color: colors.text, fontWeight: "800", fontSize: 16 },
});
