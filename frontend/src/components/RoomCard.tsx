import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Room } from "@/types";
import { Muted, Pill, Row, triggerHaptic } from "./ui";
import { radius, useTheme } from "@/theme";
import { nextGenBadges, nextGenAnimations } from "@/assets/nextgen";
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
        opacity: pressed ? 0.94 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        marginVertical: 6,
      })}
    >
      <View
        style={[
          s.cardWrap,
          {
            backgroundColor: isDark ? "#141724" : "#FFFFFF",
            borderColor: isLive
              ? colors.danger
              : isTeacher
              ? "#10B98160"
              : isDark
              ? "#252B42"
              : "#E2E8F0",
            borderWidth: isLive || isTeacher ? 1.5 : 1,
            shadowColor: isLive ? colors.danger : isTeacher ? "#10B981" : "#000",
            shadowOpacity: isDark ? 0.35 : 0.08,
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
            colors={["rgba(0,0,0,0.15)", "rgba(10,12,20,0.85)"]}
            style={s.scrimGradient}
          />

          {/* Top Bar Badges */}
          <View style={s.coverTopBar}>
            <View style={s.badgeRow}>
              {isLive ? (
                <View style={s.liveBadge}>
                  <Image
                    source={nextGenAnimations.livePulse}
                    style={{ width: 14, height: 14 }}
                    resizeMode="contain"
                  />
                  <Text style={s.liveBadgeText}>LIVE NOW</Text>
                </View>
              ) : (
                <View style={[s.statusBadge, { backgroundColor: room.status === "scheduled" ? "#F59E0B" : "#3B82F6" }]}>
                  <Text style={s.statusBadgeText}>
                    {room.status === "scheduled" ? "UPCOMING" : "OPEN"}
                  </Text>
                </View>
              )}

              {isTeacher && (
                <View style={s.teacherBadge}>
                  <MaterialCommunityIcons name="school" size={13} color="#FFFFFF" />
                  <Text style={s.teacherBadgeText}>TEACHER MODE</Text>
                </View>
              )}
            </View>

            {/* Visibility Pill */}
            <View style={s.visibilityPill}>
              <MaterialCommunityIcons
                name={room.visibility === "public" ? "earth" : room.visibility === "private" ? "lock" : "email-lock"}
                size={12}
                color="#FFFFFF"
              />
              <Text style={s.visibilityText}>
                {room.visibility === "invite_only" ? "Invite" : room.visibility}
              </Text>
            </View>
          </View>

          {/* Bottom Cover Info */}
          <View style={s.coverBottomBar}>
            <Row style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <View style={[s.modePill, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
                <Text style={s.modePillText}>
                  {room.mode === "online" ? "🌐 Online Video" : room.mode === "offline" ? "📍 Campus" : "⚡ Hybrid"}
                </Text>
              </View>
              {room.topic ? (
                <View style={[s.topicPill, { backgroundColor: `${accentColor}35`, borderColor: accentColor }]}>
                  <Text style={[s.topicPillText, { color: "#FFFFFF" }]}>
                    #{room.topic}
                  </Text>
                </View>
              ) : null}
            </Row>
          </View>
        </View>

        {/* Content Body */}
        <View style={s.bodyContent}>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>
            {room.title}
          </Text>

          {room.description ? (
            <Muted numberOfLines={2} style={s.description}>
              {room.description}
            </Muted>
          ) : null}

          {/* Teacher Mode Highlight Banner */}
          {isTeacher && (
            <View style={[s.teacherCallout, { backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5", borderColor: isDark ? "rgba(16,185,129,0.3)" : "#A7F3D0" }]}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={15} color="#10B981" />
              <Text style={[s.teacherCalloutText, { color: isDark ? "#6EE7B7" : "#065F46" }]}>
                Teacher Mode active • Anyone can send request to teach & schedule classes
              </Text>
            </View>
          )}

          {/* Capacity Progress Bar */}
          <View style={s.capacitySection}>
            <View style={s.capacityHeader}>
              <Text style={[s.capacityLabel, { color: colors.textSecondary }]}>
                Capacity ({room.member_count}/{room.capacity})
              </Text>
              <Text style={[s.capacityPercent, { color: fillPercent > 85 ? colors.danger : colors.primary }]}>
                {fillPercent}% full
              </Text>
            </View>
            <View style={[s.capacityTrack, { backgroundColor: isDark ? "#202538" : "#E2E8F0" }]}>
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

          {/* Footer Bar */}
          <View style={[s.footerBar, { borderTopColor: isDark ? "#202538" : "#EDF2F7" }]}>
            <View style={s.metaItem}>
              <MaterialCommunityIcons name="account-group" size={16} color={isTeacher ? "#10B981" : colors.primary} />
              <Text style={[s.metaText, { color: colors.textSecondary }]}>
                {seatsLeft > 0 ? `${seatsLeft} seats left` : "Full"}
              </Text>
            </View>

            <View style={s.metaItem}>
              <MaterialCommunityIcons
                name={room.mode === "online" ? "video-vintage" : "map-marker-outline"}
                size={16}
                color={room.mode === "online" ? "#38BDF8" : colors.accent}
              />
              <Text numberOfLines={1} style={[s.metaText, { color: colors.textSecondary, maxWidth: 130 }]}>
                {room.campus_location || (room.mode === "online" ? "LiveKit Call" : "Campus Hall")}
              </Text>
            </View>

            {/* Action CTA */}
            <View
              style={[
                s.actionBtn,
                {
                  backgroundColor: isLive
                    ? colors.danger
                    : isFull
                    ? isDark ? "#23283E" : "#E2E8F0"
                    : isTeacher
                    ? "#10B981"
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
                {isLive ? "Join Live" : isFull ? "Full" : "Enter Room"}
              </Text>
              {!isFull && (
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={14}
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
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  coverWrapper: {
    height: 125,
    width: "100%",
    position: "relative",
    justifyContent: "space-between",
    padding: 10,
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
  },
  scrimGradient: {
    ...StyleSheet.absoluteFill,
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
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  teacherBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  teacherBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  visibilityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  visibilityText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  coverBottomBar: {
    zIndex: 2,
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modePillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  topicPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  topicPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  bodyContent: {
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 16.5,
    fontWeight: "800",
    lineHeight: 22,
  },
  description: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  teacherCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  teacherCalloutText: {
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
    lineHeight: 15,
  },
  capacitySection: {
    gap: 4,
    marginTop: 2,
  },
  capacityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  capacityLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  capacityPercent: {
    fontSize: 11,
    fontWeight: "700",
  },
  capacityTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  capacityFill: {
    height: "100%",
    borderRadius: 3,
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
