import React, { useState } from "react";
import { StyleSheet, Alert, View, Text, TextInput, Image, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/theme";
import { Card, Row } from "@/components/ui";
import { api } from "@/lib/api";
import type { PostComment, ReactionType, SocialPost } from "../../types";

import { PostHeader } from "./PostHeader";
import { PostContent } from "./PostContent";
import { PollCard } from "./PollCard";
import { EventCard } from "./EventCard";
import { AchievementCard } from "./AchievementCard";
import { OpportunityCard } from "./OpportunityCard";
import { StudyNoteCard } from "./StudyNoteCard";
import { CodeCard } from "./CodeCard";
import { QuoteCard } from "./QuoteCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { GalleryCard } from "./GalleryCard";
import { PostActions } from "./PostActions";
import { PostMenu } from "./PostMenu";
import { CommentSection } from "./CommentSection";

export interface PostCardProps {
  post: SocialPost;
  currentUserId?: string;
  currentUser?: { avatar_url?: string | null; username?: string; full_name?: string } | null;
  isAdmin?: boolean;
  onReact: (postId: string, type: ReactionType) => void;
  onVotePoll?: (postId: string, optionId: string) => Promise<void>;
  onSave?: (postId: string) => void;
  onShare?: (post: SocialPost) => void;
  onDelete?: (postId: string) => void;
  onEdit?: (post: SocialPost) => void;
  onReport?: (postId: string) => void;
  onHashtagPress?: (tag: string) => void;
  onMentionPress?: (username: string) => void;
  isPreview?: boolean;
}

export function PostCard({
  post,
  currentUserId,
  currentUser,
  isAdmin = false,
  onReact,
  onVotePoll,
  onSave,
  onShare,
  onDelete,
  onEdit,
  onReport,
  onHashtagPress,
  onMentionPress,
  isPreview = false,
}: PostCardProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [quickCommentText, setQuickCommentText] = useState("");
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);

  // Optimistic save state so save button responds instantly (0ms)
  const [localIsSaved, setLocalIsSaved] = useState<boolean | null>(null);
  const effectiveIsSaved = localIsSaved !== null ? localIsSaved : Boolean(post.is_saved);

  React.useEffect(() => {
    setLocalIsSaved(null);
  }, [post.is_saved]);

  const handleSaveToggle = () => {
    setLocalIsSaved(!effectiveIsSaved);
    onSave?.(post.id);
  };

  // Fetch comments query when expanded
  const commentsQuery = useQuery<{ comments: PostComment[] }>({
    queryKey: ["post-comments", post.id],
    queryFn: () => api(`/feed/${post.id}/comments`),
    enabled: showComments && !isPreview,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: ({ body, parentId, isAnonymous }: { body: string; parentId?: string | null; isAnonymous?: boolean }) =>
      api(`/feed/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, parent_id: parentId, is_anonymous: isAnonymous }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
    onError: (err: Error) => Alert.alert("Comment Failed", err.message),
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(`/feed/${post.id}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["campus-feed"] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const commentsList = commentsQuery.data?.comments || [];

  return (
    <Card style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {/* 1. Header */}
      <PostHeader
        post={post}
        onOpenMenu={isPreview ? undefined : () => setShowMenu(true)}
      />

      {/* 2. Text / Text Art Content */}
      <PostContent
        post={post}
        onHashtagPress={onHashtagPress}
        onMentionPress={onMentionPress}
      />

      {/* 3. Specialized Type Renderers */}
      {post.poll && onVotePoll && (
        <PollCard
          postId={post.id}
          poll={post.poll}
          onVote={(optionId) => onVotePoll(post.id, optionId)}
        />
      )}

      {post.type_metadata?.event && (
        <EventCard event={post.type_metadata.event} />
      )}

      {post.type_metadata?.achievement && (
        <AchievementCard achievement={post.type_metadata.achievement} />
      )}

      {post.type_metadata?.opportunity && (
        <OpportunityCard opportunity={post.type_metadata.opportunity} />
      )}

      {post.type_metadata?.study_note && (
        <StudyNoteCard note={post.type_metadata.study_note} />
      )}

      {post.type_metadata?.code && (
        <CodeCard codeData={post.type_metadata.code} />
      )}

      {post.type_metadata?.quote && (
        <QuoteCard quoteData={post.type_metadata.quote} />
      )}

      {post.type_metadata?.link_preview && (
        <LinkPreviewCard preview={post.type_metadata.link_preview} />
      )}

      {/* 4. Media Gallery (Images, Videos, PDFs, YouTube) */}
      {((post.attachments && post.attachments.length > 0) ||
        (post.media_urls && post.media_urls.length > 0) ||
        post.youtube) && (
        <GalleryCard
          images={post.media_urls}
          attachments={post.attachments}
          youtube={post.youtube}
        />
      )}

      {/* 5. Engagement Action Buttons */}
      {!isPreview && (
        <PostActions
          post={{ ...post, is_saved: effectiveIsSaved }}
          onReact={(type) => onReact(post.id, type)}
          onCommentPress={() => setShowComments(!showComments)}
          onSharePress={() => onShare?.(post)}
          onSavePress={handleSaveToggle}
        />
      )}

      {/* 6. Inline Quick Comment Bar (Exact match with screenshot) */}
      {!isPreview && (
        <Row style={[styles.quickCommentRow, { borderTopColor: colors.border }]}>
          {currentUser?.avatar_url ? (
            <Image source={{ uri: currentUser.avatar_url }} style={styles.quickCommentAvatar} />
          ) : (
            <View style={[styles.quickCommentAvatarPlaceholder, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                {currentUser?.full_name?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || "U"}
              </Text>
            </View>
          )}

          <View style={[styles.quickCommentInputWrap, { backgroundColor: colors.surface2 || colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[styles.quickCommentInput, { color: colors.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.muted}
              value={quickCommentText}
              onChangeText={setQuickCommentText}
              onSubmitEditing={async () => {
                if (!quickCommentText.trim() || isQuickSubmitting) return;
                try {
                  setIsQuickSubmitting(true);
                  await addCommentMutation.mutateAsync({ body: quickCommentText.trim() });
                  setQuickCommentText("");
                  setShowComments(true);
                } finally {
                  setIsQuickSubmitting(false);
                }
              }}
              returnKeyType="send"
            />
            <Pressable
              onPress={async () => {
                if (quickCommentText.trim()) {
                  if (isQuickSubmitting) return;
                  try {
                    setIsQuickSubmitting(true);
                    await addCommentMutation.mutateAsync({ body: quickCommentText.trim() });
                    setQuickCommentText("");
                    setShowComments(true);
                  } finally {
                    setIsQuickSubmitting(false);
                  }
                } else {
                  setShowComments(!showComments);
                }
              }}
              hitSlop={8}
            >
              {quickCommentText.trim() ? (
                <MaterialCommunityIcons name="send" size={17} color={colors.primary} />
              ) : (
                <MaterialCommunityIcons name="emoticon-happy-outline" size={20} color={colors.muted} />
              )}
            </Pressable>
          </View>
        </Row>
      )}

      {/* 7. Accordion Comment Section */}
      {showComments && !isPreview && (
        <CommentSection
          postId={post.id}
          comments={commentsList}
          currentUserId={currentUserId}
          isLoading={commentsQuery.isLoading}
          onAddComment={async (body, parentId, isAnonymous) => {
            await addCommentMutation.mutateAsync({ body, parentId, isAnonymous });
          }}
          onDeleteComment={async (commentId) => {
            await deleteCommentMutation.mutateAsync(commentId);
          }}
        />
      )}

      {/* 8. Post Options Menu Modal */}
      {!isPreview && (
        <PostMenu
          visible={showMenu}
          post={post}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setShowMenu(false)}
          onEdit={onEdit ? () => onEdit(post) : undefined}
          onDelete={onDelete ? () => onDelete(post.id) : undefined}
          onSave={onSave ? () => onSave(post.id) : undefined}
          onReport={onReport ? () => onReport(post.id) : undefined}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  quickCommentRow: {
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingTop: 6,
  },
  quickCommentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  quickCommentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickCommentInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 38,
  },
  quickCommentInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
});
