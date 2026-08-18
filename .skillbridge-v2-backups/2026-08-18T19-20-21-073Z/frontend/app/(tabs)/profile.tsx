import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
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
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";
export default function ProfileScreen() {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{
        profile: Profile;
        skillsKnown: { name: string }[];
        skillsWanted: { name: string }[];
      }>("/profiles/me"),
  });
  const p = q.data?.profile;
  return (
    <Screen>
      <H1>{p?.full_name ?? "Your profile"}</H1>
      <Muted>
        {p
          ? `@${p.username} · ${p.university ?? "University not set"}`
          : "Loading profile…"}
      </Muted>
      {p && (
        <Muted style={{ marginTop: 4 }}>
          Profile Completion: {
            Math.round(
              ["full_name", "username", "bio", "avatar_url", "university", "department", "batch", "location"]
                .filter(k => !!(p as any)[k]).length / 8 * 100
            )
          }%
        </Muted>
      )}
      <Card>
        <H2>Reputation</H2>
        <Text style={s.rep}>{p?.reputation ?? 0}</Text>
        <Row>
          {p?.roles.map((r) => (
            <Pill key={r} tone="accent">
              {r.replace("_", " ")}
            </Pill>
          ))}
        </Row>
      </Card>
      <Card>
        <H2>I can teach</H2>
        <Row>
          {q.data?.skillsKnown?.map((s) => (
            <Pill key={s.name}>{s.name}</Pill>
          ))}
        </Row>
        <H2>I want to learn</H2>
        <Row>
          {q.data?.skillsWanted?.map((s) => (
            <Pill key={s.name}>{s.name}</Pill>
          ))}
        </Row>
      </Card>
      <Button
        title="Edit profile"
        variant="secondary"
        onPress={() => router.push("/settings/profile")}
      />
      <Button
        title="Skills & research interests"
        variant="secondary"
        onPress={() => router.push("/settings/skills")}
      />
      <Button
        title="Privacy, block & safety"
        variant="secondary"
        onPress={() => router.push("/settings/privacy")}
      />
      <Button
        title="Notifications"
        variant="secondary"
        onPress={() => router.push("/notifications")}
      />
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() => supabase.auth.signOut()}
      />
    </Screen>
  );
}
const s = StyleSheet.create({
  rep: { fontSize: 36, fontWeight: "900", color: colors.accent },
});
