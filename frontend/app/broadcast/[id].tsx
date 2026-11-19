import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  Share,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { YouTubePlayer } from "@/components/live/YouTubePlayer";
import { Button, Card, H2, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { nextGenIllustrations } from "@/assets/nextgen";

export interface RoomQuestion {
  id: string;
  room_id: string;
  author_id: string;
  title: string;
  body: string;
  is_resolved: boolean;
  upvotes_count: number;
  created_at: string;
  author?: {
    id: string;
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
  answers?: any[];
  status?: "pending" | "accepted_live" | "answered";
}

function extractYouTubeId(urlOrId?: string | null): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  // Standard 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // Standard or shortened YouTube URL
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
  );
  return match ? match[1] : null;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "just now";
  const now = Date.now();
  const created = new Date(dateString).getTime();
  const diffSec = Math.floor((now - created) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

type FilterTab = "top" | "recent" | "stage";

const PROMPT_SUGGESTIONS = [
  "Can you demonstrate an example on stage?",
  "Will the slides & materials be shared?",
  "What is the industry standard approach for this?",
];

export default function BroadcastScreen() {
  const { id, videoId, title, clubName } = useLocalSearchParams<{
    id: string;
    videoId?: string;
    title?: string;
    clubName?: string;
  }>();

  const cleanRoomId = useMemo(() => (id || "").replace(/^qa-stage-/, "").trim(), [id]);

  const { colors } = useTheme();
  const qc = useQueryClient();
  const keyboardHeight = useKeyboardHeight();

  const [activeTab, setActiveTab] = useState<FilterTab>("top");
  const [newQuestion, setNewQuestion] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({});
  const [attendeeCount, setAttendeeCount] = useState<number>(1);

  // 1. Fetch Room Metadata for real title, topic, and broadcast URL
  const { data: roomData } = useQuery<{ room?: any }>({
    queryKey: ["room", cleanRoomId],
    queryFn: () => api<{ room?: any }>(`/rooms/${cleanRoomId}`),
    enabled: Boolean(cleanRoomId),
    staleTime: 60000,
  });

  const resolvedTitle = title || roomData?.room?.title || "Campus Workshop & Live Seminar";
  const resolvedClub = clubName || roomData?.room?.topic || "SkillBridge Live";
  const resolvedVideoId = useMemo(() => {
    return (
      extractYouTubeId(videoId) ||
      extractYouTubeId(roomData?.room?.broadcast_url) ||
      extractYouTubeId((roomData?.room as any)?.youtube_video_id) ||
      null
    );
  }, [videoId, roomData]);

  // 2. Fetch Live Questions from Database
  const {
    data: qData,
    isLoading: isQLoading,
    refetch: refetchQuestions,
  } = useQuery<{ questions: RoomQuestion[] }>({
    queryKey: ["room-questions", cleanRoomId],
    queryFn: () => api<{ questions: RoomQuestion[] }>(`/rooms/${cleanRoomId}/questions`),
    enabled: Boolean(cleanRoomId),
    refetchInterval: 12000,
  });

  const rawQuestions = useMemo(() => qData?.questions ?? [], [qData]);

  // 3. Socket.IO Real-time Synchronization
  useEffect(() => {
    if (!cleanRoomId) return;
    const socket = getSocket();
    if (!socket) return;

    // Join room presence and broadcast room
    socket.emit("room:presence:subscribe", { roomId: cleanRoomId });
    socket.emit("room:subscribe", { roomId: cleanRoomId });

    const handleNewQuestion = () => {
      qc.invalidateQueries({ queryKey: ["room-questions", cleanRoomId] });
    };

    const handleQuestionVoted = (payload: any) => {
      qc.invalidateQueries({ queryKey: ["room-questions", cleanRoomId] });
    };

    const handleQuestionResolved = () => {
      qc.invalidateQueries({ queryKey: ["room-questions", cleanRoomId] });
    };

    const handlePresence = (payload: any) => {
      if (typeof payload?.liveParticipantCount === "number") {
        setAttendeeCount(Math.max(1, payload.liveParticipantCount));
      }
    };

    socket.on("room:qa:new", handleNewQuestion);
    socket.on("room:qa:voted", handleQuestionVoted);
    socket.on("room:qa:resolved", handleQuestionResolved);
    socket.on("room:presence", handlePresence);

    return () => {
      socket.off("room:qa:new", handleNewQuestion);
      socket.off("room:qa:voted", handleQuestionVoted);
      socket.off("room:qa:resolved", handleQuestionResolved);
      socket.off("room:presence", handlePresence);
      socket.emit("room:presence:unsubscribe", { roomId: cleanRoomId });
      socket.emit("room:unsubscribe", { roomId: cleanRoomId });
    };
  }, [cleanRoomId, qc]);

  // 4. Upvote Mutation
  const voteMutation = useMutation({
    mutationFn: (qId: string) =>
      api<{ success: boolean; voted: boolean; upvotes_count: number }>(
        `/rooms/${cleanRoomId}/questions/${qId}/vote`,
        { method: "POST" },
      ),
    onMutate: async (qId: string) => {
      triggerHaptic("selection");
      const currentVote = Boolean(userVotes[qId]);
      setUserVotes((prev) => ({ ...prev, [qId]: !currentVote }));

      await qc.cancelQueries({ queryKey: ["room-questions", cleanRoomId] });
      const previous = qc.getQueryData<{ questions: RoomQuestion[] }>(["room-questions", cleanRoomId]);

      if (previous?.questions) {
        qc.setQueryData(["room-questions", cleanRoomId], {
          ...previous,
          questions: previous.questions.map((q) => {
            if (q.id === qId) {
              const delta = currentVote ? -1 : 1;
              return {
                ...q,
                upvotes_count: Math.max(0, (q.upvotes_count || 0) + delta),
              };
            }
            return q;
          }),
        });
      }
      return { previous, qId, currentVote };
    },
    onError: (_err, qId, context) => {
      if (context) {
        setUserVotes((prev) => ({ ...prev, [qId]: context.currentVote }));
        if (context.previous) {
          qc.setQueryData(["room-questions", cleanRoomId], context.previous);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["room-questions", cleanRoomId] });
    },
  });

  // 5. Ask Question Mutation
  const askMutation = useMutation({
    mutationFn: (text: string) =>
      api<{ question: RoomQuestion }>(`/rooms/${cleanRoomId}/questions`, {
        method: "POST",
        body: JSON.stringify({ title: text, body: text }),
      }),
    onSuccess: () => {
      triggerHaptic("notification");
      setNewQuestion("");
      qc.invalidateQueries({ queryKey: ["room-questions", cleanRoomId] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to submit question.";
      if (msg.includes("Join room before asking") || msg.includes("Join room")) {
        Alert.alert(
          "Join Room First",
          "You must join this room to ask questions. Would you like to join now?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Join Room",
              onPress: async () => {
                try {
                  await api(`/rooms/${cleanRoomId}/join`, { method: "POST" });
                  if (newQuestion.trim()) {
                    askMutation.mutate(newQuestion.trim());
                  }
                } catch (joinErr: any) {
                  Alert.alert("Error", joinErr?.message || "Could not join room.");
                }
              },
            },
          ],
        );
      } else {
        Alert.alert("Unable to Post", msg);
      }
    },
  });

  const handlePostQuestion = useCallback(() => {
    const trimmed = newQuestion.trim();
    if (!trimmed || trimmed.length < 3) {
      Alert.alert("Question too short", "Please write at least 3 characters.");
      return;
    }
    askMutation.mutate(trimmed);
  }, [newQuestion, askMutation]);

  // 6. Navigation to Live Q&A Stage (UUID validation safe)
  const handleJoinStage = useCallback(() => {
    triggerHaptic();
    if (!cleanRoomId) return;
    router.push(`/live/${cleanRoomId}` as any);
  }, [cleanRoomId]);

  const handleShare = useCallback(() => {
    triggerHaptic("selection");
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        void navigator.clipboard.writeText(window.location.href);
        window.alert("Broadcast link copied to clipboard!");
      }
    } else {
      void Share.share({
        title: resolvedTitle,
        message: `Join the live broadcast "${resolvedTitle}" on SkillBridge: https://skillbridge.app/broadcast/${cleanRoomId}`,
      });
    }
  }, [resolvedTitle, cleanRoomId]);

  // Filtered and Sorted Questions
  const filteredQuestions = useMemo(() => {
    let list = [...rawQuestions];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.body?.toLowerCase().includes(q) ||
          item.author?.full_name?.toLowerCase().includes(q),
      );
    }

    if (activeTab === "top") {
      list.sort((a, b) => (b.upvotes_count || 0) - (a.upvotes_count || 0));
    } else if (activeTab === "recent") {
      list.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
    } else if (activeTab === "stage") {
      list = list.filter((item) => item.status === "accepted_live" || item.is_resolved);
    }

    return list;
  }, [rawQuestions, searchQuery, activeTab]);

  return (
    <Screen scroll={false} contentStyle={{ flex: 1, padding: 0 }}>
      {/* 1. Live Video Stream Player (YouTube or Stage Standby) */}
      <View style={styles.videoSection}>
        <YouTubePlayer
          videoId={resolvedVideoId}
          isLive={true}
          title={resolvedTitle}
          onJoinStage={handleJoinStage}
        />
      </View>

      {/* 2. Broadcast Title & Info Bar */}
      <View
        style={[
          styles.infoBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <Pill tone="danger">🔴 LIVE</Pill>
            <Text style={[styles.clubTag, { color: colors.primary }]} numberOfLines={1}>
              {resolvedClub}
            </Text>
            <Text style={[styles.audienceTag, { color: colors.muted }]}>
              👥 {attendeeCount} online
            </Text>
          </Row>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {resolvedTitle}
          </Text>
        </View>

        <Row style={{ alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={handleShare}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
          </Pressable>

          <Button
            title="🎙️ Join Q&A Stage"
            compact
            variant="primary"
            onPress={handleJoinStage}
          />
        </Row>
      </View>

      {/* 3. Interactive SkillBridge Q&A Section */}
      <View style={styles.qaSection}>
        {/* Q&A Header & Tabs */}
        <View style={[styles.qaHeaderContainer, { borderBottomColor: colors.border }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <H2 style={{ fontSize: 16 }}>
              Live Q&A Queue ({rawQuestions.length})
            </H2>
            <Pressable onPress={() => refetchQuestions()} hitSlop={8}>
              <MaterialCommunityIcons name="refresh" size={18} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Filter Tabs */}
          <Row style={styles.tabsRow}>
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                setActiveTab("top");
              }}
              style={[
                styles.tabPill,
                activeTab === "top" && { backgroundColor: colors.primary, borderColor: colors.primary },
                activeTab !== "top" && { backgroundColor: colors.surface2, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name="fire"
                size={14}
                color={activeTab === "top" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  styles.tabPillText,
                  { color: activeTab === "top" ? "#FFFFFF" : colors.muted },
                ]}
              >
                Top Upvoted
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                setActiveTab("recent");
              }}
              style={[
                styles.tabPill,
                activeTab === "recent" && { backgroundColor: colors.primary, borderColor: colors.primary },
                activeTab !== "recent" && { backgroundColor: colors.surface2, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={activeTab === "recent" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  styles.tabPillText,
                  { color: activeTab === "recent" ? "#FFFFFF" : colors.muted },
                ]}
              >
                Recent
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                setActiveTab("stage");
              }}
              style={[
                styles.tabPill,
                activeTab === "stage" && { backgroundColor: colors.primary, borderColor: colors.primary },
                activeTab !== "stage" && { backgroundColor: colors.surface2, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name="microphone"
                size={14}
                color={activeTab === "stage" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  styles.tabPillText,
                  { color: activeTab === "stage" ? "#FFFFFF" : colors.muted },
                ]}
              >
                Stage Focus
              </Text>
            </Pressable>
          </Row>

          {/* Quick Filter Search Input */}
          <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={15} color={colors.muted} />
            <TextInput
              placeholder="Search live questions…"
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={6}>
                <MaterialCommunityIcons name="close-circle" size={15} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Question List */}
        {isQLoading && rawQuestions.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>
              Syncing live Q&A queue…
            </Text>
          </View>
        ) : filteredQuestions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Image
              source={nextGenIllustrations.qnaBoard}
              style={styles.emptyIllustration}
              resizeMode="contain"
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {searchQuery ? "No matching questions" : "No questions in the queue yet"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {searchQuery
                ? "Try searching with different keywords."
                : "Be the first to ask the live speaker a question! Top voted questions are answered on stage."}
            </Text>

            {/* Quick Prompt Suggestions */}
            {!searchQuery && (
              <View style={styles.suggestionsBox}>
                <Text style={[styles.suggestionHeading, { color: colors.muted }]}>
                  💡 Quick Suggestions:
                </Text>
                {PROMPT_SUGGESTIONS.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      triggerHaptic("selection");
                      setNewQuestion(item);
                    }}
                    style={[styles.suggestionChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <Text style={[styles.suggestionChipText, { color: colors.text }]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredQuestions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110, gap: 10 }}
            renderItem={({ item }) => {
              const authorName = item.author?.full_name || item.author?.username || "Student";
              const isUpvoted = Boolean(userVotes[item.id]);
              const upvoteCount = item.upvotes_count || 0;

              return (
                <Card style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Row style={{ alignItems: "center", gap: 6 }}>
                        <View style={[styles.avatarBadge, { backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                            {authorName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.authorName, { color: colors.text }]}>
                          {authorName}
                        </Text>
                        <Text style={[styles.timeAgo, { color: colors.muted }]}>
                          • {formatRelativeTime(item.created_at)}
                        </Text>
                        {item.status === "accepted_live" ? (
                          <Pill tone="accent">Speaking on Stage 🎙️</Pill>
                        ) : item.is_resolved ? (
                          <Pill tone="success">Answered ✅</Pill>
                        ) : null}
                      </Row>
                      <Text style={[styles.questionText, { color: colors.text }]}>
                        {item.title || item.body}
                      </Text>
                    </View>

                    {/* Interactive Upvote Button */}
                    <Pressable
                      onPress={() => voteMutation.mutate(item.id)}
                      disabled={voteMutation.isPending}
                      style={[
                        styles.upvoteBtn,
                        {
                          backgroundColor: isUpvoted ? colors.primary : colors.surface2,
                          borderColor: isUpvoted ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={isUpvoted ? "thumb-up" : "thumb-up-outline"}
                        size={16}
                        color={isUpvoted ? "#FFFFFF" : colors.muted}
                      />
                      <Text
                        style={[
                          styles.upvoteCount,
                          { color: isUpvoted ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {upvoteCount}
                      </Text>
                    </Pressable>
                  </Row>
                </Card>
              );
            }}
          />
        )}

        {/* Question Composer Form */}
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              bottom: Platform.OS === "ios" ? keyboardHeight : 0,
            },
          ]}
        >
          <TextInput
            placeholder="Ask a question for the live speaker…"
            placeholderTextColor={colors.muted}
            value={newQuestion}
            onChangeText={setNewQuestion}
            onSubmitEditing={handlePostQuestion}
            maxLength={300}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface2,
                borderColor: colors.border,
              },
            ]}
          />
          <Button
            title={askMutation.isPending ? "Posting…" : "Ask"}
            compact
            onPress={handlePostQuestion}
            disabled={!newQuestion.trim() || askMutation.isPending}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  videoSection: {
    width: "100%",
    backgroundColor: "#000000",
  },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  clubTag: {
    fontSize: 12,
    fontWeight: "700",
  },
  audienceTag: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qaSection: {
    flex: 1,
  },
  qaHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  tabsRow: {
    gap: 8,
    alignItems: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    height: "100%",
    padding: 0,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingVertical: 20,
    gap: 8,
  },
  emptyIllustration: {
    width: 140,
    height: 110,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  suggestionsBox: {
    width: "100%",
    marginTop: 14,
    gap: 6,
  },
  suggestionHeading: {
    fontSize: 12,
    fontWeight: "700",
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  questionCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatarBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  timeAgo: {
    fontSize: 11,
  },
  questionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  upvoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  upvoteCount: {
    fontSize: 12,
    fontWeight: "800",
  },
  composer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
  },
});
