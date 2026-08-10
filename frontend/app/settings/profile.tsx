import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, Field, H1, H2, Muted, Screen } from "@/components/ui";
export default function EditProfile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["me-edit"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [university, setUniversity] = useState("");
  useEffect(() => {
    const p = q.data?.profile;
    if (p) {
      setName(p.full_name);
      setUsername(p.username);
      setBio(p.bio ?? "");
      setUniversity(p.university ?? "");
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      api("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: name, username, bio, university }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      Alert.alert("Saved");
    },
  });
  return (
    <Screen>
      <H1>Edit profile</H1>
      <Muted>
        Profile data is stored in PostgreSQL with row-level security.
      </Muted>
      <Card>
        <H2>Identity</H2>
        <Field placeholder="Full name" value={name} onChangeText={setName} />
        <Field
          autoCapitalize="none"
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />
        <Field
          placeholder="University"
          value={university}
          onChangeText={setUniversity}
        />
        <Field multiline placeholder="Bio" value={bio} onChangeText={setBio} />
      </Card>
      <Button
        title={save.isPending ? "Saving…" : "Save changes"}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}
