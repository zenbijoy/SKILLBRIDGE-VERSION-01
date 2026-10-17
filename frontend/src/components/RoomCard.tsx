import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Room } from "@/types";
import { triggerHaptic } from "./ui";
import { radius, useTheme } from "@/theme";
import { nextGenAnimations } from "@/assets/nextgen";
import { getRoomCover, getRoomAccentColor } from "@/features/room/roomCovers";

export function RoomCard({ room }: { room: Room }) {
  const { colors, isDark } = useTheme();
  const isLive = room.status === "live";
  const isTeacher = !!room.is_teacher_mode;
  const coverUrl = getRoomCover(room);
  const accentColor = getRoomAccentColor(room);

  const fillPercent = Math.min(100, Math.round((room.member_count / Math.max(1, room.capacity)) * 100));
  const seatsLeft = Math.max(0, room.capacity - room.member_count);
  const isFull = seatsLeft <= 0 && !isLive;

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
        opacity: pressed ? 0.93 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        marginVertical: 6,
      })}
    >
      <View
        style={[
          s.cardWrap,
          {
            backgroundColor: isDark ? "#111524" : "#FFFFFF",
            borderColor: isLive
              ? colors.danger
              : isTeacher
              ? "#10B98150"
              : isDark
              ? "#232A42"
              : "#E5E7EB",
            borderWidth: isLive ? 1.5 : 1,
            shadowColor: isLive ? colors.danger : "#000",
            shadowOpacity: isDark ? 0.35 : 0.07,
          },
        ]}
      >
        {/* Dynamic Cover Image Banner */}
        <View style={s.coverWrapper}>
          <Image
            source={{ uri: coverUrl }}
            style={s.coverImage}
            resizeMode="cover"
          />
          {/* Rich Gradient Scrim Overlay */}
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "rgba(10,14,26,0.88)"]}
            style={s.scrimGradient}
          />

          {/* Top Bar Badges */}
          <View style={s.coverTopBar}>
            <View style={s.badgeRow}>
              {isLive ? (
                <View style={s.liveBadge}>
                  <Image
                    source={nextGenAnimations.livePulse}
                    style={{ width: 13, height: 13 }}
                    resizeMode="contain"
                  />
                  <Text style={s.liveBadgeText}>LIVE</Text>
                </View>
              ) : (
                <View style={[s.statusBadge, { backgroundColor: room.status === "scheduled" ? "#F59E0B" : "rgba(15,23,42,0.7)" }]}>
                  <Text style={s.statusBadgeText}>
                    {room.status === "scheduled" ? "UPCOMING" : "OPEN"}
                  </Text>
                </View>
              )}

              {isTeacher && (
                <View style={s.teacherBadge}>
                  <MaterialCommunityIcons name="school" size={12} color="#FFFFFF" />
                  <Text style={s.teacherBadgeText}>EDUCATOR</Text>
                </View>
              )}
            </View>

            {/* Visibility & Knock Access Badge */}
            <View style={s.rightBadgeRow}>
              {Boolean(room.knock_mode_enabled) ? (
                <View style={[s.visibilityPill, { backgroundColor: "rgba(245, 158, 11, 0.9)" }]}>
                  <MaterialCommunityIcons name="door-closed-lock" size={11} color="#FFFFFF" />
                  <Text style={s.visibilityText}>Knock</Text>
                </View>
              ) : (
                <View style={[s.visibilityPill, { backgroundColor: "rgba(16, 185, 129, 0.85)" }]}>
                  <MaterialCommunityIcons name="lock-open-variant" size={11} color="#FFFFFF" />
                  <Text style={s.visibilityText}>Open</Text>
                </View>
              )}
            </View>
          </View>

          {/* Bottom Cover Chips: Topic & Clean Mode */}
          <View style={s.coverBottomBar}>
            <View style={s.chipRow}>
              {room.topic ? (
                <View style={[s.topicPill, { backgroundColor: `${accentColor}30`, borderColor: accentColor }]}>
                  <Text style={[s.topicPillText, { color: "#FFFFFF" }]}>
                    #{room.topic}
                  </Text>
                </View>
              ) : null}
              <View style={s.modePill}>
                <Text style={s.modePillText}>
                  {room.mode === "online" ? "🌐 Video Session" : room.mode === "offline" ? "📍 Campus" : "⚡ Hybrid"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Content Body: Clean, Sleek, Minimal Text */}
        <View style={s.bodyContent}>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={1}>
            {room.title}
          </Text>

          {room.description ? (
            <Text style={[s.description, { color: colors.muted }]} numberOfLines={1}>
              {room.description}
            </Text>
          ) : null}

          {/* Footer: Capacity Progress & Enter CTA */}
          <View style={s.footerRow}>
            {/* Left: Capacity bar & seats */}
            <View style={s.capacityCol}>
              <View style={s.capacityMeta}>
                <MaterialCommunityIcons
                  name="account-multiple"
                  size={14}
                  color={isTeacher ? "#10B981" : colors.muted}
                />
                <Text style={[s.capacityText, { color: colors.muted }]}>
                  {room.member_count}/{room.capacity} · {seatsLeft > 0 ? `${seatsLeft} seats left` : "Full"}
                </Text>
              </View>
              <View style={[s.capacityTrack, { backgroundColor: isDark ? "#232A42" : "#E5E7EB" }]}>
                <View
                  style={[
                    s.capacityFill,
                    {
                      width: `${fillPercent}%`,
                      backgroundColor: fillPercent > 85 ? colors.danger : isTeacher ? "#10B981" : colors.primary,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Right: Sleek Action CTA */}
            <View
              style={[
                s.actionBtn,
                {
                  backgroundColor: isLive
                    ? colors.danger
                    : isFull
                    ? isDark ? "#23283E" : "#E5E7EB"
                    : colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  s.actionBtnText,
                  {
                    color: isFull && !isLive ? colors.muted : "#FFFFFF",
                  },
                ]}
              >
                {isLive ? "Join Live" : isFull ? "Full" : "Enter"}
              </Text>
              {!isFull && (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color="#FFFFFF"
                />
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  cardWrap: {
    borderRadius: 18,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  coverWrapper: {
    height: 120,
    width: "100%",
    position: "relative",
    justifyContent: "space-between",
    padding: 10,
  },
  coverImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrimGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rightBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  teacherBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10B981",
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  teacherBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  visibilityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  visibilityText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  coverBottomBar: {
    zIndex: 2,
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  modePill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modePillText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "700",
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  topicPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 15.5,
    fontWeight: "800",
    lineHeight: 20,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  capacityCol: {
    flex: 1,
    gap: 4,
  },
  capacityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  capacityText: {
    fontSize: 11,
    fontWeight: "600",
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
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
});
