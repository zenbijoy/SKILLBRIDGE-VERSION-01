import React from "react";
import {
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { radius, useTheme } from "@/theme";

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

export function RoomOSHeader({
  room,
  isMember,
  memberRole,
  isEducator = false,
  userAvatarUrl,
  userFullName,
  hasActiveLiveSession,
  liveParticipantsCount = 0,
  attendancePercent = 80,
  onJoin,
  onLeave,
  onOpenMore,
  onJoinLiveSession,
  onOpenVoice,
  onSearch,
  onPostAnnouncement,
  onOpenAnalytics,
  onAttendance,
  onToggleRolePreview,
}: RoomOSHeaderProps) {
  const { colors, isDark } = useTheme();

  const handleShare = async () => {
    try {
      triggerHaptic();
      const link = `${WEB_URL}/room/${room.id}`;
      await Share.share({
        title: room.title,
        message: `Join our academic study room "${room.title}" on SkillBridge: ${link}`,
        url: link,
      });
    } catch (err) {
      console.warn("Could not share room", err);
    }
  };

  const topicOrTitle = room.topic || room.title || "Physics Basics";
  const hostDisplayName = userFullName || "Course Educator";

  return (
    <View style={s.container}>
      {/* Ambient background glow gradient matching reference */}
      <LinearGradient
        colors={
          isDark
            ? ["#0F1F38", "#082520", "transparent"]
            : ["#E0F2FE", "#ECFDF5", "transparent"]
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.ambientGlow}
      />

      {/* ── 1. Top Bar Navigation ── */}
      <View style={s.topBar}>
        <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [s.navIconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>

          <Pressable
            style={{ flex: 1 }}
            onLongPress={() => {
              triggerHaptic();
              onToggleRolePreview?.();
            }}
            delayLongPress={400}
          >
            <Text numberOfLines={1} style={[s.headerTitle, { color: colors.text }]}>
              {isEducator ? "Educator Dashboard" : "Learning Room"}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                s.headerSubtitle,
                { color: isEducator ? colors.muted : isDark ? "#60A5FA" : "#0284C7" },
              ]}
            >
              {topicOrTitle}
            </Text>
          </Pressable>
        </Row>

        {/* Right side actions */}
        <Row style={{ alignItems: "center", gap: 8 }}>
          {isEducator ? (
            <>
              {onSearch && (
                <Pressable
                  accessibilityLabel="Search in room"
                  onPress={() => {
                    triggerHaptic();
                    onSearch();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [s.actionIconBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialCommunityIcons name="magnify" size={21} color={colors.text} />
                </Pressable>
              )}
              <Pressable
                accessibilityLabel="Share room"
                onPress={handleShare}
                hitSlop={8}
                style={({ pressed }) => [s.actionIconBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Room options"
                onPress={onOpenMore}
                hitSlop={8}
                style={({ pressed }) => [s.actionIconBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.text} />
              </Pressable>
            </>
          ) : (
            /* Learner top-right profile avatar */
            <Pressable
              accessibilityLabel="My Profile & Options"
              onPress={onOpenMore}
              hitSlop={8}
              style={({ pressed }) => [s.avatarBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              {userAvatarUrl ? (
                <Image source={{ uri: userAvatarUrl }} style={s.avatarImg} />
              ) : (
                <View style={[s.avatarFallback, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[s.avatarText, { color: colors.primary }]}>
                    {userFullName ? userFullName[0].toUpperCase() : "U"}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        </Row>
      </View>

      {/* ── 2. Content Card / Action Bar Area ── */}
      {isEducator ? (
        /* ================= EDUCATOR DASHBOARD CARD ================= */
        <View
          style={[
            s.educatorCard,
            {
              backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#FFFFFF",
              borderColor: isDark ? "rgba(51, 65, 85, 0.6)" : "#E2E8F0",
              shadowColor: "#000",
            },
          ]}
        >
          {/* Host Identifier Row */}
          <Row style={s.hostRow}>
            <View style={s.hostBadge}>
              <MaterialCommunityIcons name="school-outline" size={16} color="#D97706" />
              <Text style={s.hostNameText} numberOfLines={1}>
                {hostDisplayName}
              </Text>
            </View>

            {hasActiveLiveSession && liveParticipantsCount > 0 && (
              <View style={s.liveNowChip}>
                <View style={s.liveDot} />
                <Text style={s.liveNowText}>{liveParticipantsCount} live</Text>
              </View>
            )}
          </Row>

          {/* Dual Action Session Buttons: [+ Audio Session]  [Join Video Session] */}
          <Row style={s.educatorSessionButtonsRow}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenVoice?.();
              }}
              style={({ pressed }) => [
                s.audioPillBtn,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="microphone" size={17} color="#FFFFFF" />
              <Text style={s.pillBtnText}>+ Audio Session</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic();
                onJoinLiveSession?.();
              }}
              style={({ pressed }) => [
                s.videoPillBtn,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="video" size={17} color="#FFFFFF" />
              <Text style={s.pillBtnText}>Join Video Session</Text>
            </Pressable>
          </Row>

          {/* Stats & Quick Actions Sub-Section */}
          <View style={s.statsHeaderRow}>
            <Text style={[s.sectionSubtitle, { color: colors.muted }]}>
              Active Learners & Insights
            </Text>
          </View>

          <Row style={s.metricGridRow}>
            {/* Metric Card 1: Attendance */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                onAttendance?.();
              }}
              style={({ pressed }) => [
                s.miniMetricCard,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="format-list-checks" size={16} color="#059669" />
                <Text style={[s.miniMetricLabel, { color: colors.text }]}>Attendance</Text>
              </Row>
              <Row style={{ alignItems: "center", gap: 6, marginTop: 4 }}>
                <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={16} color="#0284C7" />
                <Text style={s.metricHighlightText}>{attendancePercent}%</Text>
              </Row>
            </Pressable>

            {/* Metric Card 2: Engage Learners & Post Announcement */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                onPostAnnouncement?.();
              }}
              style={({ pressed }) => [
                s.miniMetricCard,
                {
                  backgroundColor: isDark ? colors.surface2 : "#F8FAFC",
                  borderColor: isDark ? colors.border : "#E2E8F0",
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="compass-outline" size={16} color="#6366F1" />
                <Text style={[s.miniMetricLabel, { color: colors.text }]} numberOfLines={1}>
                  Engage Learners
                </Text>
              </Row>
              <Row style={{ alignItems: "center", gap: 6, marginTop: 4 }}>
                <MaterialCommunityIcons name="bullhorn" size={15} color="#0284C7" />
                <Text style={[s.postAnnouncementText, { color: colors.text }]}>
                  Post Announcement
                </Text>
              </Row>
            </Pressable>
          </Row>
        </View>
      ) : (
        /* ================= LEARNER ACTION BAR ================= */
        <View style={s.learnerBarContainer}>
          <Row style={s.learnerButtonsRow}>
            {/* Join Audio Session */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenVoice?.();
              }}
              style={({ pressed }) => [
                s.learnerAudioBtn,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="microphone" size={18} color="#FFFFFF" />
              <Text style={s.learnerBtnText}>Join Audio Session</Text>
            </Pressable>

            {/* Join Video Session */}
            <Pressable
              onPress={() => {
                triggerHaptic();
                onJoinLiveSession?.();
              }}
              style={({ pressed }) => [
                s.learnerVideoBtn,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <MaterialCommunityIcons name="video" size={18} color="#FFFFFF" />
              <Text style={s.learnerBtnText}>Join Video Session</Text>
            </Pressable>
          </Row>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    position: "relative",
  },
  ambientGlow: {
    position: "absolute",
    top: -20,
    left: 0,
    right: 0,
    height: 140,
    opacity: 0.8,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 6,
  },
  navIconBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800",
  },

  /* ── Educator Dashboard Card ── */
  educatorCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginTop: 2,
    marginBottom: 6,
    gap: 10,
  },
  hostRow: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  hostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  hostNameText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  liveNowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  liveNowText: {
    color: "#15803D",
    fontSize: 11,
    fontWeight: "700",
  },
  educatorSessionButtonsRow: {
    alignItems: "center",
    gap: 10,
  },
  audioPillBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#10B981",
    paddingVertical: 11,
    borderRadius: 24,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  videoPillBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#6366F1",
    paddingVertical: 11,
    borderRadius: 24,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  pillBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  statsHeaderRow: {
    marginTop: 2,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricGridRow: {
    alignItems: "center",
    gap: 10,
  },
  miniMetricCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  miniMetricLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricHighlightText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#059669",
  },
  postAnnouncementText: {
    fontSize: 11,
    fontWeight: "700",
  },

  /* ── Learner Action Bar ── */
  learnerBarContainer: {
    marginTop: 4,
    marginBottom: 8,
  },
  learnerButtonsRow: {
    alignItems: "center",
    gap: 10,
  },
  learnerAudioBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 26,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  learnerVideoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#6366F1",
    paddingVertical: 12,
    borderRadius: 26,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  learnerBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
