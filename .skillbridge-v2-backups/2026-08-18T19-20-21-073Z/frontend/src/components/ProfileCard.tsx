import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import type { Profile } from "@/types";
import { Card, Muted, Pill, Row } from "./ui";
import { colors } from "@/theme";
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <Pressable onPress={() => router.push(`/user/${profile.id}`)}>
      <Card>
        <Row>
          <Pill tone="accent">{profile.reputation} rep</Pill>
          {profile.roles.slice(0, 2).map((r) => (
            <Pill key={r}>{r.replace("_", " ")}</Pill>
          ))}
        </Row>
        <Text style={s.name}>{profile.full_name}</Text>
        <Muted>
          @{profile.username}
          {profile.university ? ` · ${profile.university}` : ""}
        </Muted>
        {profile.bio ? <Muted>{profile.bio}</Muted> : null}
      </Card>
    </Pressable>
  );
}
const s = StyleSheet.create({
  name: { fontSize: 17, fontWeight: "800", color: colors.text },
});
