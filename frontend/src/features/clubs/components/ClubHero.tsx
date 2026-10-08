import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Share,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ClubDetail } from "../types";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { isClubAdmin } from "../constants";

interface ClubHeroProps {
  club: ClubDetail;
  onJoinToggle: () => void;
  onFollowToggle: () => void;
  onOpenAdminModal?: () => void;
}

export function ClubHero({
  club,
  onJoinToggle,
  onFollowToggle,
  onOpenAdminModal,
}: ClubHeroProps) {
  const { colors, isDark } = useTheme();

  const handleShare = async () => {
    triggerHaptic();
    try {
      await Share.share({
        message: `Join ${club.name} on SkillBridge: Check out their projects, events, and community!`,
        title: club.name,
      });
    } catch (err: unknown) {
      // User cancelled share dialog or platform share failed
    }
  };

  const isAdmin = isClubAdmin(club.my_role);

  const initial = (club.name?.trim()?.[0] ?? "C").toUpperCase();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : "#FFFFFF",
          borderColor: isDark ? colors.border : "#E2E8F0",
        },
      ]}
    >
      {/* Cover Banner */}
      {club.banner_url ? (
        <Image
          source={{ uri: club.banner_url }}
          style={styles.bannerImage}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.bannerFallback,
            { backgroundColor: isDark ? colors.surface2 : colors.primarySoft },
          ]}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={40}
            color={colors.primary}
            style={{ opacity: 0.3 }}
          />
        </View>
      )}

      {/* Main Info Wrap */}
      <View style={styles.bodyWrap}>
        {/* Avatar + Top Badges Row */}
        <View style={styles.avatarRow}>
          {club.logo_url ? (
            <Image
              source={{ uri: club.logo_url }}
              style={[
                styles.avatar,
                { borderColor: isDark ? colors.surface : "#FFFFFF" },
              ]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  backgroundColor: colors.primary,
                  borderColor: isDark ? colors.surface : "#FFFFFF",
                },
              ]}
            >
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}

          {/* Quick Stats Pill (Members & Followers) */}
          <View style={styles.quickStatsWrap}>
            <View style={styles.statPill}>
              <Text style={[styles.statNum, { color: colors.text }]}>
                {club.member_count ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>
                Members
              </Text>
            </View>
            <View
              style={[
                styles.statDivider,
                { backgroundColor: isDark ? colors.border : "#E2E8F0" },
              ]}
            />
            <View style={styles.statPill}>
              <Text style={[styles.statNum, { color: colors.text }]}>
                {club.follower_count ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>
                Followers
              </Text>
            </View>
          </View>
        </View>

        {/* Club Title & Verification */}
        <View style={styles.titleRow}>
          <Text style={[styles.clubTitle, { color: colors.text }]}>
            {club.name}
          </Text>
          {club.verified ? (
            <MaterialCommunityIcons
              name="check-decagram"
              size={20}
              color={colors.primary}
            />
          ) : null}
        </View>

        {/* Tagline */}
        {club.tagline ? (
          <Text style={[styles.taglineText, { color: colors.primary }]}>
            "{club.tagline}"
          </Text>
        ) : null}

        {/* Meta details row: Category, University, Department, Founded */}
        <View style={styles.metaDetailsRow}>
          {club.category ? (
            <View
              style={[
                styles.metaPill,
                { backgroundColor: isDark ? colors.surface2 : "#F1F5F9" },
              ]}
            >
              <MaterialCommunityIcons
                name="shape-outline"
                size={12}
                color={colors.muted}
              />
              <Text style={[styles.metaPillText, { color: colors.text }]}>
                {club.category}
              </Text>
            </View>
          ) : null}

          {club.university ? (
            <View
              style={[
                styles.metaPill,
                { backgroundColor: isDark ? colors.surface2 : "#F1F5F9" },
              ]}
            >
              <MaterialCommunityIcons
                name="school"
                size={12}
                color={colors.muted}
              />
              <Text style={[styles.metaPillText, { color: colors.text }]}>
                {club.university}
              </Text>
            </View>
          ) : null}

          {club.department ? (
            <View
              style={[
                styles.metaPill,
                { backgroundColor: isDark ? colors.surface2 : "#F1F5F9" },
              ]}
            >
              <MaterialCommunityIcons
                name="domain"
                size={12}
                color={colors.muted}
              />
              <Text style={[styles.metaPillText, { color: colors.text }]}>
                {club.department}
              </Text>
            </View>
          ) : null}

          {club.founded_year ? (
            <View
              style={[
                styles.metaPill,
                { backgroundColor: isDark ? colors.surface2 : "#F1F5F9" },
              ]}
            >
              <MaterialCommunityIcons
                name="calendar-text-outline"
                size={12}
                color={colors.muted}
              />
              <Text style={[styles.metaPillText, { color: colors.text }]}>
                Est. {club.founded_year}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Primary Action Buttons Row */}
        <View style={styles.actionCluster}>
          {/* Join / Membership Status Button */}
          <Pressable
            onPress={onJoinToggle}
            style={({ pressed }) => [
              styles.primaryActionBtn,
              {
                backgroundColor: club.is_member
                  ? isDark
                    ? colors.surface2
                    : "#ECFDF5"
                  : colors.primary,
                borderColor: club.is_member ? "#059669" : colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={club.is_member ? "check-circle" : "account-plus"}
              size={16}
              color={club.is_member ? "#059669" : "#FFFFFF"}
            />
            <Text
              style={[
                styles.primaryActionText,
                {
                  color: club.is_member ? "#059669" : "#FFFFFF",
                  fontWeight: "700",
                },
              ]}
            >
              {club.is_member
                ? club.my_title || (club.my_role ? club.my_role.toUpperCase() : "MEMBER")
                : club.membership_type === "application"
                ? "Apply to Join"
                : "Join Club"}
            </Text>
          </Pressable>

          {/* Follow Button */}
          <Pressable
            onPress={onFollowToggle}
            style={({ pressed }) => [
              styles.secondaryActionBtn,
              {
                borderColor: club.is_following ? colors.primary : colors.border,
                backgroundColor: club.is_following
                  ? isDark
                    ? colors.surface2
                    : "#EFF6FF"
                  : "transparent",
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={club.is_following ? "bell-check" : "bell-outline"}
              size={16}
              color={club.is_following ? colors.primary : colors.text}
            />
            <Text
              style={[
                styles.secondaryActionText,
                {
                  color: club.is_following ? colors.primary : colors.text,
                  fontWeight: "600",
                },
              ]}
            >
              {club.is_following ? "Following" : "Follow"}
            </Text>
          </Pressable>

          {/* Share Button */}
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="share-variant-outline"
              size={18}
              color={colors.text}
            />
          </Pressable>

          {/* Leader Admin / Manage Button */}
          {isAdmin && onOpenAdminModal ? (
            <Pressable
              onPress={onOpenAdminModal}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: colors.primarySoft,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="cog-outline"
                size={18}
                color={colors.primary}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Room OS Workspace Link Button */}
        {club.room_id ? (
          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push(`/room/${club.room_id}` as any);
            }}
            style={({ pressed }) => [
              styles.workspaceBtn,
              {
                backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                borderColor: isDark ? colors.border : "#E2E8F0",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={18}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.workspaceTitle, { color: colors.text }]}>
                Club Collaboration Room
              </Text>
              <Text style={[styles.workspaceSub, { color: colors.muted }]}>
                Live audio, whiteboard & study channels
              </Text>
            </View>
            <MaterialCommunityIcons
              name="arrow-right"
              size={16}
              color={colors.primary}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  bannerImage: {
    width: "100%",
    height: 120,
  },
  bannerFallback: {
    width: "100%",
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: -35,
    marginBottom: 10,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3.5,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  quickStatsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.2)",
  },
  statPill: {
    alignItems: "center",
  },
  statNum: {
    fontSize: 14,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1,
    height: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  clubTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  taglineText: {
    fontSize: 13,
    fontWeight: "600",
    fontStyle: "italic",
    marginTop: 2,
    marginBottom: 6,
  },
  metaDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginVertical: 6,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  primaryActionText: {
    fontSize: 13,
  },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 13,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 12,
  },
  workspaceTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  workspaceSub: {
    fontSize: 11,
    marginTop: 1,
  },
});
