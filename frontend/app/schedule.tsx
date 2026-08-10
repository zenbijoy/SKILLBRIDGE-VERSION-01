import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Session } from "@/types";
import {
  Button,
  Card,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
export default function Schedule() {
  const q = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api<{ sessions: Session[] }>("/sessions/mine"),
  });
  return (
    <Screen>
      <H1>Session calendar</H1>
      <Muted>
        Confirmed online/offline learning sessions, reminders and attendance.
      </Muted>
      {q.data?.sessions.map((s) => (
        <Card key={s.id}>
          <Row>
            <Pill tone={s.status === "live" ? "danger" : "accent"}>
              {s.status}
            </Pill>
            <Pill>{s.mode}</Pill>
          </Row>
          <H2>{new Date(s.starts_at).toLocaleString()}</H2>
          <Muted>
            {s.campus_location ||
              s.meeting_url ||
              "Location set after confirmation"}
          </Muted>
          {s.status === "scheduled" ? (
            <Button title="Add reminder" variant="secondary" />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
