import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
type Club = {
  id: string;
  name: string;
  description?: string;
  university?: string;
  verified: boolean;
};
export default function Clubs() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const q = useQuery({
    queryKey: ["clubs"],
    queryFn: () => api<{ clubs: Club[] }>("/clubs"),
  });
  const create = useMutation({
    mutationFn: () =>
      api("/clubs", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: "Student-led organization",
          university: "",
        }),
      }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
  return (
    <Screen>
      <H1>Clubs & organizations</H1>
      <Muted>
        Club owners/admins can publish seminars and review applications. Public
        verification is a moderator process.
      </Muted>
      <Card>
        <H2>Create organization</H2>
        <Field placeholder="Club name" value={name} onChangeText={setName} />
        <Button
          title="Create club"
          disabled={name.length < 3}
          onPress={() => create.mutate()}
        />
      </Card>
      {q.data?.clubs.map((c) => (
        <Card key={c.id}>
          <Row>
            <Pill tone={c.verified ? "accent" : "warning"}>
              {c.verified ? "verified" : "verification pending"}
            </Pill>
          </Row>
          <H2>{c.name}</H2>
          <Muted>{c.description}</Muted>
          <Muted>{c.university}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
