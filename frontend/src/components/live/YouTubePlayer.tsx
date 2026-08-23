import React from "react";
import { View, StyleSheet, Platform, Text, TouchableOpacity, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface YouTubePlayerProps {
  videoId: string;
  isLive?: boolean;
  autoplay?: boolean;
  style?: any;
}

export function YouTubePlayer({ videoId, isLive = false, autoplay = true, style }: YouTubePlayerProps) {
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&modestbranding=1&rel=0&iv_load_policy=3${isLive ? "&live=1" : ""}`;

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
});
