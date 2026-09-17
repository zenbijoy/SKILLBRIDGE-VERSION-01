import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Profile } from "@/types";
import { triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

interface InstagramProfileCardProps {
  profile: Profile;
  matchReason?: string;
  onConnect?: (userId: string) => void;
  isCompact?: boolean;
}

export function InstagramProfileCard({
  profile,
  matchReason,
  onConnect,
  isCompact = false,
}: InstagramProfileCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [connected, setConnected] = useState(false);

  const initial = (profile.full_name?.trim()?.[0] || "U").toUpperCase();
  const subtitle = profile.department || profile.university || "Campus Peer";
  const skill =
    matchReason ||
    profile.department ||
    (profile.roles?.[0] ? profile.roles[0].replace("_", " ") : null) ||
    "Campus Peer";

  const handleConnect = (e: any) => {
    e.stopPropagation?.();
    triggerHaptic();
    setConnected((prev) => !prev);
    if (onConnect) {
      onConnect(profile.id);
    }
  };

  const handlePressCard = () => {
    triggerHaptic();
    router.push(`/user/${profile.id}` as any);
  };

  return (
    <Pressable
      onPress={handlePressCard}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
          width: isCompact ? 150 : 168,
        },
      ]}
    >
      {/* Top Banner Gradient Accent */}
      <View style={[styles.topBanner, { backgroundColor: colors.primarySoft }]} />

      {/* Profile Avatar with online status */}
      <View style={styles.avatarWrapper}>
        <View style={[styles.avatarBorder, { borderColor: colors.surface, backgroundColor: colors.surface }]}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={[styles.avatarImg, styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={[styles.onlineDot, { backgroundColor: "#10B981", borderColor: colors.surface }]} />
      </View>

      {/* Name and Details */}
      <View style={styles.infoCol}>
        <Text style={[styles.nameText, { color: colors.text }]} numberOfLines={1}>
          {profile.full_name || "Student"}
        </Text>
        <Text style={[styles.subText, { color: colors.muted }]} numberOfLines={1}>
          {subtitle}
        </Text>

        {/* Skill or Reason Pill */}
        <View style={[styles.pillBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="lightning-bolt" size={11} color={colors.primary} />
          <Text style={[styles.pillText, { color: colors.primary }]} numberOfLines={1}>
            {skill}
          </Text>
        </View>
      </View>

      {/* Instagram-style Connect / Requested Button */}
      <Pressable
        onPress={handleConnect}
        style={({ pressed }) => [
          styles.actionBtn,
          {
            backgroundColor: connected ? colors.surface2 : colors.primary,
            borderColor: connected ? colors.border : colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={connected ? "check" : "account-plus"}
          size={14}
          color={connected ? colors.text : "#FFFFFF"}
        />
        <Text
          style={[
            styles.actionBtnText,
            { color: connected ? colors.text : "#FFFFFF" },
          ]}
        >
          {connected ? t("feed.connected", "Connected") : t("feed.connect", "Connect")}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingBottom: 12,
    alignItems: "center",
    marginRight: 10,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  topBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 38,
  },
  avatarWrapper: {
    marginTop: 12,
    position: "relative",
    marginBottom: 6,
  },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: "800",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
  },
  infoCol: {
    alignItems: "center",
    width: "100%",
    gap: 3,
    marginBottom: 10,
  },
  nameText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  subText: {
    fontSize: 11,
    textAlign: "center",
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 4,
    maxWidth: "100%",
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: "100%",
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
