import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Room } from "@/types";
import { Card, Muted, Pill, Row } from "./ui";
import { colors } from "@/theme";
export function RoomCard({ room }: { room: Room }) {
  return (
    <Pressable onPress={() => router.push(`/room/${room.id}`)}>
      <Card>
        <Row>
          <Pill tone={room.status === "live" ? "danger" : "accent"}>
            {room.status.toUpperCase()}
          </Pill>
          <Pill>{room.mode}</Pill>
        </Row>
        <Text style={s.title}>{room.title}</Text>
        <Muted>{room.description}</Muted>
        <View style={s.meta}>
          <Text style={s.metaText}>
            {room.member_count}/{room.capacity} members
          </Text>
          <Text style={s.metaText}>{room.tags.slice(0, 3).join(" · ")}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metaText: { fontSize: 12, color: colors.muted },
});
