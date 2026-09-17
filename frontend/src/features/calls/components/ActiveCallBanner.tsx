import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallStore } from "../store/callStore";
import { endCallApi } from "../services/callApi";
import { getSocket } from "@/lib/socket";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

export const ActiveCallBanner: React.FC = () => {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeCall, setMinimized, resetCall } = useCallStore();
  const socket = getSocket();

  if (
    !activeCall ||
    !activeCall.isMinimized ||
    activeCall.status === "idle" ||
    activeCall.status === "ended" ||
    activeCall.status === "declined" ||
    activeCall.status === "failed" ||
    activeCall.status === "missed"
  ) {
    return null;
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleReturn = () => {
    triggerHaptic();
    setMinimized(false);
    router.push(`/call/${activeCall.callId}` as any);
  };

  const handleEnd = async () => {
    triggerHaptic();
    const callId = activeCall.callId;
    const dur = activeCall.durationSeconds || 0;
    try {
      socket?.emit("call:end", { callId, durationSeconds: dur });
      await endCallApi(callId, dur, "hangup");
    } catch {
      // Non-fatal
    } finally {
      resetCall();
    }
  };

  const isConnected = activeCall.status === "connected";
  const isVideo = activeCall.type === "video";

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
      <Pressable onPress={handleReturn} style={styles.content}>
        {/* Call Icon / Status Indicator */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isConnected ? "rgba(16, 185, 129, 0.18)" : colors.primarySoft },
          ]}
        >
          <MaterialCommunityIcons
            name={isVideo ? "video" : "phone"}
            size={18}
            color={isConnected ? colors.success : colors.primary}
          />
        </View>

        {/* Peer Avatar */}
        {activeCall.peer?.avatarUrl ? (
          <Image source={{ uri: activeCall.peer.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholderAvatar, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {activeCall.peer?.name ? activeCall.peer.name.charAt(0).toUpperCase() : "U"}
            </Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {activeCall.peer?.name || "SkillBridge Peer"}
          </Text>
          <Text style={[styles.status, { color: isConnected ? colors.success : colors.primary }]}>
            {isConnected
              ? formatDuration(activeCall.durationSeconds)
              : activeCall.status === "ringing"
              ? "Ringing…"
              : "Connecting…"}
          </Text>
        </View>

        {/* Tap to return pill */}
        <View style={[styles.returnBadge, { backgroundColor: colors.primarySoft }]}>
          <MaterialCommunityIcons name="arrow-expand" size={14} color={colors.primary} />
          <Text style={[styles.returnText, { color: colors.primary }]}>Return</Text>
        </View>
      </Pressable>

      {/* Quick Hangup Button */}
      <Pressable onPress={handleEnd} style={styles.endButton} hitSlop={8}>
        <MaterialCommunityIcons name="phone-hangup" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 50,
    left: 12,
    right: 12,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  placeholderAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
  },
  status: {
    fontSize: 11,
    fontWeight: "600",
  },
  returnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  returnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  endButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
