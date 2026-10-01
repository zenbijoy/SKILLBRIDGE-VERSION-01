import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { ClubPost, ClubPostType } from "../types";
import { useTheme, radius } from "@/theme";
import { POST_TYPE_CONFIG } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface ClubFeedTabProps {
  clubId: string;
  isMember: boolean;
  isLeader: boolean;
  posts: ClubPost[];
  onRefresh: () => void;
}

export function ClubFeedTab({
  clubId,
  isMember,
  isLeader,
  posts,
  onRefresh,
}: ClubFeedTabProps) {
  const { colors, isDark } = useTheme();

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postType, setPostType] = useState<ClubPostType>("discussion");
  const [isPinned, setIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active comments modal
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState("");

  const filteredPosts = posts.filter((p) => {
    if (activeFilter === "all") return true;
    return p.type === activeFilter;
  });

  const handleToggleLike = async (post: ClubPost) => {
    triggerHaptic();
    try {
      await api(`/clubs/posts/${post.id}/like`, { method: "POST" });
      onRefresh();
    } catch {}
  };

  const handleOpenComments = async (postId: string) => {
    triggerHaptic();
    setCommentingPostId(postId);
    try {
      const resp = await api<{ comments: any[] }>(`/clubs/posts/${postId}/comments`);
      setCommentsList(resp.comments || []);
    } catch {}
  };

  const handleSendComment = async () => {
    if (!commentingPostId || !newCommentText.trim()) return;
    triggerHaptic();
    try {
      const resp = await api<{ comment: any }>(`/clubs/posts/${commentingPostId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newCommentText.trim() }),
      });
      setCommentsList((prev) => [...prev, resp.comment]);
      setNewCommentText("");
      onRefresh();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to post comment");
    }
  };

  const handleCreatePost = async () => {
    if (!postContent.trim()) {
      Alert.alert("Content Required", "Please enter post content.");
      return;
    }
    triggerHaptic();
    setIsSubmitting(true);
    try {
      await api(`/clubs/${clubId}/posts`, {
        method: "POST",
        body: JSON.stringify({
          type: postType,
          title: postTitle.trim() || undefined,
          content: postContent.trim(),
          is_pinned: isPinned,
        }),
      });
      setIsSubmitting(false);
      setComposerOpen(false);
      setPostTitle("");
      setPostContent("");
      setIsPinned(false);
      onRefresh();
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert("Error", e.message || "Could not publish post.");
    }
  };

  return (
    <View style={styles.container}>
      {/* Feed Action Bar (Write Post Button & Type Filters) */}
      {isMember ? (
        <Pressable
          onPress={() => {
            triggerHaptic();
            setComposerOpen(true);
          }}
          style={({ pressed }) => [
            styles.createPostBar,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderColor: isDark ? colors.border : "#E2E8F0",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="pencil-box-outline"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.createPostPlaceholder, { color: colors.muted }]}>
            Share an update, question, or discussion with members...
          </Text>
        </Pressable>
      ) : null}

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      >
        <Pressable
          onPress={() => setActiveFilter("all")}
          style={[
            styles.filterPill,
            {
              backgroundColor:
                activeFilter === "all"
                  ? colors.primary
                  : isDark
                  ? colors.surface
                  : "#FFFFFF",
              borderColor:
                activeFilter === "all"
                  ? colors.primary
                  : isDark
                  ? colors.border
                  : "#E2E8F0",
            },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color: activeFilter === "all" ? "#FFFFFF" : colors.text,
                fontWeight: activeFilter === "all" ? "700" : "500",
              },
            ]}
          >
            All Posts
          </Text>
        </Pressable>

        {(["announcement", "discussion", "question", "project_update", "achievement"] as ClubPostType[]).map(
          (t) => {
            const isSelected = activeFilter === t;
            const cfg = POST_TYPE_CONFIG[t];
            return (
              <Pressable
                key={t}
                onPress={() => setActiveFilter(t)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDark
                      ? colors.surface
                      : "#FFFFFF",
                    borderColor: isSelected
                      ? colors.primary
                      : isDark
                      ? colors.border
                      : "#E2E8F0",
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={cfg.icon as any}
                  size={13}
                  color={isSelected ? "#FFFFFF" : cfg.color}
                />
                <Text
                  style={[
                    styles.filterPillText,
                    {
                      color: isSelected ? "#FFFFFF" : colors.text,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {cfg.label}
                </Text>
              </Pressable>
            );
          }
        )}
      </ScrollView>

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons
            name="bullhorn-outline"
            size={42}
            color={colors.muted}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No posts yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.muted }]}>
            Be the first member to start a discussion or share an announcement.
          </Text>
        </View>
      ) : (
        <View style={styles.postsList}>
          {filteredPosts.map((post) => {
            const cfg = POST_TYPE_CONFIG[post.type] ?? POST_TYPE_CONFIG.discussion;
            const bgTone = isDark ? cfg.bgDark : cfg.bgLight;

            return (
              <View
                key={post.id}
                style={[
                  styles.postCard,
                  {
                    backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    borderColor: post.is_pinned
                      ? colors.primary
                      : isDark
                      ? colors.border
                      : "#E2E8F0",
                  },
                ]}
              >
                {/* Pinned Ribbon if pinned */}
                {post.is_pinned ? (
                  <View
                    style={[
                      styles.pinnedRibbon,
                      { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="pin"
                      size={12}
                      color={colors.primary}
                    />
                    <Text
                      style={[styles.pinnedRibbonText, { color: colors.primary }]}
                    >
                      Pinned by Club Admin
                    </Text>
                  </View>
                ) : null}

                {/* Author row & type badge */}
                <View style={styles.authorRow}>
                  {post.author?.avatar_url ? (
                    <Image
                      source={{ uri: post.author.avatar_url }}
                      style={styles.authorAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.authorFallback,
                        { backgroundColor: colors.primarySoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.authorInitial,
                          { color: colors.primary },
                        ]}
                      >
                        {(post.author?.full_name?.[0] ?? "U").toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.authorName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {post.author?.full_name ?? "Member"}
                    </Text>
                    <Text style={[styles.postDate, { color: colors.muted }]}>
                      {new Date(post.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>

                  <View style={[styles.typePill, { backgroundColor: bgTone }]}>
                    <MaterialCommunityIcons
                      name={cfg.icon as any}
                      size={11}
                      color={cfg.color}
                    />
                    <Text style={[styles.typePillText, { color: cfg.color }]}>
                      {cfg.label}
                    </Text>
                  </View>
                </View>

                {/* Title (if present) */}
                {post.title ? (
                  <Text style={[styles.postTitle, { color: colors.text }]}>
                    {post.title}
                  </Text>
                ) : null}

                {/* Content */}
                <Text style={[styles.postContent, { color: colors.text }]}>
                  {post.content}
                </Text>

                {/* Media Image (if any) */}
                {post.media_urls && post.media_urls.length > 0 && post.media_urls[0] ? (
                  <Image
                    source={{ uri: post.media_urls[0] }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                ) : null}

                {/* Action Bar: Likes & Comments */}
                <View
                  style={[
                    styles.postActionBar,
                    { borderTopColor: isDark ? colors.border : "#F1F5F9" },
                  ]}
                >
                  <Pressable
                    onPress={() => handleToggleLike(post)}
                    style={styles.actionBtn}
                  >
                    <MaterialCommunityIcons
                      name={post.is_liked ? "heart" : "heart-outline"}
                      size={18}
                      color={post.is_liked ? "#DC2626" : colors.muted}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: post.is_liked ? "#DC2626" : colors.muted },
                      ]}
                    >
                      {post.likes_count > 0 ? post.likes_count : "Like"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenComments(post.id)}
                    style={styles.actionBtn}
                  >
                    <MaterialCommunityIcons
                      name="comment-outline"
                      size={18}
                      color={colors.muted}
                    />
                    <Text
                      style={[styles.actionBtnText, { color: colors.muted }]}
                    >
                      {post.comments_count > 0 ? post.comments_count : "Comment"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Post Composer Modal */}
      <Modal visible={composerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: isDark ? colors.border : "#E2E8F0",
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Create Club Post
              </Text>
              <Pressable
                onPress={() => setComposerOpen(false)}
                style={{ padding: 4 }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {/* Type Selector */}
              <Text style={[styles.inputLabel, { color: colors.muted }]}>
                Post Category
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
              >
                {(["discussion", "announcement", "question", "project_update", "achievement"] as ClubPostType[]).map(
                  (t) => {
                    const isSelected = postType === t;
                    const cfg = POST_TYPE_CONFIG[t];
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setPostType(t)}
                        style={[
                          styles.typeSelectPill,
                          {
                            backgroundColor: isSelected
                              ? cfg.color
                              : isDark
                              ? colors.surface2
                              : "#F1F5F9",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeSelectText,
                            { color: isSelected ? "#FFFFFF" : colors.text },
                          ]}
                        >
                          {cfg.label}
                        </Text>
                      </Pressable>
                    );
                  }
                )}
              </ScrollView>

              {/* Title Input */}
              <Text style={[styles.inputLabel, { color: colors.muted }]}>
                Title (Optional)
              </Text>
              <TextInput
                value={postTitle}
                onChangeText={setPostTitle}
                placeholder="e.g. Workshop schedule announced"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                  },
                ]}
              />

              {/* Content Input */}
              <Text
                style={[
                  styles.inputLabel,
                  { color: colors.muted, marginTop: 10 },
                ]}
              >
                Message *
              </Text>
              <TextInput
                value={postContent}
                onChangeText={setPostContent}
                placeholder="Share your thoughts, details, or questions..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: isDark ? colors.border : "#CBD5E1",
                    backgroundColor: isDark ? colors.surface2 : "#FFFFFF",
                    minHeight: 90,
                    textAlignVertical: "top",
                  },
                ]}
              />

              {/* Pin option for leaders */}
              {isLeader ? (
                <Pressable
                  onPress={() => setIsPinned(!isPinned)}
                  style={styles.pinToggleRow}
                >
                  <MaterialCommunityIcons
                    name={isPinned ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={20}
                    color={isPinned ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.pinToggleText, { color: colors.text }]}>
                    Pin this post to the top of club feed
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleCreatePost}
                disabled={isSubmitting}
                style={[
                  styles.publishBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: isSubmitting ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.publishBtnText}>
                  {isSubmitting ? "Publishing..." : "Publish Post"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Comments Drawer Modal */}
      <Modal visible={Boolean(commentingPostId)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: isDark ? colors.border : "#E2E8F0",
                maxHeight: "75%",
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Comments ({commentsList.length})
              </Text>
              <Pressable
                onPress={() => setCommentingPostId(null)}
                style={{ padding: 4 }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {commentsList.length === 0 ? (
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    textAlign: "center",
                    marginVertical: 20,
                  }}
                >
                  No comments yet. Be the first to reply!
                </Text>
              ) : (
                commentsList.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <Text
                      style={[
                        styles.commentAuthor,
                        { color: colors.text, fontWeight: "700" },
                      ]}
                    >
                      {c.author?.full_name ?? "Member"}
                    </Text>
                    <Text style={[styles.commentContent, { color: colors.text }]}>
                      {c.content}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Comment Input */}
            <View
              style={[
                styles.commentInputRow,
                { borderTopColor: isDark ? colors.border : "#E2E8F0" },
              ]}
            >
              <TextInput
                value={newCommentText}
                onChangeText={setNewCommentText}
                placeholder="Write a comment..."
                placeholderTextColor={colors.muted}
                style={[
                  styles.commentTextInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
                  },
                ]}
              />
              <Pressable
                onPress={handleSendComment}
                style={[
                  styles.sendCommentBtn,
                  { backgroundColor: colors.primary },
                ]}
              >
                <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  createPostBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  createPostPlaceholder: {
    fontSize: 12,
    flex: 1,
  },
  filterScroll: {
    marginBottom: 12,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
    maxWidth: 240,
  },
  postsList: {
    gap: 12,
  },
  postCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  pinnedRibbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  pinnedRibbonText: {
    fontSize: 10,
    fontWeight: "700",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  authorFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  authorInitial: {
    fontSize: 15,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  postDate: {
    fontSize: 10,
    marginTop: 1,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  postTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  postContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  postImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  postActionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  typeSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginRight: 6,
  },
  typeSelectText: {
    fontSize: 11,
    fontWeight: "700",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  pinToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  pinToggleText: {
    fontSize: 12,
  },
  publishBtn: {
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  publishBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  commentItem: {
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(150,150,150,0.15)",
    gap: 2,
  },
  commentAuthor: {
    fontSize: 12,
  },
  commentContent: {
    fontSize: 12,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  commentTextInput: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12,
  },
  sendCommentBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
