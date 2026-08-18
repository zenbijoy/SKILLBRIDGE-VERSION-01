import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import type { EventItem } from "@/types";
import {
  Button,
  Card,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
import { useTheme } from "@/theme";
export default function Events() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["events"],
    queryFn: () => api<{ events: EventItem[] }>("/events"),
  });
  const apply = useMutation({
    mutationFn: (id: string) =>
      api(`/events/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({
          answers: { motivation: "Interested in joining" },
        }),
      }),
    onSuccess: () => {
      Alert.alert("Application submitted");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  return (
    <Screen>
      <H1>Clubs, seminars & workshops</H1>
      <Muted>
        Verified organizations can publish events, collect structured
        applications, approve/reject applicants and trigger status
        notifications.
      </Muted>
      {q.data?.events?.map((e) => (
        <Card key={e.id}>
          <Row>
            <Pill tone="accent">{e.status}</Pill>
            {e.application_required ? (
              <Pill>approval required</Pill>
            ) : (
              <Pill>instant registration</Pill>
            )}
          </Row>
          <Text style={[s.title, { color: colors.text }]}>{e.title}</Text>
          <Muted>{e.description}</Muted>
          <Muted>
            {new Date(e.starts_at).toLocaleString()} · {e.location || "Online"}
          </Muted>
          <Button
            title={e.application_required ? "Apply" : "Register"}
            onPress={() => apply.mutate(e.id)}
          />
        </Card>
      ))}
    </Screen>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800" },
});
