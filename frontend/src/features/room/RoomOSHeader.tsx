import React from "react";
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Room } from "@/types";
import { triggerHaptic } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { useTheme } from "@/theme";

export type RoomOSHeaderProps = {
  room: Room;
  isMember: boolean;
  memberRole?: string | null;
  isEducator?: boolean;
  userAvatarUrl?: string | null;
  userFullName?: string | null;
  hasActiveLiveSession?: boolean;
  liveParticipantsCount?: number;
  attendancePercent?: number;
  onJoin: () => void;
  onLeave: () => void;
  onOpenMore: () => void;
  onJoinLiveSession?: () => void;
  onOpenVoice?: () => void;
  onSearch?: () => void;
  onPostAnnouncement?: () => void;
  onOpenAnalytics?: () => void;
  onAttendance?: () => void;
  onToggleRolePreview?: () => void;
};

export const RoomOSHeader: React.FC<RoomOSHeaderProps> = ({
  room,
  isMember,
  memberRole,
  isEducator = false,
  onOpenMore,
  onSearch,
}) => {
  const { colors } = useTheme();

  const handleShare = async () => {
    try {
      triggerHaptic();
      const link = `${WEB_URL}/room/${room.id}`;
      await Share.share({
        title: room.title,
        message: `Join our academic study space "${room.title}" on SkillBridge: ${link}`,
        url: link,
      });
    } catch (err) {
      console.warn("Could not share room", err);
    }
  };

  const roleLabel = memberRole || (isEducator ? "Educator" : isMember ? "Member" : "Visitor");
  const isPrivate = room.visibility === "private" || room.visibility === "invite_only" || Boolean(room.is_locked);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Top Bar Navigation */}
      <View style={styles.topRow}>
        {/* Back Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.surface2, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        {/* Room Identity: Cover / Gradient Thumbnail + Real Room Title */}
        <View style={styles.roomIdentity}>
          {room.cover_image_url ? (
            <Image source={{ uri: room.cover_image_url }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnailFallback, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="google-classroom" size={20} color={colors.primary} />
            </View>
          )}

          <View style={styles.titleStack}>
            {/* Real Room Title */}
            <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
              {room.title}
            </Text>
            {/* Real Topic / Description Subtitle */}
            <Text numberOfLines={1} style={[styles.topicText, { color: colors.muted }]}>
              {room.topic ? `#${room.topic}` : "Study Group"}
            </Text>
          </View>
        </View>

        {/* Right Actions: Search, Share, Overflow */}
        <View style={styles.actionsRow}>
          {onSearch && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search in space"
              onPress={() => {
                triggerHaptic();
                onSearch();
              }}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: colors.surface2, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="magnify" size={20} color={colors.text} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share room link"
            onPress={handleShare}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surface2, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={19} color={colors.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Space options and management"
            onPress={() => {
              triggerHaptic();
              onOpenMore();
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surface2, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Meta Chips Row: Role, Member Count, Visibility */}
      <View style={styles.chipsRow}>
        <View style={[styles.chip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons
            name={isEducator ? "shield-star-outline" : "account-circle-outline"}
            size={13}
            color={colors.primary}
          />
          <Text style={[styles.chipText, { color: colors.text }]}>
            {roleLabel}
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="account-group-outline" size={13} color={colors.muted} />
          <Text style={[styles.chipText, { color: colors.muted }]}>
            {room.member_count || 1} members
          </Text>
        </View>

        <View style={[styles.chip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons
            name={isPrivate ? "lock-outline" : "earth"}
            size={13}
            color={colors.muted}
          />
          <Text style={[styles.chipText, { color: colors.muted }]}>
            {isPrivate ? "Private" : "Public"}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  roomIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thumbnail: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  thumbnailFallback: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleStack: {
    flex: 1,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  topicText: {
    fontSize: 12,
    marginTop: 1,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
