import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { Card, Muted, Pill, Row, triggerHaptic } from "./ui";
import { radius, useTheme } from "@/theme";

export function RoomCard({ room }: { room: Room }) {
  const { colors } = useTheme();
  const isLive = room.status === "live";

  const handlePress = () => {
    triggerHaptic();
    router.push(`/room/${room.id}` as any);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <Card tone={isLive ? "glow" : "default"}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <Pill tone={isLive ? "danger" : "primary"}>
              {isLive ? "● LIVE CLASS" : room.status.toUpperCase()}
            </Pill>
            <Pill tone="info">{room.mode}</Pill>
          </Row>
          {room.tags.slice(0, 1).map((tag) => (
            <Pill key={tag} tone="accent">{tag}</Pill>
          ))}
        </Row>
        <Text style={[s.title, { color: colors.text }]}>{room.title}</Text>
        <Muted numberOfLines={2}>{room.description}</Muted>
        <View style={[s.meta, { borderTopColor: colors.divider, borderTopWidth: 1, paddingTop: 10 }]}>
          <View style={s.metaItem}>
            <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.primary} />
            <Text style={[s.metaText, { color: colors.textSecondary }]}>
              {room.member_count}/{room.capacity} members
            </Text>
          </View>
          <View style={s.metaItem}>
            <MaterialCommunityIcons
              name={room.mode === "online" ? "video-outline" : "map-marker-radius-outline"}
              size={16}
              color={colors.accent}
            />
            <Text style={[s.metaText, { color: colors.textSecondary }]}>
              {room.campus_location || room.mode}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", lineHeight: 23 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontWeight: "700" },
});
