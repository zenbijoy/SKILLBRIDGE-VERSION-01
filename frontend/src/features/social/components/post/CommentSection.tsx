import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, Pill, triggerHaptic } from "@/components/ui";
import { nextGenBadges } from "@/assets/nextgen";
import type { PostComment } from "../../types";

interface CommentSectionProps {
  postId: string;
  comments: PostComment[];
  currentUserId?: string;
  isLoading?: boolean;
  onAddComment: (text: string, parentId?: string | null, isAnonymous?: boolean) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
}

export function CommentSection({
  postId,
  comments,
  currentUserId,
  isLoading = false,
  onAddComment,
  onDeleteComment,
}: CommentSectionProps) {
  const { colors } = useTheme();
  const [commentText, setCommentText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ id: string; authorName: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group top-level comments and nested replies
  const { topComments, repliesByParent } = React.useMemo(() => {
    const top: PostComment[] = [];
    const replies = new Map<string, PostComment[]>();

    for (const c of comments) {
      if (c.parent_id) {
        if (!replies.has(c.parent_id)) replies.set(c.parent_id, []);
        replies.get(c.parent_id)!.push(c);
      } else {
        top.push(c);
      }
    }

    return { topComments: top, repliesByParent: replies };
  }, [comments]);

  const handleSubmit = async () => {
    if (!commentText.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      triggerHaptic("impactLight");
      await onAddComment(commentText.trim(), replyTarget?.id || null, isAnonymous);
      setCommentText("");
      setReplyTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSingleComment = (comment: PostComment, isReply = false) => {
    const isAuthor = Boolean(currentUserId && comment.author_id === currentUserId);
    const authorName = comment.is_anonymous
      ? comment.anonymous_handle || "Anonymous Student"
      : comment.author?.full_name || comment.author?.username || "Student";

    return (
      <View
        key={comment.id}
        style={[
          styles.commentWrapper,
          isReply && styles.replyWrapper,
          { borderLeftColor: isReply ? colors.border : "transparent" },
        ]}
      >
        <Row style={styles.commentHeader}>
          {comment.is_anonymous ? (
            <Image source={nextGenBadges.trusted} style={styles.commentAvatarBadge} resizeMode="contain" />
          ) : comment.author?.avatar_url ? (
            <Image source={{ uri: comment.author.avatar_url }} style={styles.commentAvatar} />
          ) : (
            <View style={[styles.commentAvatarPlaceholder, { backgroundColor: colors.surface }]}>
              <MaterialCommunityIcons name="account" size={14} color={colors.primary} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <Text style={[styles.commentAuthorName, { color: colors.text }]}>{authorName}</Text>
              {comment.is_anonymous && (
                <Pill tone="info">Anon</Pill>
              )}
              <Text style={[styles.commentTime, { color: colors.muted }]}>
                {new Date(comment.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Text>
            </Row>

            <Text style={[styles.commentBody, { color: colors.text }]}>{comment.body}</Text>

            {/* Comment Interactions */}
            <Row style={styles.commentActionsRow}>
              {!isReply && (
                <Pressable
                  onPress={() => setReplyTarget({ id: comment.id, authorName })}
                  style={styles.replyBtn}
                >
                  <Text style={[styles.replyBtnText, { color: colors.primary }]}>Reply</Text>
                </Pressable>
              )}

              {isAuthor && onDeleteComment && (
                <Pressable onPress={() => onDeleteComment(comment.id)} style={styles.deleteBtn}>
                  <Text style={[styles.deleteBtnText, { color: "#EF4444" }]}>Delete</Text>
                </Pressable>
              )}
            </Row>
          </View>
        </Row>
      </View>
    );
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {/* List of comments */}
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 14 }} />
      ) : comments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Be the first to join the conversation!
          </Text>
        </View>
      ) : (
        <View style={styles.commentsList}>
          {topComments.map((topC) => {
            const replies = repliesByParent.get(topC.id) || [];
            return (
              <View key={topC.id}>
                {renderSingleComment(topC, false)}
                {replies.map((reply) => renderSingleComment(reply, true))}
              </View>
            );
          })}
        </View>
      )}

      {/* Reply indicator banner */}
      {replyTarget && (
        <Row style={[styles.replyBanner, { backgroundColor: `${colors.primary}15` }]}>
          <Text style={[styles.replyBannerText, { color: colors.primary }]}>
            Replying to <Text style={{ fontWeight: "700" }}>{replyTarget.authorName}</Text>
          </Text>
          <Pressable onPress={() => setReplyTarget(null)}>
            <MaterialCommunityIcons name="close" size={16} color={colors.primary} />
          </Pressable>
        </Row>
      )}

      {/* Comment Input Bar */}
      <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={replyTarget ? `Reply to ${replyTarget.authorName}...` : "Write a thoughtful comment..."}
          placeholderTextColor={colors.muted}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />

        <Row style={styles.inputControlsRow}>
          {/* Anonymous toggle */}
          <Pressable
            onPress={() => setIsAnonymous(!isAnonymous)}
            style={[
              styles.anonToggle,
              isAnonymous && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary },
            ]}
          >
            <MaterialCommunityIcons
              name="incognito"
              size={16}
              color={isAnonymous ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.anonToggleText,
                { color: isAnonymous ? colors.primary : colors.muted },
              ]}
            >
              Anonymous
            </Text>
          </Pressable>

          {/* Submit Button */}
          <Pressable
            disabled={!commentText.trim() || isSubmitting}
            onPress={handleSubmit}
            style={[
              styles.sendBtn,
              {
                backgroundColor: colors.primary,
                opacity: commentText.trim() && !isSubmitting ? 1 : 0.5,
              },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
            )}
          </Pressable>
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 14,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12.5,
    fontStyle: "italic",
  },
  commentsList: {
    gap: 8,
    marginBottom: 10,
  },
  commentWrapper: {
    marginVertical: 4,
  },
  replyWrapper: {
    marginLeft: 32,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  commentHeader: {
    alignItems: "flex-start",
    gap: 8,
  },
  commentAvatarBadge: {
    width: 28,
    height: 28,
    marginTop: 2,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#334155",
    marginTop: 2,
  },
  commentAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  commentAuthorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 11,
  },
  commentBody: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  commentActionsRow: {
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  replyBtn: {
    paddingVertical: 2,
  },
  replyBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  deleteBtn: {
    paddingVertical: 2,
  },
  deleteBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  replyBanner: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginBottom: 6,
  },
  replyBannerText: {
    fontSize: 12,
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 8,
    marginTop: 4,
  },
  input: {
    fontSize: 13.5,
    minHeight: 40,
    maxHeight: 100,
    padding: 4,
  },
  inputControlsRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  anonToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  anonToggleText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
