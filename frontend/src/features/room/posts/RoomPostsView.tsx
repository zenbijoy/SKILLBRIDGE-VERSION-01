import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Room, RoomPost, RoomPostType } from "@/types";
import { Row, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { nextGenIllustrations } from "@/assets/nextgen";
import { RoomPostCard } from "./RoomPostCard";
import { RoomPostComposer } from "./RoomPostComposer";
import { RoomPostComments } from "./RoomPostComments";

export type RoomPostsViewProps = {
  room: Room;
  currentUserId?: string;
  canPost?: boolean;
  canAnnounce?: boolean;
  canPin?: boolean;
  canModerate?: boolean;
  isEducator?: boolean;
  onOpenAnalytics?: () => void;
  onOpenPinnedHub?: () => void;
  externalComposerOpen?: boolean;
  onCloseExternalComposer?: () => void;
  composerInitialType?: RoomPostType;
};

export function RoomPostsView({
  room,
  currentUserId,
  canPost,
  canAnnounce,
  canPin,
  canModerate,
  isEducator = false,
  onOpenAnalytics,
  onOpenPinnedHub,
  externalComposerOpen = false,
  onCloseExternalComposer,
  composerInitialType = "discussion",
}: RoomPostsViewProps) {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();
  const [activeCommentsPost, setActiveCommentsPost] = useState<RoomPost | null>(null);
  const [internalComposerOpen, setInternalComposerOpen] = useState(false);
  const [activeComposerType, setActiveComposerType] = useState<RoomPostType>(composerInitialType);

  const isComposerOpen = externalComposerOpen || internalComposerOpen;
  const setIsComposerOpen = (open: boolean) => {
    setInternalComposerOpen(open);
    if (!open && onCloseExternalComposer) {
      onCloseExternalComposer();
    }
  };

  React.useEffect(() => {
    if (externalComposerOpen && composerInitialType) {
      setActiveComposerType(composerInitialType);
    }
  }, [externalComposerOpen, composerInitialType]);

  const postsQuery = useQuery({
    queryKey: ["room-posts", room.id],
    queryFn: () => api<{ posts: RoomPost[]; next_cursor: string | null }>(`/rooms/${room.id}/posts`),
    staleTime: 15_000,
  });

  const createPostMutation = useMutation({
    mutationFn: (payload: { title?: string; body: string; type: RoomPostType }) =>
      api<{ post: RoomPost }>(`/rooms/${room.id}/posts`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
      setIsComposerOpen(false);
    },
  });

  const toggleReactionMutation = useMutation({
    mutationFn: (post: RoomPost) =>
      api<{ success: boolean; reacted: boolean; reaction_type: string; likes_count: number }>(
        `/rooms/${room.id}/posts/${post.id}/reactions`,
        { method: "POST", body: JSON.stringify({ reaction_type: "helpful" }) },
      ),
    onMutate: async (post) => {
      await qc.cancelQueries({ queryKey: ["room-posts", room.id] });
      const previous = qc.getQueryData<{ posts: RoomPost[]; next_cursor: string | null }>(["room-posts", room.id]);

      if (previous) {
        const isReacted = Boolean(post.my_reaction);
        const updatedPosts = previous.posts.map((p) =>
          p.id === post.id
            ? {
                ...p,
                my_reaction: isReacted ? null : "helpful",
                likes_count: isReacted ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
              }
            : p,
        );
        qc.setQueryData(["room-posts", room.id], { ...previous, posts: updatedPosts });
      }

      return { previous };
    },
    onError: (_err, _post, context) => {
      if (context?.previous) {
        qc.setQueryData(["room-posts", room.id], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
    },
  });

  const pinPostMutation = useMutation({
    mutationFn: (post: RoomPost) =>
      api<{ post: RoomPost }>(`/rooms/${room.id}/posts/${post.id}/pin`, { method: "PATCH" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
    },
    onError: (err: Error) => Alert.alert("Could not update pin", err.message),
  });

  const deletePostMutation = useMutation({
    mutationFn: (post: RoomPost) =>
      api(`/rooms/${room.id}/posts/${post.id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
    },
    onError: (err: Error) => Alert.alert("Could not delete post", err.message),
  });

  const handleShare = async (post: RoomPost) => {
    try {
      await Share.share({
        title: post.title || `Post in ${room.title}`,
        message: `${post.title ? `${post.title}\n\n` : ""}${post.body}\n\nShared from ${room.title} on SkillBridge: https://skillbridge.app/room/${room.id}`,
      });
    } catch (err) {
      console.warn("Could not share post", err);
    }
  };

  const posts = postsQuery.data?.posts ?? [];
  const pinnedPost = posts.find((p) => p.is_pinned);
  const pinnedAuthorName = pinnedPost?.author?.full_name || "Emmanuel";

  return (
    <View style={s.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={postsQuery.isRefetching}
            onRefresh={() => postsQuery.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={s.topHeaderArea}>
            {/* ── Top Banner: Group Insights (Educator) vs Pinned Notes (Learner) ── */}
            {isEducator ? (
              /* Group Insights Card (Matching Left Phone) */
              <View
                style={[
                  s.groupInsightsCard,
                  {
                    backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    borderColor: isDark ? colors.border : "#E2E8F0",
                  },
                ]}
              >
                <Row style={{ alignItems: "center", gap: 8 }}>
                  <View style={s.insightsIconCircle}>
                    <MaterialCommunityIcons name="chart-box-outline" size={18} color="#2563EB" />
                  </View>
                  <Text style={[s.insightsTitle, { color: colors.text }]}>Group Insights</Text>
                </Row>

                <Row style={{ alignItems: "center", gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      onOpenAnalytics?.();
                    }}
                    style={({ pressed }) => [
                      s.viewInsightsBtn,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={s.viewInsightsText}>View</Text>
                  </Pressable>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={colors.muted} />
                </Row>
              </View>
            ) : (
              /* Pinned Notes Pill Banner (Matching Right Phone) */
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  if (pinnedPost) {
                    setActiveCommentsPost(pinnedPost);
                  } else if (onOpenPinnedHub) {
                    onOpenPinnedHub();
                  }
                }}
                style={({ pressed }) => [
                  s.pinnedNotesBanner,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="check" size={14} color="#C2410C" />
                  <Text style={s.pinnedNotesLabel}>Pinned Notes</Text>
                  <Text style={s.pinnedNotesDot}>·</Text>
                  <Text style={s.pinnedNotesAuthor}>{pinnedAuthorName}</Text>
                </Row>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          postsQuery.isLoading ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Skeleton height={120} style={{ borderRadius: 18 }} />
              <Skeleton height={120} style={{ borderRadius: 18 }} />
              <Skeleton height={120} style={{ borderRadius: 18 }} />
            </View>
          ) : (
            <View
              style={[
                s.emptyCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.text,
                },
              ]}
            >
              <Image
                source={nextGenIllustrations.qnaBoard}
                style={s.emptyIllustration}
                resizeMode="contain"
              />
              <Text style={[s.emptyTitle, { color: colors.text }]}>
                No discussions yet — start one!
              </Text>
              <Text style={[s.emptySub, { color: colors.muted }]}>
                Start a conversation, ask a question, or share your notes to help others learn.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <RoomPostCard
            post={item}
            currentUserId={currentUserId}
            canPin={canPin}
            canModerate={canModerate}
            isEducator={isEducator}
            onToggleReaction={(p) => toggleReactionMutation.mutate(p)}
            onOpenComments={(p) => setActiveCommentsPost(p)}
            onPinPost={(p) => pinPostMutation.mutate(p)}
            onDeletePost={(p) => deletePostMutation.mutate(p)}
            onSharePost={handleShare}
            onOpenQuiz={() => {}}
            onOpenNotes={() => {}}
          />
        )}
      />

      {/* ── Floating / Bottom Action Button (Matching Reference Mockup) ── */}
      <View style={s.floatingButtonContainer}>
        {isEducator ? (
          /* Educator "+ Create New Post" with ⇅ dropdown arrow */
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveComposerType("discussion");
              setIsComposerOpen(true);
            }}
            style={({ pressed }) => [
              s.educatorFloatingBtn,
              { opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              <Text style={s.floatingBtnText}>Create New Post</Text>
            </Row>
            <MaterialCommunityIcons name="swap-vertical" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          /* Learner "Begin Discussion" Button */
          <Pressable
            onPress={() => {
              triggerHaptic();
              if (canPost) {
                setActiveComposerType("discussion");
                setIsComposerOpen(true);
              } else {
                Alert.alert(
                  "Join Room",
                  "Please join this learning room first to begin a discussion.",
                );
              }
            }}
            style={({ pressed }) => [
              s.learnerFloatingBtn,
              { opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={s.floatingBtnText}>Begin Discussion</Text>
          </Pressable>
        )}
      </View>

      {/* Hidden container to keep composer modal mounted when needed */}
      <View style={{ height: 0, overflow: "hidden" }}>
        <RoomPostComposer
          roomId={room.id}
          roomTitle={room.title}
          canAnnounce={canAnnounce}
          initialType={activeComposerType}
          isOpen={isComposerOpen}
          onOpenChange={setIsComposerOpen}
          onSubmit={async (data) => {
            await createPostMutation.mutateAsync(data);
          }}
        />
      </View>

      {/* Threaded Comments Sheet */}
      <RoomPostComments
        post={activeCommentsPost}
        roomId={room.id}
        currentUserId={currentUserId}
        canModerate={canModerate}
        onClose={() => setActiveCommentsPost(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 90, // Leave room for floating button
  },
  topHeaderArea: {
    marginBottom: 8,
  },

  /* ── Group Insights Banner (Educator) ── */
  groupInsightsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  insightsIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  insightsTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  viewInsightsBtn: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  viewInsightsText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },

  /* ── Pinned Notes Banner (Learner) ── */
  pinnedNotesBanner: {
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    marginBottom: 4,
  },
  pinnedNotesLabel: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "700",
  },
  pinnedNotesDot: {
    color: "#EA580C",
    fontSize: 12,
    fontWeight: "700",
  },
  pinnedNotesAuthor: {
    color: "#9A3412",
    fontSize: 12,
    fontWeight: "700",
  },

  /* ── Empty State ── */
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIllustration: {
    width: 140,
    height: 100,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginTop: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 10,
  },

  /* ── Floating Action Buttons (Bottom) ── */
  floatingButtonContainer: {
    position: "absolute",
    bottom: 16,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  educatorFloatingBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#059669",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  learnerFloatingBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  floatingBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
