import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
export default function Admin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () =>
      api<{
        reports: {
          id: string;
          reason: string;
          status: string;
          created_at: string;
          reporter_id: string;
          target_user_id?: string;
        }[];
      }>("/admin/reports"),
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", action: "reviewed" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reports"] }),
  });
  return (
    <Screen>
      <H1>Moderation console</H1>
      <Muted>
        This route requires moderator/admin authorization on the server.
      </Muted>
      {q.data?.reports.map((r) => (
        <Card key={r.id}>
          <Row>
            <Pill tone={r.status === "open" ? "danger" : "accent"}>
              {r.status}
            </Pill>
            <Muted>{new Date(r.created_at).toLocaleString()}</Muted>
          </Row>
          <H2>{r.reason}</H2>
          <Button title="Resolve" onPress={() => resolve.mutate(r.id)} />
        </Card>
      ))}
    </Screen>
  );
}
