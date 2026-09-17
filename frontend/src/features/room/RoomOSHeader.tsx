import React from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { Pill, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomOSHeaderProps = {
  room: Room;
  isMember: boolean;
  memberRole?: string | null;
  hasActiveLiveSession?: boolean;
  liveParticipantsCount?: number;
  onJoin: () => void;
  onLeave: () => void;
  onOpenMore: () => void;
  onJoinLiveSession?: () => void;
  onSearch?: () => void;
};

export function RoomOSHeader({
  room,
  isMember,
  memberRole,
  hasActiveLiveSession,
  liveParticipantsCount = 0,
  onJoin,
  onLeave,
  onOpenMore,
  onJoinLiveSession,
  onSearch,
}: RoomOSHeaderProps) {
  const { colors } = useTheme();

  const handleShare = async () => {
    try {
      triggerHaptic();
      await Share.share({
        title: room.title,
        message: `Join our academic study room "${room.title}" on SkillBridge: https://skillbridge.app/room/${room.id}`,
      });
    } catch (err) {
      console.warn("Could not share room", err);
    }
  };

  return (
    <View style={[s.headerContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Top Bar Navigation & Actions */}
      <Row style={s.topBar}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Text numberOfLines={1} style={[s.navTitle, { color: colors.text }]}>
            {room.title}
          </Text>
        </View>

        <Row style={{ gap: 6 }}>
          {onSearch && (
            <Pressable
              accessibilityLabel="Search in room"
              onPress={() => {
                triggerHaptic();
                onSearch();
              }}
              style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialCommunityIcons name="magnify" size={20} color={colors.text} />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Share room"
            onPress={handleShare}
            style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Room options"
            onPress={onOpenMore}
            style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface2, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.text} />
          </Pressable>
        </Row>
      </Row>

      {/* Room Identity Banner */}
      <Row style={s.identityRow}>
        <View style={[s.avatarBox, { backgroundColor: colors.primarySoft }]}>
          <MaterialCommunityIcons
            name={room.mode === "online" ? "video-outline" : "account-group"}
            size={26}
            color={colors.primary}
          />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <Text style={[s.roomTitle, { color: colors.text }]} numberOfLines={1}>
              {room.title}
            </Text>
            {room.visibility === "private" && (
              <MaterialCommunityIcons name="lock" size={16} color={colors.muted} />
            )}
          </Row>
          <Text style={[s.metaText, { color: colors.muted }]} numberOfLines={1}>
            {room.topic} · {room.member_count} {room.member_count === 1 ? "member" : "members"}
            {room.campus_location ? ` · ${room.campus_location}` : ""}
          </Text>
        </View>

        {/* Join / Membership Action Button */}
        {isMember ? (
          <Pressable
            onPress={() => {
              triggerHaptic();
              Alert.alert("Leave Room", "Are you sure you want to leave this room?", [
                { text: "Cancel", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: onLeave },
              ]);
            }}
            style={[s.memberPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="check" size={15} color={colors.primary} />
            <Text style={[s.memberPillText, { color: colors.text }]}>
              {memberRole ? memberRole.toUpperCase() : "JOINED"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onJoin}
            style={[s.joinBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
            <Text style={s.joinBtnText}>Join</Text>
          </Pressable>
        )}
      </Row>

      {/* Live Session Active Strip (if room is live) */}
      {hasActiveLiveSession ? (
        <Pressable
          onPress={onJoinLiveSession}
          style={({ pressed }) => [
            s.liveStrip,
            { backgroundColor: `${colors.danger}14`, borderColor: `${colors.danger}40`, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
            <View style={[s.liveDot, { backgroundColor: colors.danger }]} />
            <Text style={[s.liveText, { color: colors.danger }]}>
              Live Classroom Active · {liveParticipantsCount} in session
            </Text>
          </Row>
          <View style={[s.joinLivePill, { backgroundColor: colors.danger }]}>
            <Text style={s.joinLivePillText}>Join →</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  topBar: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 6,
  },
  identityRow: {
    alignItems: "center",
    gap: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roomTitle: {
    fontSize: 16,
    fontWeight: "800",
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  joinBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  memberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  memberPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  liveStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 12,
    fontWeight: "700",
  },
  joinLivePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  joinLivePillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
