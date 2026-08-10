import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Card, H1, Muted, Pill, Row, Screen } from "@/components/ui";
import { colors } from "@/theme";
export default function Leaderboard() {
  const q = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () =>
      api<{ leaders: (Profile & { sessions_taught: number })[] }>(
        "/gamification/leaderboard",
      ),
  });
  return (
    <Screen>
      <H1>Community reputation</H1>
      <Muted>
        Reputation is server-authoritative and earned from verified activity—not
        directly editable by clients.
      </Muted>
      {q.data?.leaders.map((p, i) => (
        <Card key={p.id}>
          <Row>
            <Text style={s.rank}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{p.full_name}</Text>
              <Muted>@{p.username}</Muted>
            </View>
            <Pill tone="accent">{p.reputation} rep</Pill>
            <Pill>{p.sessions_taught} taught</Pill>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
const s = StyleSheet.create({
  rank: { color: colors.accent, fontSize: 20, fontWeight: "900" },
  name: { color: colors.text, fontWeight: "800" },
});
