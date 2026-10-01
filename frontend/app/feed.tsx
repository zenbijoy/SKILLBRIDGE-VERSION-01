import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Row, Screen, ErrorState, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenAnimations } from "@/assets/nextgen";
import type { Profile } from "@/types";
import { UniversalShareSheet } from "@/components/UniversalShareSheet";
import {
  PostCard,
  PostComposer,
  EditPostModal,
  type SocialPost,
  type ReactionType,
  type PostType,
} from "@/features/social";

interface FeedFilterOption {
  type: PostType | "all";
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const FILTER_OPTIONS: FeedFilterOption[] = [
  { type: "all", label: "All Posts", icon: "earth" },
  { type: "question", label: "Questions", icon: "help-circle-outline" },
  { type: "poll", label: "Polls", icon: "poll" },
  { type: "event", label: "Events", icon: "calendar-star" },
  { type: "achievement", label: "Achievements", icon: "trophy-outline" },
  { type: "opportunity", label: "Opportunities", icon: "briefcase-outline" },
  { type: "study_note", label: "Study Notes", icon: "book-open-page-variant" },
  { type: "code", label: "Code", icon: "code-tags" },
  { type: "quote", label: "Quotes", icon: "format-quote-close" },
];

export default function CampusFeedScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [selectedType, setSelectedType] = useState<PostType | "all">("all");
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);

  // Modals state
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [sharingPost, setSharingPost] = useState<SocialPost | null>(null);

  // Current logged in user profile
  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile", "me"],
    queryFn: () => api("/profiles/me"),
  });

  // Query campus feed with filters
  const feedQueryKey = ["campus-feed", selectedType, selectedHashtag];
  const {
    data,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useQuery<{ posts: SocialPost[]; next_cursor: string | null }>({
    queryKey: feedQueryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedType !== "all") {
        params.append("post_type", selectedType);
      }
      if (selectedHashtag) {
        params.append("hashtag", selectedHashtag);
      }
      const qs = params.toString();
      return api(`/feed${qs ? `?${qs}` : ""}`);
    },
  });

  // Reactions mutation
  const reactionMutation = useMutation({
    mutationFn: ({ postId, type }: { postId: string; type: ReactionType }) =>
      api(`/feed/${postId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ reaction_type: type }),
      }),
    onMutate: async ({ postId, type }) => {
      await qc.cancelQueries({ queryKey: feedQueryKey });
      const previous = qc.getQueryData<{ posts: SocialPost[]; next_cursor: string | null }>(feedQueryKey);

      if (previous) {
        qc.setQueryData(feedQueryKey, {
          ...previous,
          posts: previous.posts.map((p) => {
            if (p.id !== postId) return p;
            const wasSameReaction = p.my_reaction === type;
            const deltaLikes = wasSameReaction ? -1 : p.my_reaction ? 0 : 1;
            return {
              ...p,
              my_reaction: wasSameReaction ? null : type,
              likes_count: Math.max(0, p.likes_count + deltaLikes),
            };
          }),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(feedQueryKey, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
  });

  // Poll vote mutation
  const pollVoteMutation = useMutation({
    mutationFn: async ({ postId, optionId }: { postId: string; optionId: string }) => {
      const res = await api<{ success: boolean; poll: any }>(`/feed/${postId}/poll/vote`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      });
      return res;
    },
    onSuccess: (res, { postId }) => {
      triggerHaptic("selection");
      qc.setQueriesData({ queryKey: ["campus-feed"] }, (old: any) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p: SocialPost) => {
            if (p.id !== postId) return p;
            return {
              ...p,
              poll: res.poll,
            };
          }),
        };
      });
    },
    onError: (err: Error) => Alert.alert("Voting Failed", err.message),
  });

  // Save / Bookmark post mutation
  const toggleSaveMutation = useMutation({
    mutationFn: async (postId: string) => {
      const current = data?.posts.find((p) => p.id === postId);
      const isSaved = current?.is_saved;
      const res = await api<{ success: boolean; is_saved: boolean; saves_count: number }>(
        `/feed/${postId}/save`,
        { method: isSaved ? "DELETE" : "POST" },
      );
      return { postId, isSaved: res.is_saved, count: res.saves_count };
    },
    onSuccess: ({ postId, isSaved, count }) => {
      triggerHaptic("selection");
      qc.setQueriesData({ queryKey: ["campus-feed"] }, (old: any) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p: SocialPost) => {
            if (p.id !== postId) return p;
            return {
              ...p,
              is_saved: isSaved,
              saves_count: count,
            };
          }),
        };
      });
    },
    onError: (err: Error) => Alert.alert("Save Failed", err.message),
  });

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => api(`/feed/${postId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
      Alert.alert("Post Removed", "Your post has been deleted from the campus feed.");
    },
    onError: (err: Error) => Alert.alert("Could not delete post", err.message),
  });

  // Edit post mutation
  const editPostMutation = useMutation({
    mutationFn: ({ postId, newBody }: { postId: string; newBody: string }) =>
      api<{ post: SocialPost }>(`/feed/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: newBody }),
      }),
    onSuccess: (res) => {
      triggerHaptic("notificationSuccess");
      qc.setQueriesData({ queryKey: ["campus-feed"] }, (old: any) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p: SocialPost) => {
            if (p.id !== res.post.id) return p;
            return {
              ...p,
              body: res.post.body,
              is_edited: true,
            };
          }),
        };
      });
      setEditingPost(null);
    },
    onError: (err: Error) => Alert.alert("Update Failed", err.message),
  });

  // Report post mutation
  const reportPostMutation = useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: string }) =>
      api(`/feed/${postId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      Alert.alert("Report Submitted", "Thank you. Our campus moderation team will review this post.");
    },
    onError: (err: Error) => Alert.alert("Report Failed", err.message),
  });

  const handleReport = (postId: string) => {
    Alert.alert("Report Post", "Select reason for reporting this content:", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam / Promotion", onPress: () => reportPostMutation.mutate({ postId, reason: "Spam" }) },
      { text: "Harassment / Hate", onPress: () => reportPostMutation.mutate({ postId, reason: "Harassment" }) },
      { text: "Misleading Information", onPress: () => reportPostMutation.mutate({ postId, reason: "Misleading" }) },
      { text: "Inappropriate Content", style: "destructive", onPress: () => reportPostMutation.mutate({ postId, reason: "Inappropriate" }) },
    ]);
  };

  const posts = data?.posts ?? [];
  const isAdmin = (profile?.roles || []).includes("admin") || (profile?.roles || []).includes("moderator");

  return (
    <Screen>
      {/* ─────────────────────────────────────────────────────────────
          1. TOP NAVIGATION HEADER
      ───────────────────────────────────────────────────────────── */}
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Campus Feed</Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
              University updates & discussions
            </Text>
          </View>
        </Row>

        <Pressable
          onPress={() => refetch()}
          disabled={isRefetching}
          style={[styles.iconButton, { borderColor: colors.border }]}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialCommunityIcons name="reload" size={18} color={colors.text} />
          )}
        </Pressable>
      </Row>

      {/* ─────────────────────────────────────────────────────────────
          2. FEED CATEGORY FILTER BAR
      ───────────────────────────────────────────────────────────── */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <Row style={{ gap: 8, paddingHorizontal: 2 }}>
            {FILTER_OPTIONS.map((opt) => {
              const isSelected = selectedType === opt.type && !selectedHashtag;
              return (
                <Pressable
                  key={opt.type}
                  onPress={() => {
                    triggerHaptic("selection");
                    setSelectedType(opt.type);
                    setSelectedHashtag(null);
                  }}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={opt.icon}
                    size={15}
                    color={isSelected ? "#FFFFFF" : colors.muted}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: isSelected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </ScrollView>

        {/* Selected Hashtag Filter Banner */}
        {selectedHashtag && (
          <Row style={[styles.hashtagBanner, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="pound" size={16} color={colors.primary} />
              <Text style={[styles.hashtagBannerText, { color: colors.text }]}>
                Showing posts tagged with <Text style={{ color: colors.primary, fontWeight: "700" }}>{selectedHashtag}</Text>
              </Text>
            </Row>
            <Pressable
              onPress={() => setSelectedHashtag(null)}
              style={styles.clearHashtagBtn}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          </Row>
        )}
      </View>

      {/* ─────────────────────────────────────────────────────────────
          3. MASTER SOCIAL POST COMPOSER
      ───────────────────────────────────────────────────────────── */}
      <PostComposer
        userProfile={profile}
        onPostPublished={() => {
          qc.invalidateQueries({ queryKey: ["campus-feed"] });
        }}
      />

      {/* ─────────────────────────────────────────────────────────────
          4. FEED CONTENT LIST
      ───────────────────────────────────────────────────────────── */}
      {isError ? (
        <ErrorState
          detail={(error as Error)?.message || "Failed to load campus feed."}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Loading campus posts...
          </Text>
        </View>
      ) : posts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <MaterialCommunityIcons
            name={
              selectedType === "question"
                ? "help-circle-outline"
                : selectedType === "poll"
                  ? "poll"
                  : selectedType === "event"
                    ? "calendar-blank"
                    : selectedType === "achievement"
                      ? "trophy-outline"
                      : "newspaper-variant-outline"
            }
            size={56}
            color={colors.primary}
            style={{ marginBottom: 12 }}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {selectedHashtag
              ? `No posts tagged with ${selectedHashtag}`
              : selectedType === "all"
                ? "The campus feed is quiet"
                : `No ${selectedType.replace("_", " ")} posts yet`}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            {selectedHashtag
              ? "Try exploring another topic or share your own thoughts with this hashtag!"
              : "Be the first to share an update, exam tip, question, or project showcase with your university community."}
          </Text>
        </Card>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <PostCard
              key={item.id}
              post={item}
              currentUserId={profile?.id}
              isAdmin={isAdmin}
              onReact={(postId, type) => reactionMutation.mutate({ postId, type })}
              onVotePoll={async (postId, optionId) => {
                await pollVoteMutation.mutateAsync({ postId, optionId });
              }}
              onSave={(postId) => toggleSaveMutation.mutate(postId)}
              onShare={(p) => setSharingPost(p)}
              onDelete={(postId) => {
                Alert.alert(
                  "Delete Post",
                  "Are you sure you want to delete this post? This action cannot be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => deletePostMutation.mutate(postId),
                    },
                  ],
                );
              }}
              onEdit={(p) => setEditingPost(p)}
              onReport={(postId) => handleReport(postId)}
              onHashtagPress={(tag) => {
                triggerHaptic("selection");
                setSelectedHashtag(tag);
              }}
              onMentionPress={(username) => {
                Alert.alert("Campus Peer", `@${username}`);
              }}
            />
          )}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. AUXILIARY MODALS: EDIT & SHARE
      ───────────────────────────────────────────────────────────── */}
      <EditPostModal
        visible={Boolean(editingPost)}
        post={editingPost}
        onClose={() => setEditingPost(null)}
        onSave={async (postId, newBody) => {
          await editPostMutation.mutateAsync({ postId, newBody });
        }}
      />

      {sharingPost && (
        <UniversalShareSheet
          visible={Boolean(sharingPost)}
          sourceType="post"
          sourceId={sharingPost.id}
          sourceTitle={
            sharingPost.body.length > 50
              ? `${sharingPost.body.slice(0, 50)}...`
              : sharingPost.body
          }
          sourceVisibility={sharingPost.visibility === "only_me" ? "private" : "public"}
          onClose={() => setSharingPost(null)}
          onShared={() => {
            api(`/feed/${sharingPost.id}/share`, { method: "POST" }).catch(() => {});
            setSharingPost(null);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
    fontWeight: "500",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterSection: {
    marginBottom: 12,
  },
  filterScroll: {
    flexDirection: "row",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  hashtagBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  hashtagBannerText: {
    fontSize: 12.5,
  },
  clearHashtagBtn: {
    padding: 2,
  },
  listContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyCard: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
});
