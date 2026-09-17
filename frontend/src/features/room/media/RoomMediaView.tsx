import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { VideoPlaylist, VideoProgress } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { RoomMaterialsHub } from "../RoomMaterialsHub";
import { RoomRecordings } from "../RoomRecordings";

type RoomMediaViewProps = {
  roomId: string;
  isHostOrMod?: boolean;
  isMember?: boolean;
};

type MediaFilter = "all" | "files" | "recordings" | "playlists";

export function RoomMediaView({ roomId, isHostOrMod, isMember }: RoomMediaViewProps) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<MediaFilter>("all");

  const { data: playlistsData } = useQuery<{ playlists: any[] }>({
    queryKey: ["room-playlists", roomId],
    queryFn: () => api<{ playlists: any[] }>(`/rooms/${roomId}/videos/playlists`),
    enabled: Boolean(roomId),
  });

  const { data: progressData } = useQuery<{ progress: any[] }>({
    queryKey: ["video-progress", roomId],
    queryFn: () => api<{ progress: any[] }>(`/rooms/${roomId}/videos/progress`),
    enabled: Boolean(roomId),
  });

  const filters: { key: MediaFilter; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { key: "all", label: "All Media", icon: "folder-multiple-outline" },
    { key: "files", label: "Files & Documents", icon: "file-document-outline" },
    { key: "recordings", label: "Class Recordings", icon: "youtube" },
    { key: "playlists", label: "Playlists", icon: "playlist-play" },
  ];

  const continueWatching = progressData?.progress?.filter((p: VideoProgress) => !p.completed && p.last_position_seconds > 0) ?? [];
  const playlists = playlistsData?.playlists ?? [];

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Segmented Filter Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {filters.map((f) => {
          const isSelected = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                triggerHaptic();
                setFilter(f.key);
              }}
              style={[
                s.filterPill,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={f.icon}
                size={16}
                color={isSelected ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  s.filterText,
                  { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "800" : "600" },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Continue Watching Section if available */}
      {(filter === "all" || filter === "recordings") && continueWatching.length > 0 && (
        <View style={s.sectionBlock}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>CONTINUE WATCHING</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {continueWatching.map((item: VideoProgress) => (
              <View key={item.recording_id} style={[s.continueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.progressThumb, { backgroundColor: colors.primary + "20" }]}>
                  <MaterialCommunityIcons name="play-circle" size={28} color={colors.primary} />
                </View>
                <Text style={[s.continueTitle, { color: colors.text }]} numberOfLines={1}>
                  Lecture Resume
                </Text>
                <Text style={[s.continueMeta, { color: colors.muted }]}>
                  {Math.round(item.last_position_seconds / 60)} min watched
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Video Playlists Section */}
      {(filter === "all" || filter === "playlists") && (
        <View style={s.sectionBlock}>
          <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.sectionTitle, { color: colors.muted }]}>VIDEO PLAYLISTS</Text>
          </Row>

          {playlists.length === 0 ? (
            <View style={[s.emptyPlaylist, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="playlist-music-outline" size={24} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.muted }}>No playlists organized yet.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {playlists.map((pl: VideoPlaylist) => (
                <View key={pl.id} style={[s.playlistCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.playlistIconBox, { backgroundColor: colors.primary + "14" }]}>
                    <MaterialCommunityIcons name="playlist-play" size={24} color={colors.primary} />
                  </View>
                  <Text style={[s.playlistTitle, { color: colors.text }]} numberOfLines={1}>
                    {pl.title}
                  </Text>
                  <Text style={[s.playlistCount, { color: colors.muted }]}>
                    {pl.items?.length ?? 0} videos
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Render Documents & Materials */}
      {(filter === "all" || filter === "files") && (
        <View style={s.sectionBlock}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM DOCUMENTS & MATERIALS</Text>
          <RoomMaterialsHub roomId={roomId} isMember={Boolean(isMember ?? isHostOrMod)} />
        </View>
      )}

      {/* Render Class Recordings Archive */}
      {(filter === "all" || filter === "recordings") && (
        <View style={s.sectionBlock}>
          <Text style={[s.sectionTitle, { color: colors.muted }]}>CLASS RECORDINGS & YOUTUBE ARCHIVE</Text>
          <RoomRecordings roomId={roomId} isModerator={Boolean(isHostOrMod)} />
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    paddingHorizontal: 2,
  },
  continueCard: {
    width: 140,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  progressThumb: {
    height: 70,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  continueTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  continueMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  playlistCard: {
    width: 140,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  playlistIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  playlistTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  playlistCount: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyPlaylist: {
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
