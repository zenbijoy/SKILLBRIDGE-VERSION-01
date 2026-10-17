import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLiveSessionStore } from "./useLiveSessionStore";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";

export const ActiveLiveSessionBanner: React.FC = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const {
    status,
    roomTitle,
    media,
    kind,
    isMuted,
    isSheetOpen,
    toggleMute,
    leaveSession,
    setSheetOpen,
  } = useLiveSessionStore();

  useEffect(() => {
    if (status === "connected") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [status, pulseAnim]);

  // Only show mini-bar when active/connecting AND full sheet is minimized
  const isActive = status === "connected" || status === "connecting" || status === "reconnecting";
  if (!isActive || isSheetOpen) {
    return null;
  }

  const isAudio = media === "audio";
  const isConnecting = status === "connecting" || status === "reconnecting";

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.surface,
          borderColor: kind === "study" ? colors.accent : colors.primary,
          shadowColor: colors.text,
        },
      ]}
    >
      <Pressable
        style={styles.content}
        onPress={() => {
          triggerHaptic();
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Maximize active session"
      >
        {/* Pulsing Live / Status Icon */}
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: isConnecting
                ? colors.primary + "20"
                : colors.success + "20",
            },
          ]}
        >
          {isConnecting ? (
            <MaterialCommunityIcons
              name="sync"
              size={18}
              color={colors.primary}
            />
          ) : (
            <Animated.View style={{ opacity: pulseAnim }}>
              <MaterialCommunityIcons
                name={isAudio ? "microphone" : "video"}
                size={18}
                color={colors.success}
              />
            </Animated.View>
          )}
        </View>

        {/* Room Info */}
        <View style={styles.textContainer}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.liveBadge,
                {
                  backgroundColor:
                    kind === "study" ? colors.accent : colors.success,
                },
              ]}
            >
              <Text style={styles.liveBadgeText}>
                {kind === "study" ? "STUDY" : "LIVE"}
              </Text>
            </View>
            <Text
              style={[styles.roomTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {roomTitle || "Learning Space"}
            </Text>
          </View>
          <Text style={[styles.statusSubtext, { color: colors.muted }]}>
            {isConnecting
              ? t("live.connecting")
              : isAudio
              ? t("live.openAudioSession")
              : t("live.openVideoSession")}
          </Text>
        </View>

        {/* Action Controls */}
        <View style={styles.controlsRow}>
          {/* Mute toggle button */}
          <Pressable
            style={[
              styles.controlBtn,
              {
                backgroundColor: isMuted
                  ? colors.danger + "20"
                  : colors.surface2,
              },
            ]}
            onPress={(e) => {
              e.stopPropagation();
              triggerHaptic();
              toggleMute();
            }}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? t("live.unmute") : t("live.mute")}
          >
            <MaterialCommunityIcons
              name={isMuted ? "microphone-off" : "microphone"}
              size={18}
              color={isMuted ? colors.danger : colors.text}
            />
          </Pressable>

          {/* Leave button */}
          <Pressable
            style={[styles.leaveBtn, { backgroundColor: colors.danger }]}
            onPress={(e) => {
              e.stopPropagation();
              triggerHaptic();
              void leaveSession();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("live.leave")}
          >
            <MaterialCommunityIcons name="phone-hangup" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 84, // Float just above tab bar
    left: 16,
    right: 16,
    borderRadius: radius.lg || 16,
    borderWidth: 1.5,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    zIndex: 9999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  statusSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  leaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
