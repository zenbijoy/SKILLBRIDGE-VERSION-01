import React from "react";
import { View, StyleSheet, Platform, Text, TouchableOpacity, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface YouTubePlayerProps {
  videoId?: string | null;
  isLive?: boolean;
  autoplay?: boolean;
  title?: string;
  onJoinStage?: () => void;
  style?: any;
}

export function YouTubePlayer({
  videoId,
  isLive = false,
  autoplay = true,
  title,
  onJoinStage,
  style,
}: YouTubePlayerProps) {
  const cleanId = videoId?.trim();

  // If no video stream ID is provided, render an interactive Stage Standby state
  if (!cleanId) {
    return (
      <View style={[styles.container, styles.standbyContainer, style]}>
        <View style={styles.standbyContent}>
          <View style={styles.standbyBadge}>
            <View style={styles.standbyPulseDot} />
            <Text style={styles.standbyBadgeText}>{isLive ? "LIVE STAGE STANDBY" : "BROADCAST ROOM"}</Text>
          </View>
          <MaterialCommunityIcons name="broadcast" size={44} color="#38BDF8" style={{ marginTop: 4 }} />
          <Text style={styles.standbyTitle} numberOfLines={2}>
            {title || "Live Broadcast & Seminar Stage"}
          </Text>
          <Text style={styles.standbySubtitle}>
            {isLive
              ? "Live audio/video stage is active. Submit questions to the Q&A queue below or join the stage directly."
              : "Host has not started the video stream yet. Submit questions in advance!"}
          </Text>
          {onJoinStage && (
            <TouchableOpacity onPress={onJoinStage} style={styles.joinStageBtn} activeOpacity={0.85}>
              <MaterialCommunityIcons name="microphone" size={16} color="#FFFFFF" />
              <Text style={styles.joinStageBtnText}>Join Live Q&A Stage</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${cleanId}?autoplay=${autoplay ? 1 : 0}&modestbranding=1&rel=0&iv_load_policy=3${isLive ? "&live=1" : ""}`;

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          src={embedUrl}
          style={{ width: "100%", height: "100%", border: "none" } as any}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="SkillBridge Live Broadcast"
        />
      </View>
    );
  }

  // Native Mobile Player Container
  return (
    <View style={[styles.container, styles.nativeContainer, style]}>
      <MaterialCommunityIcons name="play-circle-outline" size={44} color="#38BDF8" />
      <Text style={styles.nativeTitle}>{isLive ? "🔴 Live Broadcast in Progress" : "Recorded Club Event"}</Text>
      <TouchableOpacity
        onPress={() => {
          void Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
        }}
        style={styles.watchBtn}
      >
        <MaterialCommunityIcons name="open-in-new" size={16} color="#FFFFFF" />
        <Text style={styles.watchBtnText}>Open in YouTube Player</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    borderRadius: 12,
    overflow: "hidden",
  },
  nativeContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
  },
  nativeTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  watchBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  standbyContainer: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  standbyContent: {
    alignItems: "center",
    maxWidth: 440,
    gap: 8,
  },
  standbyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  standbyPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#38BDF8",
  },
  standbyBadgeText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  standbyTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  standbySubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  joinStageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366F1",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  joinStageBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
