import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Skeleton, triggerHaptic } from "@/components/ui";
import { useTheme } from "@/theme";
import { RoomPostCard } from "./RoomPostCard";
import { RoomPostComposer } from "./RoomPostComposer";
import { RoomPostComments } from "./RoomPostComments";

type RoomPostsViewProps = {
  room: Room;
  currentUserId?: string;
  canPost?: boolean;
  canAnnounce?: boolean;
  canPin?: boolean;
  canModerate?: boolean;
};

export function RoomPostsView({
  room,
  currentUserId,
  canPost,
  canAnnounce,
  canPin,
  canModerate,
}: RoomPostsViewProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [activeCommentsPost, setActiveCommentsPost] = useState<RoomPost | null>(null);

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
          canPost ? (
            <View style={{ marginBottom: 6 }}>
              <RoomPostComposer
                roomId={room.id}
                roomTitle={room.title}
                canAnnounce={canAnnounce}
                onSubmit={async (data) => {
                  await createPostMutation.mutateAsync(data);
                }}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          postsQuery.isLoading ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Skeleton height={110} />
              <Skeleton height={110} />
              <Skeleton height={110} />
            </View>
          ) : (
            <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="forum-outline" size={40} color={colors.muted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>No room discussions yet</Text>
              <Text style={[s.emptySub, { color: colors.muted }]}>
                Be the first to start a conversation, ask a problem question, or share notes.
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
            onToggleReaction={(p) => toggleReactionMutation.mutate(p)}
            onOpenComments={(p) => setActiveCommentsPost(p)}
            onPinPost={(p) => pinPostMutation.mutate(p)}
            onDeletePost={(p) => deletePostMutation.mutate(p)}
            onSharePost={handleShare}
          />
        )}
      />

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
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
