import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { Card, Muted, Pill, Row, triggerHaptic } from "./ui";
import { radius, useTheme } from "@/theme";
import { nextGenBadges, nextGenAnimations } from "@/assets/nextgen";

export function RoomCard({ room }: { room: Room }) {
  const { colors } = useTheme();
  const isLive = room.status === "live";
  const fillPercent = Math.min(100, Math.round((room.member_count / Math.max(1, room.capacity)) * 100));

  const handlePress = () => {
    triggerHaptic();
    router.push(`/room/${room.id}` as any);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open room ${room.title}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <Card tone={isLive ? "glow" : "default"} style={[s.cardContainer, isLive && { borderColor: `${colors.danger}60` }]}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Row style={{ gap: 6, flexWrap: "wrap", flex: 1 }}>
            {isLive ? (
              <Row style={{ alignItems: "center", gap: 5 }}>
                <Image
                  source={nextGenAnimations.livePulse}
                  style={{ width: 14, height: 14 }}
                  resizeMode="contain"
                />
                <Image
                  source={nextGenBadges.liveNow}
                  style={{ width: 76, height: 22 }}
                  resizeMode="contain"
                />
              </Row>
            ) : (
              <Pill tone={room.status === "scheduled" ? "warning" : "primary"}>
                {room.status === "scheduled" ? "UPCOMING" : "OPEN"}
              </Pill>
            )}
            <Pill tone="info">
              {room.mode === "online" ? "🌐 Online" : room.mode === "offline" ? "📍 Campus" : "⚡ Hybrid"}
            </Pill>
            {room.topic ? (
              <Pill tone="accent">{room.topic}</Pill>
            ) : null}
          </Row>

          <View style={[s.visibilityBadge, { backgroundColor: `${colors.muted}15` }]}>
            <MaterialCommunityIcons
              name={room.visibility === "public" ? "earth" : room.visibility === "private" ? "lock" : "email-lock"}
              size={13}
              color={colors.muted}
            />
            <Text style={[s.visibilityText, { color: colors.muted }]}>
              {room.visibility === "invite_only" ? "Invite" : room.visibility}
            </Text>
          </View>
        </Row>

        <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>{room.title}</Text>
        {room.description ? (
          <Muted numberOfLines={2} style={s.description}>{room.description}</Muted>
        ) : null}

        {/* Capacity Bar */}
        <View style={s.capacitySection}>
          <View style={[s.capacityTrack, { backgroundColor: `${colors.border}80` }]}>
            <View
              style={[
                s.capacityFill,
                {
                  width: `${fillPercent}%`,
                  backgroundColor: fillPercent > 85 ? colors.danger : colors.primary,
                },
              ]}
            />
          </View>
        </View>

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
              color={room.mode === "online" ? colors.primary : colors.accent}
            />
            <Text numberOfLines={1} style={[s.metaText, { color: colors.textSecondary, maxWidth: 140 }]}>
              {room.campus_location || (room.mode === "online" ? "LiveKit Video" : "On Campus")}
            </Text>
          </View>

          <View style={[s.joinBtn, { backgroundColor: `${colors.primary}18` }]}>
            <Text style={[s.joinBtnText, { color: colors.primary }]}>Enter</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={colors.primary} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  cardContainer: {
    gap: 8,
    marginVertical: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 23,
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  visibilityText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  capacitySection: {
    marginTop: 2,
  },
  capacityTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    width: "100%",
  },
  capacityFill: {
    height: "100%",
    borderRadius: 2,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "700",
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
