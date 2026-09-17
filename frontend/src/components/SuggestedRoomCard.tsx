import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { Pill, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { nextGenAnimations } from "@/assets/nextgen";

interface SuggestedRoomCardProps {
  room: Room;
  isFullWidth?: boolean;
}

export function SuggestedRoomCard({ room, isFullWidth = false }: SuggestedRoomCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const isLive = room.status === "live";

  const handleJoin = (e: any) => {
    e.stopPropagation?.();
    triggerHaptic();
    router.push(`/room/${room.id}` as any);
  };

  return (
    <Pressable
      onPress={handleJoin}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
          width: isFullWidth ? "100%" : 220,
        },
      ]}
    >
      {/* Top Row: Topic and Live / Mode Badge */}
      <View style={styles.topRow}>
        <View style={[styles.topicBadge, { backgroundColor: colors.primarySoft }]}>
          <MaterialCommunityIcons name="door-open" size={13} color={colors.primary} />
          <Text style={[styles.topicText, { color: colors.primary }]} numberOfLines={1}>
            {room.topic || "General"}
          </Text>
        </View>

        {isLive ? (
          <View style={styles.liveIndicator}>
            <Image
              source={nextGenAnimations.livePulse}
              style={{ width: 12, height: 12 }}
              resizeMode="contain"
            />
            <Pill tone="danger">LIVE</Pill>
          </View>
        ) : (
          <Text style={[styles.modeText, { color: colors.muted }]}>
            {room.mode === "offline" ? "🏛️ Campus" : "🌐 Online"}
          </Text>
        )}
      </View>

      {/* Room Title */}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {room.title}
      </Text>

      {/* Description or Campus Location */}
      <Text style={[styles.desc, { color: colors.muted }]} numberOfLines={1}>
        {room.campus_location || room.description || `${room.member_count} active members`}
      </Text>

      {/* Bottom Row: Member Count & Join Button */}
      <View style={[styles.bottomRow, { borderTopColor: colors.border }]}>
        <View style={styles.memberCount}>
          <MaterialCommunityIcons name="account-multiple" size={15} color={colors.muted} />
          <Text style={[styles.memberCountText, { color: colors.muted }]}>
            {room.member_count} {t("discover.members", "members")}
          </Text>
        </View>

        <Pressable
          onPress={handleJoin}
          style={({ pressed }) => [
            styles.joinBtn,
            {
              backgroundColor: isLive ? colors.primary : colors.surface2,
              borderColor: isLive ? colors.primary : colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.joinBtnText,
              { color: isLive ? "#FFFFFF" : colors.text },
            ]}
          >
            {isLive ? t("discover.join", "Join") : t("discover.view", "View")}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginRight: 10,
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  topicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    maxWidth: 130,
  },
  topicText: {
    fontSize: 11,
    fontWeight: "700",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 4,
  },
  desc: {
    fontSize: 11,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  memberCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  memberCountText: {
    fontSize: 11,
    fontWeight: "600",
  },
  joinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  joinBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
