import React from "react";
import { View, Text, StyleSheet, Image, ScrollView, Dimensions } from "react-native";
import {
  useParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { useLiveSessionStore } from "./useLiveSessionStore";
import { useI18n } from "@/i18n";

export const LiveSessionRoster: React.FC = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const media = useLiveSessionStore((s) => s.media);
  const participants = useParticipants();

  const isVideo = media === "video";

  const videoTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  if (participants.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="account-group-outline"
          size={48}
          color={colors.muted}
        />
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          Waiting for participants to join...
        </Text>
      </View>
    );
  }

  // 1. Audio Mode Roster (Avatar Grid with Speaking Rings)
  if (!isVideo) {
    return (
      <ScrollView
        contentContainerStyle={styles.audioGrid}
        showsVerticalScrollIndicator={false}
      >
        {participants.map((p) => {
          let meta: any = {};
          try {
            meta = JSON.parse(p.metadata || "{}");
          } catch {}

          const name = meta.fullName || p.name || p.identity;
          const avatarUrl = meta.avatarUrl;
          const isHost = Boolean(meta.isHost);
          const isSpeaking = p.isSpeaking;
          const isMuted = !p.isMicrophoneEnabled;

          return (
            <View key={p.identity} style={styles.participantItem}>
              {/* Speaking Ring Wrapper */}
              <View
                style={[
                  styles.avatarRing,
                  {
                    borderColor: isSpeaking ? colors.success : "transparent",
                    backgroundColor: isSpeaking ? colors.success + "20" : "transparent",
                  },
                ]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                      {(name?.[0] || "?").toUpperCase()}
                    </Text>
                  </View>
                )}

                {/* Muted Icon Badge */}
                {isMuted && (
                  <View style={[styles.mutedBadge, { backgroundColor: colors.danger }]}>
                    <MaterialCommunityIcons name="microphone-off" size={10} color="#FFFFFF" />
                  </View>
                )}
              </View>

              {/* Name & Role */}
              <View style={styles.nameRow}>
                {isHost && (
                  <View style={[styles.hostBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.hostBadgeText}>HOST</Text>
                  </View>
                )}
                <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>
                  {name}
                </Text>
              </View>
              <Text style={[styles.statusText, { color: isSpeaking ? colors.success : colors.muted }]}>
                {isSpeaking ? t("live.speaking") : isMuted ? t("live.muted") : t("live.listening")}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // 2. Video Mode Roster (Adaptive Video Grid)
  const windowWidth = Dimensions.get("window").width;
  const numColumns = participants.length > 2 ? 2 : 1;
  const itemWidth = Math.min(480, (windowWidth - 48) / numColumns);
  const itemHeight = numColumns === 1 ? 280 : 200;

  return (
    <ScrollView
      contentContainerStyle={styles.videoGrid}
      showsVerticalScrollIndicator={false}
    >
      {participants.map((p) => {
        let meta: any = {};
        try {
          meta = JSON.parse(p.metadata || "{}");
        } catch {}

        const name = meta.fullName || p.name || p.identity;
        const isHost = Boolean(meta.isHost);
        const isSpeaking = p.isSpeaking;
        const isMuted = !p.isMicrophoneEnabled;

        const trackRef = videoTracks.find((t) => t.participant.identity === p.identity);

        return (
          <View
            key={p.identity}
            style={[
              styles.videoTile,
              {
                width: itemWidth,
                height: itemHeight,
                backgroundColor: colors.surface2,
                borderColor: isSpeaking ? colors.success : colors.border,
              },
            ]}
          >
            {trackRef && trackRef.publication && !trackRef.publication.isMuted ? (
              <VideoTrack
                trackRef={trackRef as any}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <View style={styles.cameraOffPlaceholder}>
                <View style={[styles.avatarPlaceholderLarge, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={[styles.avatarInitialLarge, { color: colors.primary }]}>
                    {(name?.[0] || "?").toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.cameraOffText, { color: colors.muted }]}>
                  Camera off
                </Text>
              </View>
            )}

            {/* Video Overlay Tag */}
            <View style={styles.videoTag}>
              {isHost && (
                <View style={[styles.hostBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.hostBadgeText}>HOST</Text>
                </View>
              )}
              <Text style={styles.videoTagName} numberOfLines={1}>
                {name}
              </Text>
              {isMuted && (
                <MaterialCommunityIcons name="microphone-off" size={12} color="#EF4444" />
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  audioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 16,
    justifyContent: "center",
  },
  participantItem: {
    width: 88,
    alignItems: "center",
  },
  avatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: "700",
  },
  mutedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    maxWidth: 84,
  },
  hostBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  hostBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  participantName: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusText: {
    fontSize: 10,
    marginTop: 1,
  },
  videoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 12,
    justifyContent: "center",
  },
  videoTile: {
    borderRadius: radius.md || 12,
    overflow: "hidden",
    borderWidth: 2,
    position: "relative",
  },
  cameraOffPlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  avatarPlaceholderLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialLarge: {
    fontSize: 26,
    fontWeight: "700",
  },
  cameraOffText: {
    fontSize: 12,
  },
  videoTag: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "85%",
  },
  videoTagName: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
});
