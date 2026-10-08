import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { REACTIONS } from "../../constants";
import type { ReactionType, SocialPost } from "../../types";
import { ReactionPicker } from "./ReactionPicker";

interface PostActionsProps {
  post: SocialPost;
  onReact: (type: ReactionType) => void;
  onCommentPress: () => void;
  onSharePress: () => void;
  onSavePress: () => void;
}

export function PostActions({
  post,
  onReact,
  onCommentPress,
  onSharePress,
  onSavePress,
}: PostActionsProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const activeReaction = REACTIONS.find((r) => r.type === post.my_reaction);

  const handleReactToggle = () => {
    triggerHaptic("selection");
    if (activeReaction) {
      onReact(activeReaction.type); // toggle off
    } else {
      onReact("like"); // default like
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Engagement Counts Summary Bar */}
      {(post.likes_count > 0 || post.comments_count > 0 || post.shares_count > 0 || post.saves_count > 0) && (
        <Row style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          <Row style={{ alignItems: "center", gap: 4 }}>
            {post.likes_count > 0 && (
              <Row style={styles.reactionIconsCluster}>
                <View style={[styles.miniCircle, { backgroundColor: "#EF4444", zIndex: 2, borderColor: colors.surface, borderWidth: 1.5 }]}>
                  <MaterialCommunityIcons name="heart" size={10} color="#FFFFFF" />
                </View>
                <View style={[styles.miniCircle, { backgroundColor: "#1D9BF0", marginLeft: -5, zIndex: 1, borderColor: colors.surface, borderWidth: 1.5 }]}>
                  <MaterialCommunityIcons name="thumb-up" size={9} color="#FFFFFF" />
                </View>
                <Text style={[styles.statsText, { color: colors.muted, marginLeft: 6 }]}>
                  {post.likes_count}
                </Text>
              </Row>
            )}
          </Row>

          <Row style={{ alignItems: "center", gap: 12 }}>
            {post.comments_count > 0 && (
              <Pressable onPress={onCommentPress} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialCommunityIcons name="comment-outline" size={14} color={colors.muted} />
                <Text style={[styles.statsText, { color: colors.muted }]}>
                  {post.comments_count} {post.comments_count === 1 ? "comment" : "comments"}
                </Text>
              </Pressable>
            )}
            {post.shares_count > 0 && (
              <Text style={[styles.statsText, { color: colors.muted }]}>
                {post.shares_count} {post.shares_count === 1 ? "share" : "shares"}
              </Text>
            )}
            {post.saves_count > 0 && (
              <Text style={[styles.statsText, { color: colors.muted }]}>
                · {post.saves_count} {post.saves_count === 1 ? "save" : "saves"}
              </Text>
            )}
          </Row>
        </Row>
      )}

      {/* 2. Floating Reaction Picker */}
      <ReactionPicker
        visible={showPicker}
        onSelect={(type) => {
          onReact(type);
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />

      {/* 3. Action Buttons Row */}
      <Row style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        {/* Like / Reaction Button */}
        <Pressable
          onPress={handleReactToggle}
          onLongPress={() => {
            triggerHaptic("impactMedium");
            setShowPicker(true);
          }}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={
            activeReaction ? `Remove ${activeReaction.label}` : "Like this post"
          }
        >
          <Row style={{ alignItems: "center", gap: 5 }}>
            <MaterialCommunityIcons
              name={activeReaction ? "heart" : "heart-outline"}
              size={18}
              color={activeReaction ? "#EF4444" : colors.muted}
            />
            <Text
              style={[
                styles.actionBtnText,
                {
                  color: activeReaction ? "#EF4444" : colors.muted,
                  fontWeight: activeReaction ? "700" : "500",
                },
              ]}
            >
              Like
            </Text>
          </Row>
        </Pressable>

        {/* Comment Button */}
        <Pressable
          onPress={onCommentPress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Comment on this post"
        >
          <MaterialCommunityIcons name="comment-outline" size={17} color={colors.muted} />
          <Text style={[styles.actionBtnText, { color: colors.muted, fontWeight: "500" }]}>Comment</Text>
        </Pressable>

        {/* Repost Button */}
        <Pressable
          onPress={onSharePress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Repost this post to your profile"
        >
          <MaterialCommunityIcons name="repeat-variant" size={18} color={colors.muted} />
          <Text style={[styles.actionBtnText, { color: colors.muted, fontWeight: "500" }]}>Repost</Text>
        </Pressable>

        {/* Send Button */}
        <Pressable
          onPress={onSharePress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Send post to a friend"
        >
          <MaterialCommunityIcons name="send-outline" size={17} color={colors.muted} />
          <Text style={[styles.actionBtnText, { color: colors.muted, fontWeight: "500" }]}>Send</Text>
        </Pressable>

        {/* Bookmark / Save Button */}
        <Pressable
          onPress={onSavePress}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && { opacity: 0.7 },
            post.is_saved && { backgroundColor: `${colors.primary}15` },
          ]}
          accessibilityRole="button"
          accessibilityLabel={post.is_saved ? "Remove bookmark" : "Bookmark this post"}
          accessibilityState={{ selected: Boolean(post.is_saved) }}
        >
          <MaterialCommunityIcons
            name={post.is_saved ? "bookmark" : "bookmark-outline"}
            size={17}
            color={post.is_saved ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.actionBtnText,
              { color: post.is_saved ? colors.primary : colors.muted, fontWeight: post.is_saved ? "700" : "500" },
            ]}
          >
            {post.is_saved ? "Saved" : "Save"}
          </Text>
        </Pressable>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    position: "relative",
  },
  statsRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  reactionIconsCluster: {
    alignItems: "center",
  },
  miniCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniEmoji: {
    fontSize: 10,
  },
  statsText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: radius.sm,
    minHeight: 36,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  activeEmoji: {
    fontSize: 16,
  },
});
