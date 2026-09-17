import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { RoomPost } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomPostCardProps = {
  post: RoomPost;
  currentUserId?: string;
  canPin?: boolean;
  canModerate?: boolean;
  onToggleReaction: (post: RoomPost) => void;
  onOpenComments: (post: RoomPost) => void;
  onPinPost?: (post: RoomPost) => void;
  onDeletePost?: (post: RoomPost) => void;
  onSharePost?: (post: RoomPost) => void;
};

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }> = {
  announcement: { label: "ANNOUNCEMENT", icon: "bullhorn-outline", color: "#EF4444" },
  question: { label: "QUESTION", icon: "help-circle-outline", color: "#3B82F6" },
  poll: { label: "POLL", icon: "chart-bar", color: "#8B5CF6" },
  resource: { label: "RESOURCE", icon: "file-document-outline", color: "#10B981" },
  event: { label: "EVENT", icon: "calendar-star", color: "#F59E0B" },
  help: { label: "HELP REQUEST", icon: "hand-heart-outline", color: "#EC4899" },
  discussion: { label: "DISCUSSION", icon: "forum-outline", color: "#64748B" },
};

export function RoomPostCard({
  post,
  currentUserId,
  canPin,
  canModerate,
  onToggleReaction,
  onOpenComments,
  onPinPost,
  onDeletePost,
  onSharePost,
}: RoomPostCardProps) {
  const { colors } = useTheme();

  const isAuthor = currentUserId && post.author_id === currentUserId;
  const canDelete = isAuthor || canModerate;
  const typeInfo = TYPE_CONFIG[post.type] || TYPE_CONFIG.discussion;
  const isHelpfulReacted = Boolean(post.my_reaction);

  const handleMoreOptions = () => {
    triggerHaptic();
    const options: { text: string; onPress: () => void; style?: "cancel" | "destructive" }[] = [
      { text: "Cancel", style: "cancel", onPress: () => {} },
    ];

    if (canPin && onPinPost) {
      options.unshift({
        text: post.is_pinned ? "Unpin Post" : "Pin Post",
        onPress: () => onPinPost(post),
      });
    }

    if (canDelete && onDeletePost) {
      options.unshift({
        text: "Delete Post",
        style: "destructive",
        onPress: () => {
          Alert.alert("Delete Post", "Are you sure you want to delete this post?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => onDeletePost(post) },
          ]);
        },
      });
    }

    Alert.alert("Post Options", undefined, options);
  };

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: colors.surface,
          borderColor: post.is_pinned ? colors.primary : colors.border,
          borderLeftColor: post.type === "announcement" ? colors.danger : post.is_pinned ? colors.primary : colors.border,
          borderLeftWidth: post.type === "announcement" || post.is_pinned ? 3 : 1,
        },
      ]}
    >
      {/* Pinned or Announcement Header Badge */}
      {(post.is_pinned || post.type === "announcement") && (
        <Row style={[s.badgeRow, { borderBottomColor: colors.divider }]}>
          <MaterialCommunityIcons
            name={post.is_pinned ? "pin" : "bullhorn"}
            size={14}
            color={post.type === "announcement" ? colors.danger : colors.primary}
          />
          <Text
            style={[
              s.badgeText,
              { color: post.type === "announcement" ? colors.danger : colors.primary },
            ]}
          >
            {post.is_pinned && post.type === "announcement"
              ? "PINNED ANNOUNCEMENT"
              : post.is_pinned
              ? "PINNED POST"
              : "ANNOUNCEMENT"}
          </Text>
        </Row>
      )}

      {/* Author and Metadata Row */}
      <Row style={s.authorRow}>
        <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
          <Text style={[s.avatarText, { color: colors.primary }]}>
            {post.author?.full_name?.[0] || "U"}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ alignItems: "center", gap: 6 }}>
            <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>
              {post.author?.full_name || "Room Member"}
            </Text>
            <View style={[s.typeBadge, { backgroundColor: `${typeInfo.color}15` }]}>
              <Text style={[s.typeBadgeText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
            </View>
          </Row>
          <Text style={[s.timestamp, { color: colors.muted }]}>
            {new Date(post.created_at).toLocaleDateString()} ·{" "}
            {new Date(post.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {(canDelete || canPin) && (
          <Pressable
            hitSlop={8}
            onPress={handleMoreOptions}
            style={({ pressed }) => [s.moreBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.muted} />
          </Pressable>
        )}
      </Row>

      {/* Post Title (if present) */}
      {post.title ? (
        <Text style={[s.postTitle, { color: colors.text }]}>{post.title}</Text>
      ) : null}

      {/* Post Body Text */}
      <Text style={[s.postBody, { color: colors.text }]}>{post.body}</Text>

      {/* Action Bar (Helpful, Comments, Share) */}
      <View style={[s.actionBar, { borderTopColor: colors.divider }]}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            onToggleReaction(post);
          }}
          style={({ pressed }) => [
            s.actionBtn,
            { backgroundColor: isHelpfulReacted ? colors.primarySoft : "transparent", opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialCommunityIcons
            name={isHelpfulReacted ? "thumb-up" : "thumb-up-outline"}
            size={17}
            color={isHelpfulReacted ? colors.primary : colors.muted}
          />
          <Text
            style={[
              s.actionText,
              { color: isHelpfulReacted ? colors.primary : colors.muted, fontWeight: isHelpfulReacted ? "700" : "600" },
            ]}
          >
            Helpful {post.likes_count > 0 ? `(${post.likes_count})` : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            onOpenComments(post);
          }}
          style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialCommunityIcons name="comment-outline" size={17} color={colors.muted} />
          <Text style={[s.actionText, { color: colors.muted }]}>
            Comment {post.comments_count > 0 ? `(${post.comments_count})` : ""}
          </Text>
        </Pressable>

        {onSharePost && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onSharePost(post);
            }}
            style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.muted} />
            <Text style={[s.actionText, { color: colors.muted }]}>Share</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    marginVertical: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  authorRow: {
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "900",
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  timestamp: {
    fontSize: 11,
  },
  moreBtn: {
    padding: 4,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  postBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  actionText: {
    fontSize: 12,
  },
});
