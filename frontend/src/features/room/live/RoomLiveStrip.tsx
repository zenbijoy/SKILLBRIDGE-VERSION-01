import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoomLiveStatus } from "./useRoomLiveStatus";
import { useLiveSessionStore } from "./useLiveSessionStore";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";

export interface RoomLiveStripProps {
  roomId: string;
  roomTitle: string;
  isMember: boolean;
  isOwner: boolean;
  onOpenStudyPermissions?: () => void;
  onOpenScheduleStudy?: () => void;
}

export const RoomLiveStrip: React.FC<RoomLiveStripProps> = ({
  roomId,
  roomTitle,
  isMember,
  isOwner,
  onOpenStudyPermissions,
  onOpenScheduleStudy,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();

  const liveStatusQuery = useRoomLiveStatus(roomId);
  const liveStore = useLiveSessionStore();

  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  if (!isMember) {
    return null;
  }

  if (liveStatusQuery.isLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.loadingContainer,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>
          {t("live.connecting")}
        </Text>
      </View>
    );
  }

  const data = liveStatusQuery.data;
  const openSession = data?.openSession;
  const studySession = data?.studySession;
  const studyLive = Boolean(studySession?.isLive);
  const me = data?.me;

  const isCurrentSessionActive =
    liveStore.status === "connected" && liveStore.roomId === roomId;

  // Handle joining open session
  const handleJoinOpen = (media: "audio" | "video") => {
    triggerHaptic();
    void liveStore.joinSession({
      roomId,
      roomTitle,
      media,
    });
  };

  // Handle joining live study session
  const handleJoinStudy = (sessionId: string) => {
    triggerHaptic();
    void liveStore.joinSession({
      roomId,
      roomTitle,
      media: "video",
      preferredSessionId: sessionId,
    });
  };

  // 1. STATE C: STUDY SESSION IS LIVE
  if (studyLive && studySession) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "rgba(79, 70, 229, 0.12)" : "#EEF2FF",
            borderColor: colors.accent,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.leftInfo}>
            <View style={[styles.liveChip, { backgroundColor: colors.accent }]}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <MaterialCommunityIcons name="school" size={14} color="#FFFFFF" />
              </Animated.View>
              <Text style={styles.liveChipText}>STUDY LIVE</Text>
            </View>

            <View style={styles.textStack}>
              <Text style={[styles.mainTitle, { color: colors.text }]} numberOfLines={1}>
                {studySession.title || t("live.studySession")}
              </Text>
              <Text style={[styles.subText, { color: colors.muted }]}>
                {studySession.participantCount}{" "}
                {t("live.participantsCount")} · 🎓 {t("live.studySession")}
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            onPress={() => handleJoinStudy(studySession.id)}
            accessibilityRole="button"
            accessibilityLabel={isCurrentSessionActive ? t("live.return") : t("live.joinStudySession")}
          >
            <Text style={styles.actionBtnText}>
              {isCurrentSessionActive ? t("live.return") : t("live.join")}
            </Text>
          </Pressable>
        </View>

        {/* Warning that open sessions are paused */}
        <Text style={[styles.subNotice, { color: colors.muted }]}>
          {t("live.studySessionLiveNotice")}
        </Text>
      </View>
    );
  }

  // 2. STATE B: OPEN SESSION IS LIVE (Audio or Video)
  if (openSession) {
    const isVideo = openSession.media === "video";
    const participants = openSession.participants || [];

    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "rgba(16, 185, 129, 0.10)" : "#ECFDF5",
            borderColor: colors.success,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.leftInfo}>
            <View style={[styles.liveChip, { backgroundColor: colors.success }]}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <MaterialCommunityIcons
                  name={isVideo ? "video" : "microphone"}
                  size={14}
                  color="#FFFFFF"
                />
              </Animated.View>
              <Text style={styles.liveChipText}>{t("live.live")}</Text>
            </View>

            <View style={styles.textStack}>
              <Text style={[styles.mainTitle, { color: colors.text }]} numberOfLines={1}>
                {isVideo ? t("live.openVideoSession") : t("live.openAudioSession")}
              </Text>
              <Text style={[styles.subText, { color: colors.muted }]}>
                {openSession.participantCount} {t("live.participantsCount")}
              </Text>
            </View>

            {/* Avatar Stack preview (up to 3) */}
            <View style={styles.avatarStack}>
              {participants.slice(0, 3).map((p, idx) => (
                <View
                  key={p.userId || idx}
                  style={[
                    styles.stackAvatarWrapper,
                    { borderColor: colors.surface, left: idx * 14 },
                  ]}
                >
                  {p.avatarUrl ? (
                    <Image source={{ uri: p.avatarUrl }} style={styles.stackAvatar} />
                  ) : (
                    <View style={[styles.stackAvatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={styles.stackAvatarText}>
                        {(p.name?.[0] || "?").toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.success }]}
            onPress={() => handleJoinOpen(openSession.media)}
            accessibilityRole="button"
            accessibilityLabel={isCurrentSessionActive ? t("live.return") : t("live.join")}
          >
            <Text style={styles.actionBtnText}>
              {isCurrentSessionActive ? t("live.return") : t("live.join")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 3. STATE D: STUDY SESSION SCHEDULED SOON (Within 2 mins)
  const studyWindowActive = data?.studyWindow?.active;
  if (studyWindowActive || me?.canStartOpen === false) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "rgba(245, 158, 11, 0.10)" : "#FFFBEB",
            borderColor: colors.warning,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <MaterialCommunityIcons name="clock-alert-outline" size={20} color={colors.warning} />
            <Text style={[styles.mainTitle, { color: colors.text, fontSize: 13 }]} numberOfLines={2}>
              {me?.reason || t("live.studySessionImminentNotice")}
            </Text>
          </View>

          {me?.canStartStudy && onOpenScheduleStudy && (
            <Pressable
              style={[styles.secondaryActionBtn, { borderColor: colors.border }]}
              onPress={onOpenScheduleStudy}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>
                {t("live.studySession")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // 4. STATE A: NOTHING LIVE (Buttons to Start Audio / Video)
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.idleRow}>
        {/* Start Audio Button */}
        <Pressable
          style={[styles.startBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          onPress={() => handleJoinOpen("audio")}
          accessibilityRole="button"
          accessibilityLabel={t("live.startAudio")}
        >
          <MaterialCommunityIcons name="microphone" size={18} color={colors.primary} />
          <Text style={[styles.startBtnText, { color: colors.text }]}>
            {t("live.startAudio")}
          </Text>
        </Pressable>

        {/* Start Video Button */}
        <Pressable
          style={[styles.startBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          onPress={() => handleJoinOpen("video")}
          accessibilityRole="button"
          accessibilityLabel={t("live.startVideo")}
        >
          <MaterialCommunityIcons name="video" size={18} color={colors.accent} />
          <Text style={[styles.startBtnText, { color: colors.text }]}>
            {t("live.startVideo")}
          </Text>
        </Pressable>

        {/* Study Session Management Options (If authorized) */}
        {me?.canStartStudy && (
          <View style={styles.studyActionsGroup}>
            {onOpenScheduleStudy && (
              <Pressable
                style={[styles.iconActionBtn, { backgroundColor: colors.surface2 }]}
                onPress={onOpenScheduleStudy}
                accessibilityRole="button"
                accessibilityLabel={t("live.scheduleStudySession")}
              >
                <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.text} />
              </Pressable>
            )}

            {isOwner && onOpenStudyPermissions && (
              <Pressable
                style={[styles.iconActionBtn, { backgroundColor: colors.surface2 }]}
                onPress={onOpenStudyPermissions}
                accessibilityRole="button"
                accessibilityLabel={t("live.manageStudyPermissions")}
              >
                <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.text} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: radius.md || 12,
    borderWidth: 1,
    padding: 12,
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveChipText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  textStack: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  subText: {
    fontSize: 12,
    marginTop: 2,
  },
  subNotice: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
  },
  avatarStack: {
    flexDirection: "row",
    position: "relative",
    width: 60,
    height: 28,
    marginLeft: 6,
  },
  stackAvatarWrapper: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  stackAvatar: {
    width: "100%",
    height: "100%",
  },
  stackAvatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  stackAvatarText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  actionBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.md || 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  idleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  startBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md || 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  studyActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconActionBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md || 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
