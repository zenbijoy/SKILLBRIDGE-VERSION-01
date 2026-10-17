import React from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { RoomPost } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type RoomPostCardProps = {
  post: RoomPost;
  currentUserId?: string;
  canPin?: boolean;
  canModerate?: boolean;
  isEducator?: boolean;
  onToggleReaction: (post: RoomPost) => void;
  onOpenComments: (post: RoomPost) => void;
  onPinPost?: (post: RoomPost) => void;
  onDeletePost?: (post: RoomPost) => void;
  onSharePost?: (post: RoomPost) => void;
  onOpenQuiz?: (post: RoomPost) => void;
  onOpenNotes?: (post: RoomPost) => void;
};

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }
> = {
  announcement: { label: "ANNOUNCEMENT", icon: "bullhorn-outline", color: "#EF4444" },
  question: { label: "QUESTION", icon: "help-circle-outline", color: "#3B82F6" },
  poll: { label: "POLL", icon: "chart-bar", color: "#8B5CF6" },
  resource: { label: "RESOURCE", icon: "file-document-outline", color: "#10B981" },
  event: { label: "EVENT", icon: "calendar-star", color: "#F59E0B" },
  help: { label: "HELP REQUEST", icon: "hand-heart-outline", color: "#EC4899" },
  discussion: { label: "DISCUSSION", icon: "forum-outline", color: "#6366F1" },
};

export function RoomPostCard({
  post,
  currentUserId,
  canPin,
  canModerate,
  isEducator = false,
  onToggleReaction,
  onOpenComments,
  onPinPost,
  onDeletePost,
  onSharePost,
  onOpenQuiz,
  onOpenNotes,
}: RoomPostCardProps) {
  const { colors, isDark } = useTheme();

  const isAuthor = currentUserId && post.author_id === currentUserId;
  const canDelete = isAuthor || canModerate;
  const typeInfo = TYPE_CONFIG[post.type] || TYPE_CONFIG.discussion;
  const isHelpfulReacted = Boolean(post.my_reaction);

  const hasLearningTiles = Boolean(post.metadata?.quiz || post.metadata?.notes || post.metadata?.files);
  const badgeText = post.metadata?.badge || typeInfo.label;

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
          backgroundColor: isDark ? colors.surface : "#FFFFFF",
          borderColor: post.is_pinned
            ? isDark
              ? "#3B82F6"
              : "#60A5FA"
            : isDark
            ? colors.border
            : "#E2E8F0",
          shadowColor: "#000",
        },
      ]}
    >
      {/* Pinned or Announcement Header Banner */}
      {(post.is_pinned || post.type === "announcement") && (
        <Row style={[s.pinnedHeaderRow, { borderBottomColor: isDark ? colors.border : "#F1F5F9" }]}>
          <MaterialCommunityIcons
            name={post.is_pinned ? "pin" : "bullhorn"}
            size={14}
            color={post.type === "announcement" ? "#EF4444" : "#2563EB"}
          />
          <Text
            style={[
              s.pinnedHeaderText,
              { color: post.type === "announcement" ? "#EF4444" : "#2563EB" },
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

      {/* ── 1. Author and Badge Header ── */}
      <Row style={s.authorRow}>
        {post.author?.avatar_url ? (
          <Image source={{ uri: post.author.avatar_url }} style={s.avatarImg} />
        ) : (
          <View style={[s.avatarFallback, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
            <Text style={[s.avatarText, { color: isDark ? "#60A5FA" : "#2563EB" }]}>
              {post.author?.full_name ? post.author.full_name[0].toUpperCase() : "U"}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>
              {post.author?.full_name || "Room Member"}
            </Text>
            <View style={[s.conceptBadge, { backgroundColor: isDark ? "#1E1B4B" : "#EEF2FF" }]}>
              <Text style={s.conceptBadgeText}>{badgeText}</Text>
            </View>
          </Row>
          <Text style={[s.timestampText, { color: colors.muted }]}>
            Science & Key lesson · {new Date(post.created_at).toLocaleDateString()}
          </Text>
        </View>

        <Pressable
          hitSlop={8}
          onPress={handleMoreOptions}
          style={({ pressed }) => [s.moreBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </Row>

      {/* ── 2. Post Title & Body Text ── */}
      {post.title ? (
        <Text style={[s.postTitle, { color: colors.text }]}>{post.title}</Text>
      ) : null}

      <Text style={[s.postBody, { color: colors.text }]}>{post.body}</Text>

      {/* ── 4. Interactive Learning Widgets (Matching Post 2 in Mockup) ── */}
      {hasLearningTiles && (
        <Row style={s.learningWidgetsRow}>
          {/* Orange Tile: View Quiz */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenQuiz?.(post);
              router.push("/quiz" as any);
            }}
            style={({ pressed }) => [
              s.quizTile,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={s.quizPlayCircle}>
              <MaterialCommunityIcons name="play" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={s.quizTitle}>View Quiz</Text>
              <Text style={s.tileSubtitle}>5 files</Text>
            </View>
          </Pressable>

          {/* Green Tile: View Notes */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenNotes?.(post);
            }}
            style={({ pressed }) => [
              s.notesTile,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={s.notesDocCircle}>
              <MaterialCommunityIcons name="file-document-outline" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={s.notesTitle}>View Notes</Text>
              <Text style={s.tileSubtitle}>5 files</Text>
            </View>
          </Pressable>
        </Row>
      )}

      {/* ── 5. Reactions & Interactions Bar ── */}
      <View style={[s.reactionsBar, { borderTopColor: isDark ? colors.border : "#F1F5F9" }]}>
        <Row style={{ alignItems: "center", gap: 14 }}>
          {/* Reply Button */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenComments(post);
            }}
            style={({ pressed }) => [s.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="reply-outline" size={17} color={colors.muted} />
            <Text style={[s.actionText, { color: colors.muted }]}>Reply</Text>
          </Pressable>

          {/* Comment Count */}
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="comment-outline" size={15} color={colors.muted} />
            <Text style={[s.actionCountText, { color: colors.muted }]}>
              {post.comments_count || 0}
            </Text>
          </Row>

          {/* Likes / Reaction Heart */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              onToggleReaction(post);
            }}
            style={({ pressed }) => [s.reactionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons
              name={isHelpfulReacted ? "heart" : "heart-outline"}
              size={16}
              color={isHelpfulReacted ? "#EF4444" : colors.muted}
            />
            <Text
              style={[
                s.actionCountText,
                { color: isHelpfulReacted ? "#EF4444" : colors.muted },
              ]}
            >
              {post.likes_count || 15}
            </Text>
          </Pressable>

          {/* Views / Analytics Count */}
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="chart-bar" size={15} color={colors.muted} />
            <Text style={[s.actionCountText, { color: colors.muted }]}>25</Text>
          </Row>
        </Row>

        {/* Right side icon badges (member profile & media) */}
        <Row style={{ alignItems: "center", gap: 8 }}>
          <View style={s.iconSmallBadge}>
            <MaterialCommunityIcons name="account-group" size={14} color={colors.muted} />
          </View>
          <View style={s.iconSmallBadge}>
            <MaterialCommunityIcons name="youtube" size={14} color="#EF4444" />
          </View>
        </Row>
      </View>

      {/* ── 6. Educator Moderation Toolbar (Matching Left Phone Mockup) ── */}
      {(canModerate || isEducator) && (
        <View style={[s.moderatorToolbar, { borderTopColor: isDark ? colors.border : "#F1F5F9" }]}>
          {/* Mute All */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              Alert.alert("Mute Post Notifications", "Notifications for this post thread muted.");
            }}
            style={({ pressed }) => [s.modActionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="microphone-off" size={15} color="#EF4444" />
            <Text style={[s.modActionText, { color: colors.muted }]}>Mute All</Text>
          </Pressable>

          {/* Pin Post */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              onPinPost?.(post);
            }}
            style={({ pressed }) => [s.modActionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons
              name={post.is_pinned ? "pin-off" : "pin"}
              size={15}
              color="#0284C7"
            />
            <Text style={[s.modActionText, { color: colors.muted }]}>
              {post.is_pinned ? "Unpin" : "Pin Post"}
            </Text>
          </Pressable>

          {/* Member count / reports */}
          <Row style={{ alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name="account-multiple" size={15} color="#F59E0B" />
            <Text style={[s.modActionText, { color: colors.muted }]}>3</Text>
          </Row>

          {/* Remove / Delete */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              Alert.alert("Remove Post", "Are you sure you want to remove this post?", [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => onDeletePost?.(post) },
              ]);
            }}
            style={({ pressed }) => [s.modActionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={15} color="#EF4444" />
            <Text style={[s.modActionText, { color: colors.muted }]}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    marginVertical: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  pinnedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  pinnedHeaderText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  authorRow: {
    alignItems: "center",
    gap: 10,
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
  },
  conceptBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  conceptBadgeText: {
    color: "#4F46E5",
    fontSize: 10,
    fontWeight: "700",
  },
  timestampText: {
    fontSize: 11,
    fontWeight: "500",
  },
  moreBtn: {
    padding: 4,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  postBody: {
    fontSize: 14,
    lineHeight: 21,
  },

  /* ── Diagram Schematic Area ── */
  diagramContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  diagramGraphicArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  diagramNodeB: {
    backgroundColor: "#818CF8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  diagramNodeC: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  diagramNodeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  diagramVectorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  diagramArrowLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: "#94A3B8",
  },
  diagramFormulaText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },

  /* ── Learning Widgets (View Quiz / View Notes) ── */
  learningWidgetsRow: {
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  quizTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quizPlayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  quizTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#C2410C",
  },
  notesTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  notesDocCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
  },
  tileSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },

  /* ── Reactions Bar ── */
  reactionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reactionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  iconSmallBadge: {
    padding: 3,
  },

  /* ── Educator Quick Moderation Toolbar ── */
  moderatorToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 2,
  },
  modActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modActionText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
