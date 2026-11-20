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
import { TeacherCallModal } from "../TeacherCallModal";
import { RequestSessionModal } from "../RequestSessionModal";
import { RoomSessionAttendanceModal } from "../attendance/RoomSessionAttendanceModal";

export interface RoomLiveStripProps {
  roomId: string;
  roomTitle: string;
  isMember: boolean;
  isOwner: boolean;
  isEducator?: boolean;
  onOpenStudyPermissions?: () => void;
  onOpenScheduleStudy?: () => void;
  onAskQuestion?: () => void;
  onJoinStage?: (media: "audio" | "video") => void;
}

export const RoomLiveStrip: React.FC<RoomLiveStripProps> = ({
  roomId,
  roomTitle,
  isMember,
  isOwner,
  isEducator = false,
  onOpenStudyPermissions,
  onOpenScheduleStudy,
  onAskQuestion,
  onJoinStage,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();

  const liveStatusQuery = useRoomLiveStatus(roomId);
  const liveStore = useLiveSessionStore();

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [teacherCallVisible, setTeacherCallVisible] = useState(false);
  const [requestSessionVisible, setRequestSessionVisible] = useState(false);
  const [attendanceVisible, setAttendanceVisible] = useState(false);

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

  // Determine if the current user is a room teacher or admin
  const isTeacherUser = Boolean(
    isOwner ||
      isEducator ||
      (me as any)?.isOwner ||
      (me as any)?.role === "owner" ||
      (me as any)?.role === "admin" ||
      (me as any)?.role === "teacher" ||
      me?.canStartStudy ||
      me?.canStartOpen,
  );

  const isCurrentSessionActive =
    liveStore.status === "connected" && liveStore.roomId === roomId;

  // Handle joining open session
  const handleJoinOpen = (media: "audio" | "video") => {
    triggerHaptic();
    if (onJoinStage) {
      onJoinStage(media);
      return;
    }
    void liveStore.joinSession({
      roomId,
      roomTitle,
      media,
    });
  };

  // Handle joining live study session
  const handleJoinStudy = (sessionId: string) => {
    triggerHaptic();
    if (onJoinStage) {
      onJoinStage("video");
      return;
    }
    void liveStore.joinSession({
      roomId,
      roomTitle,
      media: "video",
      preferredSessionId: sessionId,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. STATE C: STUDY SESSION IS LIVE
  // ─────────────────────────────────────────────────────────────────────────
  if (studyLive && studySession) {
    return (
      <>
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
                  {t("live.participantsCount")} · 🎓 Live Classroom
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Responsive Attendance Trigger */}
              <Pressable
                style={[styles.utilityBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setAttendanceVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Live Attendance"
              >
                <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={colors.primary} />
                <Text style={[styles.utilityBtnText, { color: colors.primary }]}>Attendance</Text>
              </Pressable>

              {/* Join Button */}
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
          </View>

          {/* Sub notice */}
          <Text style={[styles.subNotice, { color: colors.muted }]}>
            {t("live.studySessionLiveNotice")}
          </Text>
        </View>

        <RoomSessionAttendanceModal
          visible={attendanceVisible}
          roomId={roomId}
          roomTitle={roomTitle}
          sessionId={studySession.id}
          isTeacher={isTeacherUser}
          onClose={() => setAttendanceVisible(false)}
        />
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. STATE B: OPEN SESSION IS LIVE (Audio or Video)
  // Only visible to members when teacher started it!
  // ─────────────────────────────────────────────────────────────────────────
  if (openSession) {
    const isVideo = openSession.media === "video";
    const participants = openSession.participants || [];

    return (
      <>
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
                  {isVideo ? "Teacher Video Classroom Live" : "Teacher Audio Session Live"}
                </Text>
                <Text style={[styles.subText, { color: colors.muted }]}>
                  {openSession.participantCount} {t("live.participantsCount")} · Tap to join
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

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Responsive In-Session Attendance Button */}
              <Pressable
                style={[styles.utilityBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setAttendanceVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Live Attendance"
              >
                <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={colors.primary} />
                <Text style={[styles.utilityBtnText, { color: colors.primary }]}>Attendance</Text>
              </Pressable>

              {/* Visible Join Audio / Video Button */}
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.success }]}
                onPress={() => handleJoinOpen(openSession.media)}
                accessibilityRole="button"
                accessibilityLabel={isCurrentSessionActive ? t("live.return") : t("live.join")}
              >
                <MaterialCommunityIcons
                  name={isVideo ? "video" : "volume-high"}
                  size={15}
                  color="#FFFFFF"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.actionBtnText}>
                  {isCurrentSessionActive ? t("live.return") : isVideo ? "Join Video" : "Join Audio"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <RoomSessionAttendanceModal
          visible={attendanceVisible}
          roomId={roomId}
          roomTitle={roomTitle}
          sessionId={openSession.id}
          isTeacher={isTeacherUser}
          onClose={() => setAttendanceVisible(false)}
        />
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. STATE D: STUDY SESSION SCHEDULED SOON (Within 2 mins)
  // ─────────────────────────────────────────────────────────────────────────
  const studyWindowActive = data?.studyWindow?.active;
  if (studyWindowActive || me?.canStartOpen === false && !isTeacherUser && !me?.canJoin) {
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

  // ─────────────────────────────────────────────────────────────────────────
  // 4. STATE A: NOTHING LIVE (Clean Separation between Members & Teachers)
  // ─────────────────────────────────────────────────────────────────────────

  // FOR REGULAR MEMBERS: Join buttons are HIDDEN.
  // Instead, show status and direct actions to Request a Session, Call Teacher, or Ask Question!
  if (!isTeacherUser) {
    return (
      <>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.memberHelpCard}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[styles.idleDot, { backgroundColor: colors.muted }]} />
                <Text style={[styles.idleTitle, { color: colors.text }]}>
                  No Live Session Right Now
                </Text>
              </View>
              <Text style={[styles.idleSubtitle, { color: colors.muted }]}>
                Voice & video classes appear here when a teacher starts one. Need help?
              </Text>
            </View>

            {/* Member Quick Action Buttons */}
            <View style={styles.memberActionRow}>
              {/* Request Session / Immediate Help */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setRequestSessionVisible(true);
                }}
                style={[
                  styles.memberQuickBtn,
                  { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}40` },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Request Session"
              >
                <MaterialCommunityIcons name="hand-wave" size={15} color={colors.primary} />
                <Text style={[styles.memberQuickBtnText, { color: colors.primary }]}>
                  Request Session
                </Text>
              </Pressable>

              {/* Direct Call to Teacher */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setTeacherCallVisible(true);
                }}
                style={[
                  styles.memberQuickBtn,
                  { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Call Teacher"
              >
                <MaterialCommunityIcons name="phone-outgoing" size={15} color={colors.text} />
                <Text style={[styles.memberQuickBtnText, { color: colors.text }]}>
                  Call Teacher
                </Text>
              </Pressable>

              {/* Ask Question */}
              {onAskQuestion && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    onAskQuestion();
                  }}
                  style={[
                    styles.memberQuickBtn,
                    { backgroundColor: colors.surface2, borderColor: colors.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Ask Question"
                >
                  <MaterialCommunityIcons name="help-circle-outline" size={15} color={colors.text} />
                  <Text style={[styles.memberQuickBtnText, { color: colors.text }]}>
                    Ask Question
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Modals */}
        <TeacherCallModal
          visible={teacherCallVisible}
          roomId={roomId}
          roomTitle={roomTitle}
          onClose={() => setTeacherCallVisible(false)}
        />

        <RequestSessionModal
          visible={requestSessionVisible}
          roomId={roomId}
          roomTitle={roomTitle}
          onClose={() => setRequestSessionVisible(false)}
        />
      </>
    );
  }

  // FOR TEACHERS & ADMINS: Controls to start Audio or Video class, or view requests
  return (
    <>
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

          {/* Teacher Study Session Actions */}
          <View style={styles.studyActionsGroup}>
            {/* View Attendance Log */}
            <Pressable
              style={[styles.iconActionBtn, { backgroundColor: colors.surface2 }]}
              onPress={() => setAttendanceVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="View Attendance Log"
            >
              <MaterialCommunityIcons name="clipboard-check-outline" size={18} color={colors.primary} />
            </Pressable>

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
        </View>
      </View>

      <RoomSessionAttendanceModal
        visible={attendanceVisible}
        roomId={roomId}
        roomTitle={roomTitle}
        isTeacher={true}
        onClose={() => setAttendanceVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
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
    gap: 12,
  },
  leftInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
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
    marginTop: 1,
  },
  subNotice: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic",
  },
  avatarStack: {
    flexDirection: "row",
    width: 56,
    height: 28,
    position: "relative",
  },
  stackAvatarWrapper: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
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
    fontSize: 11,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  utilityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  utilityBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  idleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  startBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  studyActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  memberHelpCard: {
    gap: 10,
  },
  idleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  idleTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  idleSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  memberActionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  memberQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  memberQuickBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
