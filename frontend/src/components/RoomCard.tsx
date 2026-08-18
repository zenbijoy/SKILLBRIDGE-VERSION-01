import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { Card, Muted, Pill, Row } from "./ui";
import { useTheme } from "@/theme";

export function RoomCard({ room }: { room: Room }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => router.push(`/room/${room.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}>
      <Card>
        <Row>
          <Pill tone={room.status === "live" ? "danger" : "primary"}>{room.status === "live" ? "● LIVE" : room.status.toUpperCase()}</Pill>
          <Pill>{room.mode}</Pill>
          {room.tags.slice(0, 1).map((tag) => <Pill key={tag}>{tag}</Pill>)}
        </Row>
        <Text style={[s.title, { color: colors.text }]}>{room.title}</Text>
        <Muted numberOfLines={2}>{room.description}</Muted>
        <View style={s.meta}>
          <View style={s.metaItem}>
            <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.muted} />
            <Text style={[s.metaText, { color: colors.muted }]}>{room.member_count}/{room.capacity}</Text>
          </View>
          <View style={s.metaItem}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={colors.muted} />
            <Text style={[s.metaText, { color: colors.muted }]}>{room.mode}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", lineHeight: 23 },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12, fontWeight: "700" },
});
