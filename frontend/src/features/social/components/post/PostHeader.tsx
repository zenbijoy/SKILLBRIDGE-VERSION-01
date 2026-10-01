import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Pill, Row } from "@/components/ui";
import { nextGenBadges } from "@/assets/nextgen";
import type { SocialPost } from "../../types";
import { POST_TYPE_OPTIONS, VISIBILITY_OPTIONS } from "../../constants";

interface PostHeaderProps {
  post: SocialPost;
  onOpenMenu?: () => void;
  onAuthorPress?: () => void;
}

export function PostHeader({ post, onOpenMenu, onAuthorPress }: PostHeaderProps) {
  const { colors } = useTheme();

  const typeConfig = POST_TYPE_OPTIONS.find((t) => t.type === post.post_type);
  const visibilityConfig = VISIBILITY_OPTIONS.find((v) => v.value === post.visibility);

  const formattedDate = React.useMemo(() => {
    try {
      const d = new Date(post.created_at);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "Recent";
    }
  }, [post.created_at]);

  const authorName = post.is_anonymous
    ? post.anonymous_handle || "Anonymous Student"
    : post.author?.full_name || post.author?.username || "Campus Member";

  return (
    <Row style={styles.container}>
      <Row style={styles.authorRow}>
        {/* Avatar */}
        <Pressable onPress={post.is_anonymous ? undefined : onAuthorPress}>
          {post.is_anonymous ? (
            <Image source={nextGenBadges.trusted} style={styles.avatarBadge} resizeMode="contain" />
          ) : post.author?.avatar_url ? (
            <Image source={{ uri: post.author.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
              <MaterialCommunityIcons name="account" size={20} color={colors.primary} />
            </View>
          )}
        </Pressable>

        {/* Info */}
        <View style={styles.infoCol}>
          <Row style={styles.nameRow}>
            <Pressable onPress={post.is_anonymous ? undefined : onAuthorPress}>
              <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                {authorName}
              </Text>
            </Pressable>

            {post.is_anonymous && (
              <Pill tone="info">Anonymous</Pill>
            )}

            {typeConfig && typeConfig.type !== "standard" && typeConfig.type !== "text_art" && (
              <View style={[styles.typeTag, { backgroundColor: `${typeConfig.color}20` }]}>
                <MaterialCommunityIcons name={typeConfig.icon as any} size={11} color={typeConfig.color} />
                <Text style={[styles.typeTagText, { color: typeConfig.color }]}>
                  {typeConfig.label}
                </Text>
              </View>
            )}

            {post.pinned && <Pill tone="primary">Pinned</Pill>}
          </Row>

          <Row style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {post.department ? `${post.department} · ` : ""}
              {formattedDate}
            </Text>

            {post.is_edited && (
              <Text style={[styles.metaText, { color: colors.muted, fontStyle: "italic" }]}>
                {" · Edited"}
              </Text>
            )}

            {visibilityConfig && (
              <Row style={styles.visibilityBadge}>
                <Text style={{ color: colors.muted, fontSize: 11 }}> · </Text>
                <MaterialCommunityIcons
                  name={visibilityConfig.icon as any}
                  size={12}
                  color={colors.muted}
                />
              </Row>
            )}
          </Row>
        </View>
      </Row>

      {/* Menu Trigger */}
      {onOpenMenu && (
        <Pressable
          onPress={onOpenMenu}
          hitSlop={8}
          style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.muted} />
        </Pressable>
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  authorRow: {
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatarBadge: {
    width: 38,
    height: 38,
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#334155",
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
  },
  nameRow: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  typeTagText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaRow: {
    alignItems: "center",
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
  },
  visibilityBadge: {
    alignItems: "center",
  },
  menuBtn: {
    padding: 6,
    borderRadius: radius.md,
  },
});
