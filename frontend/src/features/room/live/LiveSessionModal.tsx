import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLiveSessionStore } from "./useLiveSessionStore";
import { LiveSessionRoster } from "./LiveSessionRoster";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";

export const LiveSessionModal: React.FC = () => {
  const { colors } = useTheme();
  const { t } = useI18n();

  const {
    status,
    roomId,
    roomTitle,
    media,
    kind,
    isHost,
    error,
    isMuted,
    isCameraOn,
    isSpeakerOn,
    isSheetOpen,
    nextStudySessionPrompt,
    studyWarningText,
    setSheetOpen,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    toggleCameraFacing,
    leaveSession,
    endSession,
    joinSession,
    clearStudyPrompt,
  } = useLiveSessionStore();

  if (!isSheetOpen) {
    return null;
  }

  const isVideo = media === "video";
  const isConnecting = status === "requesting" || status === "connecting" || status === "reconnecting";
  const isConnected = status === "connected";
  const isFailed = status === "failed" || Boolean(error);

  const handleMinimize = () => {
    triggerHaptic();
    setSheetOpen(false);
  };

  const handleLeave = () => {
    triggerHaptic();
    void leaveSession();
  };

  const handleEnd = () => {
    triggerHaptic();
    void endSession();
  };

  const handleJoinNextStudy = () => {
    triggerHaptic();
    if (roomId && roomTitle && nextStudySessionPrompt?.nextStudySessionId) {
      const nextId = nextStudySessionPrompt.nextStudySessionId;
      clearStudyPrompt();
      void joinSession({
        roomId,
        roomTitle,
        media: "video",
        preferredSessionId: nextId,
      });
    }
  };

  return (
    <Modal
      visible={isSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={handleMinimize}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header Drag Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Sheet Header */}
          <View style={styles.header}>
            <Pressable
              onPress={handleMinimize}
              style={[styles.headerIconBtn, { backgroundColor: colors.surface2 }]}
              accessibilityRole="button"
              accessibilityLabel="Minimize session"
            >
              <MaterialCommunityIcons name="chevron-down" size={24} color={colors.text} />
            </Pressable>

            <View style={styles.headerInfo}>
              <View style={styles.headerTitleRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? colors.success : colors.primary },
                  ]}
                />
                <Text style={[styles.roomTitleText, { color: colors.text }]} numberOfLines={1}>
                  {roomTitle || "Live Room"}
                </Text>
              </View>
              <Text style={[styles.sessionTypeSub, { color: colors.muted }]}>
                {kind === "study"
                  ? t("live.studySession")
                  : isVideo
                  ? t("live.openVideoSession")
                  : t("live.openAudioSession")}
              </Text>
            </View>

            {/* Leave / End Buttons */}
            <View style={styles.headerActions}>
              {isHost && isConnected && (
                <Pressable
                  onPress={handleEnd}
                  style={[styles.endSessionBtn, { backgroundColor: colors.danger + "20" }]}
                  accessibilityRole="button"
                  accessibilityLabel={t("live.end")}
                >
                  <Text style={[styles.endSessionText, { color: colors.danger }]}>
                    {t("live.end")}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleLeave}
                style={[styles.leaveBtn, { backgroundColor: colors.danger }]}
                accessibilityRole="button"
                accessibilityLabel={t("live.leave")}
              >
                <Text style={styles.leaveBtnText}>{t("live.leave")}</Text>
              </Pressable>
            </View>
          </View>

          {/* 5-Minute Study Session Warning Banner */}
          {studyWarningText && (
            <View style={[styles.warningBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={18} color={colors.warning} />
              <Text style={[styles.warningText, { color: colors.text }]}>
                {studyWarningText}
              </Text>
            </View>
          )}

          {/* Study Session Start Transition Prompt */}
          {nextStudySessionPrompt && (
            <View style={[styles.promptBanner, { backgroundColor: colors.accent + "18", borderColor: colors.accent }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.promptTitle, { color: colors.accent }]}>
                  Study Session Live 🎓
                </Text>
                <Text style={[styles.promptBody, { color: colors.text }]}>
                  {nextStudySessionPrompt.message}
                </Text>
              </View>
              <Pressable
                onPress={handleJoinNextStudy}
                style={[styles.joinPromptBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={styles.joinPromptBtnText}>Join Study</Text>
              </Pressable>
            </View>
          )}

          {/* Content Area */}
          <View style={styles.contentArea}>
            {isFailed ? (
              <View style={styles.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
                <Text style={[styles.errorTitle, { color: colors.text }]}>
                  {t("live.failed")}
                </Text>
                <Text style={[styles.errorDetail, { color: colors.muted }]}>
                  {error || "An unexpected error occurred while connecting."}
                </Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    if (roomId && roomTitle) {
                      void joinSession({ roomId, roomTitle, media });
                    }
                  }}
                  style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.retryBtnText}>Retry Connection</Text>
                </Pressable>
              </View>
            ) : isConnecting ? (
              <View style={styles.connectingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.connectingText, { color: colors.text }]}>
                  {status === "reconnecting" ? t("live.reconnecting") : t("live.connecting")}
                </Text>
              </View>
            ) : (
              <LiveSessionRoster />
            )}
          </View>

          {/* Bottom Control Bar */}
          {isConnected && (
            <View style={[styles.controlsBar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              {/* Microphone Toggle */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  toggleMute();
                }}
                style={[
                  styles.controlItem,
                  { backgroundColor: isMuted ? colors.danger + "20" : colors.surface },
                ]}
                accessibilityRole="button"
                accessibilityLabel={isMuted ? t("live.unmute") : t("live.mute")}
              >
                <MaterialCommunityIcons
                  name={isMuted ? "microphone-off" : "microphone"}
                  size={22}
                  color={isMuted ? colors.danger : colors.text}
                />
                <Text style={[styles.controlLabel, { color: isMuted ? colors.danger : colors.text }]}>
                  {isMuted ? t("live.muted") : "Mute"}
                </Text>
              </Pressable>

              {/* Camera Toggle (Video Only) */}
              {isVideo && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    toggleCamera();
                  }}
                  style={[
                    styles.controlItem,
                    { backgroundColor: !isCameraOn ? colors.surface : colors.primary + "20" },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Camera"
                >
                  <MaterialCommunityIcons
                    name={isCameraOn ? "camera" : "camera-off"}
                    size={22}
                    color={isCameraOn ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.controlLabel, { color: isCameraOn ? colors.primary : colors.muted }]}>
                    {isCameraOn ? "Cam On" : "Cam Off"}
                  </Text>
                </Pressable>
              )}

              {/* Flip Camera Facing (Native Video Only) */}
              {isVideo && Platform.OS !== "web" && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    toggleCameraFacing();
                  }}
                  style={[styles.controlItem, { backgroundColor: colors.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel="Flip Camera"
                >
                  <MaterialCommunityIcons name="camera-flip" size={22} color={colors.text} />
                  <Text style={[styles.controlLabel, { color: colors.text }]}>Flip</Text>
                </Pressable>
              )}

              {/* Speaker Output Toggle */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  toggleSpeaker();
                }}
                style={[
                  styles.controlItem,
                  { backgroundColor: isSpeakerOn ? colors.surface : colors.muted + "20" },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Toggle Speaker"
              >
                <MaterialCommunityIcons
                  name={isSpeakerOn ? "volume-high" : "volume-medium"}
                  size={22}
                  color={isSpeakerOn ? colors.primary : colors.muted}
                />
                <Text style={[styles.controlLabel, { color: isSpeakerOn ? colors.primary : colors.muted }]}>
                  Speaker
                </Text>
              </Pressable>

              {/* Minimize Sheet Button */}
              <Pressable
                onPress={handleMinimize}
                style={[styles.controlItem, { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Minimize to background"
              >
                <MaterialCommunityIcons name="arrow-collapse" size={22} color={colors.text} />
                <Text style={[styles.controlLabel, { color: colors.text }]}>Minimize</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "82%",
    borderTopLeftRadius: radius.xl || 24,
    borderTopRightRadius: radius.xl || 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roomTitleText: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  sessionTypeSub: {
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  endSessionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  endSessionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  leaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  leaveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  promptBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  promptTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  promptBody: {
    fontSize: 11,
  },
  joinPromptBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  joinPromptBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  contentArea: {
    flex: 1,
    justifyContent: "center",
  },
  connectingBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  connectingText: {
    fontSize: 15,
    fontWeight: "600",
  },
  errorBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  errorDetail: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
  controlItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    minWidth: 64,
    gap: 4,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
