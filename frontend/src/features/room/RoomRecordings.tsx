import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Linking,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Row, ErrorState, Pill } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenAnimationsV2 } from "@/assets/nextgen";
import type { Profile } from "@/types";

export type Recording = {
  id: string;
  room_id: string;
  title: string;
  description?: string;
  youtube_video_id: string;
  youtube_url: string;
  duration_seconds: number;
  thumbnail_url?: string;
  status?: "pending" | "processing" | "ready" | "failed";
  source_type?: string;
  youtube_channel_id?: string;
  published_at?: string;
  privacy_status?: string;
  last_synced_at?: string;
  created_at: string;
  uploader?: Profile;
};

export function RoomRecordings({ roomId, isModerator }: { roomId: string; isModerator: boolean }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [syncingRecId, setSyncingRecId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{ recordings: Recording[] }>({
    queryKey: ["room-recordings", roomId],
    queryFn: () => api(`/rooms/${roomId}/recordings`),
    enabled: Boolean(roomId),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api(`/rooms/${roomId}/recordings`, {
        method: "POST",
        body: JSON.stringify({ title, description, youtubeUrl }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-recordings", roomId] });
      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setYoutubeUrl("");
    },
    onError: (err: any) => {
      if (err?.message?.includes("already exists") || err?.status === 409) {
        Alert.alert("Duplicate Recording", "This YouTube video has already been added to this room.");
      } else {
        Alert.alert("Could not add recording", err.message || "Failed to save video.");
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: (recId: string) =>
      api(`/rooms/${roomId}/recordings/${recId}/sync`, { method: "POST" }),
    onMutate: (recId) => {
      setSyncingRecId(recId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-recordings", roomId] });
      Alert.alert("Metadata Synced", "Video title, duration, and thumbnail have been refreshed.");
    },
    onError: (err: Error) => {
      Alert.alert("Sync Error", err.message || "Failed to sync metadata.");
    },
    onSettled: () => {
      setSyncingRecId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recId: string) =>
      api(`/rooms/${roomId}/recordings/${recId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-recordings", roomId] });
      Alert.alert("Deleted", "Recording removed from study room.");
    },
    onError: (err: Error) => {
      Alert.alert("Delete Error", err.message || "Failed to remove recording.");
    },
  });

  const handleDelete = (rec: Recording) => {
    Alert.alert(
      "Remove Recording",
      `Are you sure you want to remove "${rec.title}" from this study room?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(rec.id),
        },
      ]
    );
  };

  const allRecordings = data?.recordings ?? [];
  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return allRecordings;
    const q = searchQuery.toLowerCase().trim();
    return allRecordings.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [allRecordings, searchQuery]);

  return (
    <View style={styles.container}>
      <Row style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Classroom Recordings</Text>
        {isModerator && (
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="youtube" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Recording</Text>
          </Pressable>
        )}
      </Row>

      {/* Filter / Search Bar */}
      {allRecordings.length > 2 && (
        <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search recordings by title..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      )}

      {showAddModal && (
        <Card style={styles.addCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Add YouTube Class Recording</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Recording Title (optional: defaults to YouTube video title)"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="YouTube Link or Video ID (e.g. https://youtu.be/dQw4w9WgXcQ)"
            placeholderTextColor={colors.muted}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
          />
          <TextInput
            style={[styles.inputArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            placeholder="Description or timestamp index (optional)..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
          <Row style={styles.actionRow}>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => addMutation.mutate()}
              disabled={addMutation.isPending || !youtubeUrl.trim()}
              style={[
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: youtubeUrl.trim() ? 1 : 0.6 },
              ]}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Save Video</Text>
              )}
            </Pressable>
          </Row>
        </Card>
      )}

      {/* Embedded Player on Web */}
      {activeVideoId && Platform.OS === "web" && (
        <Card style={styles.playerCard}>
          <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <Row style={{ gap: 6, alignItems: "center" }}>
              <MaterialCommunityIcons name="play-circle" size={18} color={colors.primary} />
              <Text style={[styles.playingLabel, { color: colors.primary }]}>Now Playing</Text>
            </Row>
            <Pressable onPress={() => setActiveVideoId(null)}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </Row>
          <View style={styles.iframeContainer}>
            {/* @ts-ignore iframe on web */}
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1`}
              style={{ width: "100%", height: 340, border: "none", borderRadius: radius.md }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </View>
        </Card>
      )}

      {isError ? (
        <ErrorState
          detail={(error as Error)?.message || "Failed to load recordings."}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : filteredRecordings.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Image
            source={nextGenAnimationsV2.recordingReady}
            style={{ width: 64, height: 64, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {searchQuery ? "No matching recordings found" : "No session recordings archived yet"}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            {searchQuery
              ? "Try adjusting your search query."
              : "Room hosts can link past lecture videos for students to review."}
          </Text>
        </Card>
      ) : (
        filteredRecordings.map((rec) => (
          <Card key={rec.id} style={styles.recordingCard}>
            <Row style={styles.recordingContent}>
              <Pressable
                onPress={() => {
                  if (Platform.OS === "web") {
                    setActiveVideoId(rec.youtube_video_id);
                  } else {
                    Linking.openURL(rec.youtube_url).catch(() => {});
                  }
                }}
                style={styles.thumbWrapper}
              >
                <Image
                  source={{
                    uri:
                      rec.thumbnail_url ||
                      `https://img.youtube.com/vi/${rec.youtube_video_id}/hqdefault.jpg`,
                  }}
                  style={styles.thumbnail}
                />
                <View style={styles.playIconOverlay}>
                  <MaterialCommunityIcons name="play-circle" size={36} color="#FFFFFF" />
                </View>
                {rec.duration_seconds > 0 && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>
                      {Math.floor(rec.duration_seconds / 60)}:
                      {String(rec.duration_seconds % 60).padStart(2, "0")}
                    </Text>
                  </View>
                )}
              </Pressable>

              <View style={styles.metaCol}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={[styles.recTitle, { color: colors.text }]} numberOfLines={2}>
                    {rec.title}
                  </Text>
                  <Pill tone={rec.status === "failed" ? "danger" : "default"}>
                    {rec.status || "ready"}
                  </Pill>
                </Row>

                {rec.description ? (
                  <Text numberOfLines={2} style={[styles.recDesc, { color: colors.muted }]}>
                    {rec.description}
                  </Text>
                ) : null}

                <Text style={[styles.uploaderText, { color: colors.muted }]}>
                  Added by {rec.uploader?.full_name || "Host"} •{" "}
                  {new Date(rec.created_at).toLocaleDateString()}
                </Text>

                <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS === "web") {
                        setActiveVideoId(rec.youtube_video_id);
                      } else {
                        Linking.openURL(rec.youtube_url).catch(() => {});
                      }
                    }}
                    style={styles.watchBtn}
                  >
                    <MaterialCommunityIcons name="play" size={15} color={colors.primary} />
                    <Text style={[styles.watchBtnText, { color: colors.primary }]}>Watch Replay</Text>
                  </Pressable>

                  {isModerator && (
                    <Row style={{ gap: 8 }}>
                      <Pressable
                        onPress={() => syncMutation.mutate(rec.id)}
                        disabled={syncingRecId === rec.id}
                        style={styles.modActionBtn}
                      >
                        {syncingRecId === rec.id ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <MaterialCommunityIcons name="sync" size={16} color={colors.muted} />
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(rec)}
                        style={styles.modActionBtn}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
                      </Pressable>
                    </Row>
                  )}
                </Row>
              </View>
            </Row>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  headerRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "700" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13 },
  addCard: { padding: 14, marginBottom: 14, borderRadius: radius.lg },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  inputArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  actionRow: { justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.md },
  submitBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  playerCard: { padding: 10, marginBottom: 14, borderRadius: radius.lg },
  playingLabel: { fontSize: 14, fontWeight: "700" },
  iframeContainer: { width: "100%", overflow: "hidden", borderRadius: radius.md },
  emptyCard: { padding: 28, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, fontWeight: "600", marginTop: 8 },
  emptySubtext: { fontSize: 13, marginTop: 4, textAlign: "center" },
  recordingCard: { padding: 12, marginBottom: 12, borderRadius: radius.lg },
  recordingContent: { gap: 12, alignItems: "flex-start" },
  thumbWrapper: {
    width: 120,
    height: 75,
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000000",
  },
  thumbnail: { width: "100%", height: "100%" },
  playIconOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  durationText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  metaCol: { flex: 1 },
  recTitle: { fontSize: 15, fontWeight: "700", flex: 1, marginRight: 6 },
  recDesc: { fontSize: 13, marginTop: 3 },
  uploaderText: { fontSize: 11, marginTop: 4 },
  watchBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  watchBtnText: { fontSize: 12, fontWeight: "700" },
  modActionBtn: { padding: 4 },
});
