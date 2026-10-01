import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { REACTIONS, ReactionConfig } from "../../constants";
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
      {(post.likes_count > 0 || post.comments_count > 0 || post.shares_count > 0) && (
        <Row style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          <Row style={{ alignItems: "center", gap: 4 }}>
            {post.likes_count > 0 && (
              <Row style={styles.reactionIconsCluster}>
                <View style={[styles.miniCircle, { backgroundColor: "#3B82F6" }]}>
                  <Text style={styles.miniEmoji}>👍</Text>
                </View>
                {post.likes_count > 1 && (
                  <View style={[styles.miniCircle, { backgroundColor: "#EF4444", marginLeft: -6 }]}>
                    <Text style={styles.miniEmoji}>❤️</Text>
                  </View>
                )}
                <Text style={[styles.statsText, { color: colors.muted, marginLeft: 6 }]}>
                  {post.likes_count}
                </Text>
              </Row>
            )}
          </Row>

          <Row style={{ alignItems: "center", gap: 12 }}>
            {post.comments_count > 0 && (
              <Pressable onPress={onCommentPress}>
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
        >
          {activeReaction ? (
            <Row style={{ alignItems: "center", gap: 6 }}>
              <Text style={styles.activeEmoji}>{activeReaction.emoji}</Text>
              <Text style={[styles.actionBtnText, { color: activeReaction.color, fontWeight: "700" }]}>
                {activeReaction.label}
              </Text>
            </Row>
          ) : (
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="thumb-up-outline" size={18} color={colors.muted} />
              <Text style={[styles.actionBtnText, { color: colors.muted }]}>Like</Text>
            </Row>
          )}
        </Pressable>

        {/* Comment Button */}
        <Pressable
          onPress={onCommentPress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialCommunityIcons name="comment-outline" size={18} color={colors.muted} />
          <Text style={[styles.actionBtnText, { color: colors.muted }]}>Comment</Text>
        </Pressable>

        {/* Share Button */}
        <Pressable
          onPress={onSharePress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialCommunityIcons name="share-outline" size={19} color={colors.muted} />
          <Text style={[styles.actionBtnText, { color: colors.muted }]}>Share</Text>
        </Pressable>

        {/* Save Bookmark Button */}
        <Pressable
          onPress={onSavePress}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialCommunityIcons
            name={post.is_saved ? "bookmark" : "bookmark-outline"}
            size={18}
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
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    minHeight: 36,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  activeEmoji: {
    fontSize: 16,
  },
});
