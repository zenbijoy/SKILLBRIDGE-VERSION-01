import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, H1, H2, Muted, Pill, Screen } from "@/components/ui";
export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{
        notifications: {
          id: string;
          title: string;
          body: string;
          kind: string;
          read_at?: string | null;
          created_at: string;
        }[];
      }>("/notifications"),
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <Screen>
      <H1>Notifications</H1>
      {q.data?.notifications.map((n) => (
        <Card key={n.id}>
          <Pill tone={n.read_at ? "default" : "accent"}>{n.kind}</Pill>
          <H2>{n.title}</H2>
          <Muted>{n.body}</Muted>
          <Muted>{new Date(n.created_at).toLocaleString()}</Muted>
          {!n.read_at ? (
            <Button
              title="Mark read"
              variant="ghost"
              onPress={() => read.mutate(n.id)}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
