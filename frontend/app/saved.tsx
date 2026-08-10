import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, H1, H2, Muted, Pill, Screen } from "@/components/ui";
export default function Saved() {
  const q = useQuery({
    queryKey: ["saved"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          entity_type: string;
          entity_id: string;
          title: string;
          subtitle?: string;
        }[];
      }>("/saved"),
  });
  return (
    <Screen>
      <H1>Saved</H1>
      <Muted>Your bookmarked rooms, resources, people and events.</Muted>
      {q.data?.items.map((i) => (
        <Card key={i.id}>
          <Pill tone="accent">{i.entity_type}</Pill>
          <H2>{i.title}</H2>
          {i.subtitle ? <Muted>{i.subtitle}</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}
