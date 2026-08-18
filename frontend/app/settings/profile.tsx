/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, ErrorState, Field, H1, H2, Muted, Screen, Skeleton } from "@/components/ui";

export default function EditProfile() {
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["me-edit"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");

  useEffect(() => {
    const p = profile.data?.profile;
    if (!p) return;
    setName(p.full_name ?? "");
    setUsername(p.username ?? "");
    setBio(p.bio ?? "");
    setUniversity(p.university ?? "");
    setDepartment(p.department ?? "");
    setBatch(p.batch ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api("/profiles/me", {
      method: "PATCH",
      body: JSON.stringify({
        full_name: name.trim(),
        username: username.trim(),
        bio: bio.trim(),
        university: university.trim(),
        department: department.trim(),
        batch: batch.trim(),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me-edit"] });
      Alert.alert("Profile updated", "Your public SkillBridge profile has been saved.");
    },
    onError: (error) => Alert.alert("Could not save profile", error.message),
  });

  return (
    <Screen>
      <H1>Edit profile</H1>
      <Muted>Keep your academic identity and skill profile clear so recommendations and collaboration matches improve.</Muted>
      {profile.isLoading ? <Skeleton height={260} /> : null}
      {profile.isError ? <ErrorState detail={(profile.error as Error).message} onRetry={() => profile.refetch()} /> : null}
      {profile.data ? (
        <Card>
          <H2>Identity</H2>
          <Field placeholder="Full name" value={name} onChangeText={setName} />
          <Field autoCapitalize="none" placeholder="Username" value={username} onChangeText={setUsername} />
          <Field placeholder="University / institution" value={university} onChangeText={setUniversity} />
          <Field placeholder="Department" value={department} onChangeText={setDepartment} />
          <Field placeholder="Batch / year" value={batch} onChangeText={setBatch} />
          <Field multiline numberOfLines={4} placeholder="Short bio" value={bio} onChangeText={setBio} />
        </Card>
      ) : null}
      <Button title={save.isPending ? "Saving…" : "Save changes"} disabled={save.isPending || name.trim().length < 2 || username.trim().length < 3} onPress={() => save.mutate()} />
    </Screen>
  );
}
