import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ClubItem } from "../types";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface ClubCardProps {
  club: ClubItem;
  onJoinToggle?: (club: ClubItem) => void;
  onFollowToggle?: (club: ClubItem) => void;
  compact?: boolean;
}

export function ClubCard({
  club,
  onJoinToggle,
  onFollowToggle,
  compact = false,
}: ClubCardProps) {
  const { colors, isDark } = useTheme();

  const handleOpenClub = () => {
    triggerHaptic();
    router.push(`/club/${club.id}` as any);
  };

  const initial = (club.name?.trim()?.[0] ?? "C").toUpperCase();

  return (
    <Pressable
      onPress={handleOpenClub}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : "#FFFFFF",
          borderColor: isDark ? colors.border : "#E2E8F0",
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Top Banner (Optional) */}
      {club.banner_url ? (
        <Image
          source={{ uri: club.banner_url }}
          style={compact ? styles.compactBanner : styles.banner}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            compact ? styles.compactBanner : styles.banner,
            { backgroundColor: isDark ? colors.surface2 : colors.primarySoft },
          ]}
        />
      )}

      {/* Card Content */}
      <View style={styles.contentWrap}>
        {/* Avatar & Header Meta */}
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

          {/* Badges on right side */}
          <View style={styles.headerBadgesRow}>
            {club.category ? (
              <View
                style={[
                  styles.categoryPill,
                  { backgroundColor: isDark ? colors.surface2 : "#F1F5F9" },
                ]}
              >
                <Text style={[styles.categoryText, { color: colors.muted }]}>
                  {club.category}
                </Text>
              </View>
            ) : null}

            {club.membership_type === "open" ? (
              <View style={[styles.statusPill, { backgroundColor: "#ECFDF5" }]}>
                <Text style={[styles.statusText, { color: "#059669" }]}>
                  Open
                </Text>
              </View>
            ) : club.membership_type === "application" ? (
              <View style={[styles.statusPill, { backgroundColor: "#EFF6FF" }]}>
                <Text style={[styles.statusText, { color: "#2563EB" }]}>
                  Apply
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Club Name & Verification */}
        <View style={styles.titleRow}>
          <Text
            style={[styles.clubName, { color: colors.text }]}
            numberOfLines={1}
          >
            {club.name}
          </Text>
          {club.verified ? (
            <MaterialCommunityIcons
              name="check-decagram"
              size={17}
              color={colors.primary}
            />
          ) : null}
        </View>

        {/* University & Department */}
        {(club.university || club.department) ? (
          <Text style={[styles.uniText, { color: colors.muted }]} numberOfLines={1}>
            {club.department ? `${club.department} • ` : ""}
            {club.university ?? "University Organization"}
          </Text>
        ) : null}

        {/* Tagline / Description */}
        <Text
          style={[styles.tagline, { color: colors.textSecondary }]}
          numberOfLines={compact ? 1 : 2}
        >
          {club.tagline || club.description || "Student-led university community."}
        </Text>

        {/* Recommendation Reason Callout */}
        {club.recommendation_reason ? (
          <View
            style={[
              styles.recommendationWrap,
              { backgroundColor: isDark ? colors.surface2 : "#EFF6FF" },
            ]}
          >
            <MaterialCommunityIcons
              name="creation"
              size={12}
              color={colors.primary}
            />
            <Text
              style={[styles.recommendationText, { color: colors.primary }]}
              numberOfLines={1}
            >
              {club.recommendation_reason}
            </Text>
          </View>
        ) : null}

        {/* Upcoming Event Snippet (if available) */}
        {club.next_event ? (
          <View style={styles.eventSnippetRow}>
            <MaterialCommunityIcons
              name="calendar-clock"
              size={13}
              color={colors.primary}
            />
            <Text
              style={[styles.eventSnippetText, { color: colors.muted }]}
              numberOfLines={1}
            >
              Next: {club.next_event.title}
            </Text>
          </View>
        ) : null}

        {/* Stats Row & Actions */}
        <View
          style={[
            styles.footerRow,
            { borderTopColor: isDark ? colors.border : "#F1F5F9" },
          ]}
        >
          <View style={styles.membersStats}>
            <MaterialCommunityIcons
              name="account-multiple-outline"
              size={15}
              color={colors.muted}
            />
            <Text style={[styles.statsNumber, { color: colors.text }]}>
              {club.member_count ?? 0}
            </Text>
            <Text style={[styles.statsLabel, { color: colors.muted }]}>
              members
            </Text>
          </View>

          {/* Quick Action Buttons */}
          <View style={styles.actionButtonsRow}>
            {onFollowToggle ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  triggerHaptic();
                  onFollowToggle(club);
                }}
                style={({ pressed }) => [
                  styles.followBtn,
                  {
                    borderColor: club.is_following ? colors.primary : colors.border,
                    backgroundColor: club.is_following
                      ? isDark
                        ? colors.surface2
                        : "#EFF6FF"
                      : "transparent",
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={club.is_following ? "bell-check" : "bell-outline"}
                  size={14}
                  color={club.is_following ? colors.primary : colors.muted}
                />
              </Pressable>
            ) : null}

            {onJoinToggle ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  triggerHaptic();
                  onJoinToggle(club);
                }}
                style={({ pressed }) => [
                  styles.joinBtn,
                  {
                    backgroundColor: club.is_member
                      ? isDark
                        ? colors.surface2
                        : "#ECFDF5"
                      : colors.primary,
                    borderColor: club.is_member ? "#059669" : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.joinBtnText,
                    {
                      color: club.is_member ? "#059669" : "#FFFFFF",
                      fontWeight: "700",
                    },
                  ]}
                >
                  {club.is_member
                    ? club.my_role
                      ? club.my_role.toUpperCase()
                      : "JOINED"
                    : club.membership_type === "application"
                    ? "Apply"
                    : "Join"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  banner: {
    height: 70,
    width: "100%",
  },
  compactBanner: {
    height: 48,
    width: "100%",
  },
  contentWrap: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: -28,
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  headerBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  clubName: {
    fontSize: 16,
    fontWeight: "800",
    flexShrink: 1,
  },
  uniText: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  tagline: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  recommendationWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginTop: 6,
  },
  recommendationText: {
    fontSize: 10,
    fontWeight: "700",
  },
  eventSnippetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  eventSnippetText: {
    fontSize: 11,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  membersStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statsNumber: {
    fontSize: 12,
    fontWeight: "800",
  },
  statsLabel: {
    fontSize: 11,
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  followBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  joinBtnText: {
    fontSize: 11,
  },
});
