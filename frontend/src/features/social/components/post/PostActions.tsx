import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
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
  const { colors } = useTheme();
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

  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        {/* Floating Reaction Picker */}
        <ReactionPicker
          visible={showPicker}
          onSelect={(type) => {
            onReact(type);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />

        <View style={[styles.webActionToolbar, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          {/* Left Reactions Toolbar */}
          <Row style={{ alignItems: "center", gap: 6 }}>
            {/* Primary Like Pill */}
            <Pressable
              onPress={handleLikeToggle}
              onLongPress={() => setShowPicker(true)}
              style={({ pressed }) => [
                styles.webActionPill,
                {
                  backgroundColor: isLiked ? `${colors.primary}18` : "transparent",
                  borderColor: isLiked ? `${colors.primary}40` : "transparent",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Like post"
            >
              <Animated.View style={[heartAnimatedStyle, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                {activeReaction && activeReaction.type !== "like" ? (
                  <Text style={{ fontSize: 16 }}>{activeReaction.emoji}</Text>
                ) : (
                  <MaterialCommunityIcons
                    name={isLiked ? "heart" : "heart-outline"}
                    size={18}
                    color={isLiked ? "#ED4956" : colors.muted}
                  />
                )}
                <Text
                  style={[
                    styles.webActionText,
                    {
                      color: isLiked ? colors.primary : colors.text,
                      fontWeight: isLiked ? "700" : "600",
                    },
                  ]}
                >
                  {post.likes_count > 0 ? `${post.likes_count} ${post.likes_count === 1 ? "Like" : "Likes"}` : "Like"}
                </Text>
              </Animated.View>
            </Pressable>

            {/* Quick Emoji Reaction Trigger */}
            <Pressable
              onPress={() => setShowPicker(!showPicker)}
              style={({ pressed }) => [
                styles.webActionIconPill,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel="React with emoji"
            >
              <MaterialCommunityIcons name="emoticon-outline" size={17} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Right Action Cluster: Comments, Share, Save */}
          <Row style={{ alignItems: "center", gap: 6 }}>
            {/* Comment Pill */}
            <Pressable
              onPress={onCommentPress}
              style={({ pressed }) => [
                styles.webActionPill,
                { opacity: pressed ? 0.75 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Comments"
            >
              <MaterialCommunityIcons name="chat-outline" size={17} color={colors.muted} />
              <Text style={[styles.webActionText, { color: colors.text }]}>
                {post.comments_count > 0 ? `${post.comments_count} ${post.comments_count === 1 ? "Comment" : "Comments"}` : "Comment"}
              </Text>
            </Pressable>

            {/* Share Pill */}
            <Pressable
              onPress={onSharePress}
              style={({ pressed }) => [
                styles.webActionPill,
                { opacity: pressed ? 0.75 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Share post"
            >
              <MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.muted} />
              <Text style={[styles.webActionText, { color: colors.text }]}>
                {(post as any).shares_count > 0 ? `${(post as any).shares_count}` : "Share"}
              </Text>
            </Pressable>

            {/* Bookmark Pill */}
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                onSavePress();
              }}
              style={({ pressed }) => [
                styles.webActionIconPill,
                {
                  backgroundColor: isSaved ? `${colors.primary}18` : "transparent",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? "Saved" : "Save post"}
            >
              <MaterialCommunityIcons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={18}
                color={isSaved ? colors.primary : colors.muted}
              />
            </Pressable>
          </Row>
        </View>
      </View>
    );
  }

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
              {activeReaction && activeReaction.type !== "like" ? (
                <Text style={{ fontSize: 22 }}>{activeReaction.emoji}</Text>
              ) : (
                <MaterialCommunityIcons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={26}
                  color={isLiked ? "#ED4956" : colors.text}
                />
              )}
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
  webContainer: {
    marginTop: 8,
  },
  webActionToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
  },
  webActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  webActionIconPill: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  webActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
