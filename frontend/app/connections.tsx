import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/types";
import { api } from "@/lib/api";
import { Button, Card, H1, H2, Muted, Row, Screen } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
type Req = { id: string; requester: Profile };
export default function Connections() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["connections"],
    queryFn: () =>
      api<{ connections: Profile[]; incoming: Req[]; suggested: Profile[] }>(
        "/connections",
      ),
  });
  const respond = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/connections/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
  return (
    <Screen>
      <H1>Your network</H1>
      <H2>Requests</H2>
      {q.data?.incoming.map((r) => (
        <Card key={r.id}>
          <ProfileCard profile={r.requester} />
          <Row>
            <Button
              title="Accept"
              onPress={() => respond.mutate({ id: r.id, status: "accepted" })}
            />
            <Button
              title="Decline"
              variant="secondary"
              onPress={() => respond.mutate({ id: r.id, status: "declined" })}
            />
          </Row>
        </Card>
      ))}
      <H2>Connections</H2>
      {q.data?.connections.map((p) => (
        <ProfileCard key={p.id} profile={p} />
      ))}
      <H2>Suggested</H2>
      <Muted>
        Suggestions use skills, goals, research interests, mutual connections
        and university context.
      </Muted>
      {q.data?.suggested.map((p) => (
        <ProfileCard key={p.id} profile={p} />
      ))}
    </Screen>
  );
}
