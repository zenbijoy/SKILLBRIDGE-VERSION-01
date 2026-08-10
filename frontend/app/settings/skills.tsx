import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import {
  Button,
  Card,
  Field,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
type Skill = { id: string; name: string; category: string };
export default function SkillsEditor() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"known" | "wanted" | "research">("known");
  const q = useQuery({
    queryKey: ["skill-catalog", query],
    queryFn: () =>
      api<{ skills: Skill[] }>(`/catalog/skills?${qs({ q: query })}`),
  });
  const add = useMutation({
    mutationFn: (skill: Skill) =>
      api("/profiles/me/skills", {
        method: "POST",
        body: JSON.stringify({
          skill_id: skill.id,
          kind,
          proficiency: kind === "known" ? 3 : 1,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <Screen>
      <H1>Skills & research interests</H1>
      <Muted>
        Declare what you can teach, what you want to learn, and research topics
        for collaborator matching.
      </Muted>
      <Row>
        {(["known", "wanted", "research"] as const).map((x) => (
          <Button
            key={x}
            title={
              x === "known"
                ? "I can teach"
                : x === "wanted"
                  ? "I want to learn"
                  : "Research"
            }
            variant={kind === x ? "primary" : "secondary"}
            onPress={() => setKind(x)}
          />
        ))}
      </Row>
      <Field
        placeholder="Search skill catalog"
        value={query}
        onChangeText={setQuery}
      />
      <Card>
        <H2>Matching skills</H2>
        {q.data?.skills.map((s) => (
          <Row key={s.id}>
            <Pill tone="accent">{s.category}</Pill>
            <Muted>{s.name}</Muted>
            <Button
              title={`Add to ${kind}`}
              variant="ghost"
              onPress={() => add.mutate(s)}
            />
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
