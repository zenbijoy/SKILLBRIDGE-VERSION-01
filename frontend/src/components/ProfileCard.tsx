import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Profile } from "@/types";
import { Card, Muted, Pill, Row, triggerHaptic } from "./ui";
import { radius, useTheme } from "@/theme";

function Initials({ name }: { name: string }) {
  const { colors } = useTheme();
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SB";
  return (
    <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
      <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>{initials}</Text>
    </View>
  );
}

export function ProfileCard({ profile }: { profile: Profile }) {
  const { colors } = useTheme();

  const handlePress = () => {
    triggerHaptic();
    router.push(`/user/${profile.id}` as any);
  };

  const isTutor = profile.roles.includes("peer_tutor");
  const isResearcher = profile.roles.includes("researcher");

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <Card tone={isTutor ? "glow" : "default"}>
        <View style={s.top}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
          ) : (
            <Initials name={profile.full_name} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[s.name, { color: colors.text }]}>{profile.full_name}</Text>
              {isTutor ? (
                <MaterialCommunityIcons name="check-decagram" size={16} color={colors.primary} />
              ) : null}
            </View>
            <Muted numberOfLines={1}>
              @{profile.username}
              {profile.university ? ` · ${profile.university}` : ""}
            </Muted>
          </View>
          <Pill tone="primary">{profile.reputation} rep</Pill>
        </View>

        {profile.bio ? <Muted numberOfLines={2}>{profile.bio}</Muted> : null}

        <Row>
          {profile.roles.slice(0, 3).map((role) => (
            <Pill
              key={role}
              tone={
                role === "peer_tutor"
                  ? "success"
                  : role === "researcher"
                  ? "accent"
                  : role === "moderator" || role === "admin"
                  ? "danger"
                  : "default"
              }
            >
              {role.replace("_", " ")}
            </Pill>
          ))}
        </Row>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 16, fontWeight: "800" },
});
