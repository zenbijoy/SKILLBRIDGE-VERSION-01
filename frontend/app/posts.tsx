import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";

type FilterType = "all" | "standard" | "question" | "announcement" | "notes";

export default function MyPostsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  // Edit Post Modal State
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // Re-upload / Repost State
  const [repostingPost, setRepostingPost] = useState<any | null>(null);
  const [repostBody, setRepostBody] = useState("");

  // 1. Fetch all user's previous posts
  const myPostsQuery = useQuery({
    queryKey: ["my-published-posts", user?.id],
    queryFn: async (): Promise<any[]> => {
      if (!user?.id) return [];
      const res = await api<{ posts: any[] }>(`/feed?author_id=${user.id}&limit=100`);
      return res?.posts ?? [];
    },
    enabled: Boolean(user?.id),
  });

  const posts: any[] = myPostsQuery.data ?? [];

  // Filter posts
  const filteredPosts = useMemo(() => {
    if (activeFilter === "all") return posts;
    return posts.filter((p) => {
      const type = (p.post_type || "standard").toLowerCase();
      if (activeFilter === "standard") return type === "standard" || type === "text_art";
      if (activeFilter === "question") return type === "question" || type === "poll";
      if (activeFilter === "announcement") return type === "announcement";
      if (activeFilter === "notes") return type === "resource" || type === "event_update";
      return true;
    });
  }, [posts, activeFilter]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalPosts = posts.length;
    const totalLikes = posts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    return { totalPosts, totalLikes, totalComments };
  }, [posts]);

  // Mutation: Edit post
  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api(`/feed/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Post Updated! ✏️", "Your post has been successfully updated.");
      setEditingPost(null);
      qc.invalidateQueries({ queryKey: ["my-published-posts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err: any) => {
      Alert.alert("Update Failed", err.message || "Could not update post");
    },
  });

  // Mutation: Delete post
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/feed/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Post Deleted", "The post has been removed from the campus feed.");
      qc.invalidateQueries({ queryKey: ["my-published-posts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err: any) => {
      Alert.alert("Delete Failed", err.message || "Could not delete post");
    },
  });

  // Mutation: Re-upload / Repost
  const repostMutation = useMutation({
    mutationFn: (payload: { body: string; post_type: string }) =>
      api(`/feed`, {
        method: "POST",
        body: JSON.stringify({
          body: payload.body,
          post_type: payload.post_type || "standard",
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Re-uploaded! 🚀", "A fresh copy of this post was published to the feed.");
      setRepostingPost(null);
      setRepostBody("");
      qc.invalidateQueries({ queryKey: ["my-published-posts"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err: any) => {
      Alert.alert("Repost Failed", err.message || "Could not re-upload post");
    },
  });

  const handleOpenEdit = (post: any) => {
    triggerHaptic();
    setEditingPost(post);
    setEditBody(post.body || "");
    setEditTitle(post.title || "");
  };

  const handleOpenRepost = (post: any) => {
    triggerHaptic();
    setRepostingPost(post);
    setRepostBody(post.body || "");
  };

  const handleDeletePrompt = (post: any) => {
    triggerHaptic();
    Alert.alert(
      "Delete Post",
      "Are you sure you want to permanently delete this post? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(post.id),
        },
      ]
    );
  };

  return (
    <Screen>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
          <Row style={{ alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <View>
              <H1 style={{ fontSize: 20 }}>My Posts Manager</H1>
              <Muted style={{ fontSize: 12 }}>Manage previous posts, edit & re-upload</Muted>
            </View>
          </Row>

          <Pressable
            onPress={() => {
              triggerHaptic();
              router.push("/(tabs)" as any);
            }}
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.createBtnText}>New Post</Text>
          </Pressable>
        </Row>

        {/* Stats Strip */}
        <Row style={[styles.statsStrip, { backgroundColor: colors.surface2 }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.totalPosts}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Total Posts</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#EC4899" }]}>{stats.totalLikes}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Reactions</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#3B82F6" }]}>{stats.totalComments}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Comments</Text>
          </View>
        </Row>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { key: "all", label: "All Posts" },
            { key: "standard", label: "Discussions" },
            { key: "question", label: "Questions" },
            { key: "announcement", label: "Announcements" },
            { key: "notes", label: "Notes & Vault" },
          ].map((f) => (
            <Pressable
              key={f.key}
              onPress={() => {
                triggerHaptic();
                setActiveFilter(f.key as FilterType);
              }}
              style={[
                styles.filterPill,
                {
                  backgroundColor: activeFilter === f.key ? colors.primary : colors.surface,
                  borderColor: activeFilter === f.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeFilter === f.key ? "#FFFFFF" : colors.text,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Main Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={myPostsQuery.isRefetching}
            onRefresh={() => myPostsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {myPostsQuery.isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </View>
        ) : myPostsQuery.isError ? (
          <ErrorState detail={(myPostsQuery.error as Error).message} onRetry={() => myPostsQuery.refetch()} />
        ) : filteredPosts.length === 0 ? (
          <Empty
            icon="post-outline"
            title="No Published Posts"
            detail="You haven't published any posts matching this filter."
            actionTitle="Create a Post"
            onAction={() => router.push("/(tabs)" as any)}
          />
        ) : (
          <View style={{ gap: 14 }}>
            {filteredPosts.map((post: any) => {
              const postType = (post.post_type || "standard").toUpperCase();
              const dateStr = new Date(post.created_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <Card key={post.id} style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {/* Top Header */}
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pill tone="primary">{postType}</Pill>
                      {post.is_anonymous && <Pill tone="default">ANONYMOUS</Pill>}
                      {post.is_edited && <Text style={{ fontSize: 11, color: colors.muted }}>(edited)</Text>}
                    </Row>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{dateStr}</Text>
                  </Row>

                  {/* Body Preview */}
                  <Text style={[styles.postBody, { color: colors.text }]} numberOfLines={4}>
                    {post.body}
                  </Text>

                  {/* Attachments preview indicator */}
                  {post.attachments && post.attachments.length > 0 && (
                    <Row style={{ alignItems: "center", gap: 5 }}>
                      <MaterialCommunityIcons name="paperclip" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                        {post.attachments.length} attachment{post.attachments.length > 1 ? "s" : ""}
                      </Text>
                    </Row>
                  )}

                  {/* Metrics bar */}
                  <Row style={{ alignItems: "center", gap: 14, marginTop: 2 }}>
                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="heart-outline" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted }}>{post.likes_count || 0}</Text>
                    </Row>
                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="comment-text-outline" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted }}>{post.comments_count || 0}</Text>
                    </Row>
                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="eye-outline" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted }}>{post.views_count || 0} views</Text>
                    </Row>
                  </Row>

                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                  {/* Management Actions */}
                  <Row style={{ flexWrap: "wrap", gap: 8 }}>
                    {/* 1. Edit */}
                    <Pressable
                      onPress={() => handleOpenEdit(post)}
                      style={[styles.actionBtn, { backgroundColor: colors.primarySoft }]}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Edit</Text>
                    </Pressable>

                    {/* 2. Re-upload / Repost */}
                    <Pressable
                      onPress={() => handleOpenRepost(post)}
                      style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="repeat-variant" size={15} color={colors.text} />
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>Re-upload</Text>
                    </Pressable>

                    {/* 3. Delete */}
                    <Pressable
                      onPress={() => handleDeletePrompt(post)}
                      style={[styles.actionBtn, { backgroundColor: `${colors.danger}15` }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.danger} />
                      <Text style={[styles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                    </Pressable>

                    {/* 4. Open in Feed */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        router.push("/(tabs)" as any);
                      }}
                      style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="arrow-top-right" size={15} color={colors.muted} />
                      <Text style={[styles.actionBtnText, { color: colors.muted }]}>View in Feed</Text>
                    </Pressable>
                  </Row>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: EDIT POST MODAL                                       */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(editingPost)}
        animationType="slide"
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Edit Post Content</Text>
              <Muted style={{ fontSize: 12 }}>Modify message text and formatting</Muted>
            </View>
            <Pressable onPress={() => setEditingPost(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>POST CONTENT</Text>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              multiline
              numberOfLines={8}
              style={[
                styles.editInputBox,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
          </ScrollView>

          <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Button
              title={editMutation.isPending ? "Saving..." : "Save Changes"}
              disabled={!editBody.trim() || editMutation.isPending}
              onPress={() => {
                if (!editingPost) return;
                editMutation.mutate({ id: editingPost.id, body: editBody });
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: RE-UPLOAD / REPOST MODAL                              */}
      {/* ────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(repostingPost)}
        animationType="slide"
        onRequestClose={() => setRepostingPost(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Re-upload to Campus Feed</Text>
              <Muted style={{ fontSize: 12 }}>Publish a fresh copy to the top of feed</Muted>
            </View>
            <Pressable onPress={() => setRepostingPost(null)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>REVIEW & TWEAK TEXT BEFORE RE-UPLOADING</Text>
            <TextInput
              value={repostBody}
              onChangeText={setRepostBody}
              multiline
              numberOfLines={8}
              style={[
                styles.editInputBox,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
          </ScrollView>

          <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Button
              title={repostMutation.isPending ? "Re-uploading..." : "Publish Fresh Copy"}
              disabled={!repostBody.trim() || repostMutation.isPending}
              onPress={() => {
                if (!repostingPost) return;
                repostMutation.mutate({
                  body: repostBody,
                  post_type: repostingPost.post_type || "standard",
                });
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderRadius: 12,
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  postCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Modals
  modalContainer: {
    flex: 1,
    paddingTop: 48,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  editInputBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 180,
    textAlignVertical: "top",
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
});
