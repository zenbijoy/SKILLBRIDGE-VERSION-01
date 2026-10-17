import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme";
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
  const { colors, isDark } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const isLiked = Boolean(post.my_reaction || (post as any).is_liked);
  const isSaved = Boolean(post.is_saved);

  // Heart bounce animation on like
  const heartScale = useSharedValue(1);

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleLikeToggle = () => {
    triggerHaptic("impactLight");
    heartScale.value = withSequence(
      withSpring(1.35, { damping: 4, stiffness: 200 }),
      withSpring(1, { damping: 6, stiffness: 150 }),
    );

    if (isLiked) {
      onReact(post.my_reaction || "like"); // toggle off
    } else {
      onReact("like");
    }
  };

  const activeReaction = REACTIONS.find((r) => r.type === post.my_reaction);

  return (
    <View style={styles.container}>
      {/* 1. Floating Reaction Picker for Long-Press on Heart */}
      <ReactionPicker
        visible={showPicker}
        onSelect={(type) => {
          onReact(type);
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />

      {/* 2. Instagram Iconic Action Buttons Row */}
      <View style={styles.iconActionsRow}>
        {/* Left Cluster: Like, Comment, Send */}
        <Row style={styles.leftCluster}>
          {/* Like Button */}
          <Pressable
            onPress={handleLikeToggle}
            onLongPress={() => {
              triggerHaptic("impactMedium");
              setShowPicker(true);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? "Unlike post" : "Like post"}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Animated.View style={heartAnimatedStyle}>
              <MaterialCommunityIcons
                name={isLiked ? "heart" : "heart-outline"}
                size={26}
                color={isLiked ? "#ED4956" : colors.text}
              />
            </Animated.View>
          </Pressable>

          {/* Comment Button */}
          <Pressable
            onPress={onCommentPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Comment on post"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons
              name="chat-outline"
              size={24}
              color={colors.text}
            />
          </Pressable>

          {/* Send / Direct Share Button */}
          <Pressable
            onPress={onSharePress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Share post"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons
              name="send-outline"
              size={23}
              color={colors.text}
              style={{ transform: [{ rotate: "-22deg" }], marginTop: -2 }}
            />
          </Pressable>
        </Row>

        {/* Right: Save / Bookmark Button */}
        <Pressable
          onPress={() => {
            triggerHaptic("selection");
            onSavePress();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Remove from saved" : "Save post"}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialCommunityIcons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={26}
            color={isSaved ? colors.primary : colors.text}
          />
        </Pressable>
      </View>

      {/* 3. Instagram-Style Likes Counter Line */}
      {(post.likes_count > 0 || isLiked) && (
        <View style={styles.likesCountRow}>
          <Text style={[styles.likesText, { color: colors.text }]}>
            {post.likes_count > 0 ? post.likes_count : 1}{" "}
            {(post.likes_count > 1 || (post.likes_count === 0 && isLiked)) ? "likes" : "like"}
          </Text>
        </View>
      )}

      {/* 4. Instagram-Style View All Comments Trigger */}
      {post.comments_count > 0 && (
        <Pressable onPress={onCommentPress} hitSlop={6} style={styles.viewCommentsRow}>
          <Text style={[styles.viewCommentsText, { color: colors.muted }]}>
            View all {post.comments_count} {post.comments_count === 1 ? "comment" : "comments"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  iconActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  leftCluster: {
    alignItems: "center",
    gap: 16,
  },
  likesCountRow: {
    marginTop: 2,
    marginBottom: 3,
  },
  likesText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  viewCommentsRow: {
    marginTop: 2,
    marginBottom: 4,
  },
  viewCommentsText: {
    fontSize: 12.5,
    fontWeight: "500",
  },
});
