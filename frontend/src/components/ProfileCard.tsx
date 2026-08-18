import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Profile } from "@/types";
import { Card, Muted, Pill, Row } from "./ui";
import { radius, useTheme } from "@/theme";

function Initials({ name }: { name: string }) {
  const { colors } = useTheme();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SB";
  return <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>{initials}</Text></View>;
}

export function ProfileCard({ profile }: { profile: Profile }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => router.push(`/user/${profile.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}>
      <Card>
        <View style={s.top}>
          {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} /> : <Initials name={profile.full_name} />}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[s.name, { color: colors.text }]}>{profile.full_name}</Text>
            <Muted numberOfLines={1}>@{profile.username}{profile.university ? ` · ${profile.university}` : ""}</Muted>
          </View>
          <Pill tone="primary">{profile.reputation} rep</Pill>
        </View>
        {profile.bio ? <Muted numberOfLines={2}>{profile.bio}</Muted> : null}
        <Row>
          {profile.roles.slice(0, 2).map((role) => <Pill key={role}>{role.replace("_", " ")}</Pill>)}
        </Row>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "800" },
});
