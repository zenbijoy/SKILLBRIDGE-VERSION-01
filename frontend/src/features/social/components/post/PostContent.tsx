import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radius } from "@/theme";
import type { SocialPost } from "../../types";
import { VISUAL_THEMES } from "../../constants";

interface PostContentProps {
  post: SocialPost;
  onHashtagPress?: (tag: string) => void;
  onMentionPress?: (username: string) => void;
}

export function PostContent({ post, onHashtagPress, onMentionPress }: PostContentProps) {
  const { colors } = useTheme();

  const isTextArt =
    post.post_type === "text_art" ||
    (Boolean(post.appearance?.theme) && post.appearance?.theme !== "default") ||
    post.appearance?.backgroundType === "gradient";

  if (isTextArt) {
    const theme =
      VISUAL_THEMES.find((t) => t.id === post.appearance?.theme) ||
      VISUAL_THEMES[1]!; // fallback to Midnight

    const textLength = (post.body || "").length;
    let fontSize = 22;
    let lineHeight = 30;

    if (textLength < 60) {
      fontSize = 24;
      lineHeight = 32;
    } else if (textLength < 140) {
      fontSize = 20;
      lineHeight = 28;
    } else if (textLength < 260) {
      fontSize = 17;
      lineHeight = 24;
    } else {
      fontSize = 15;
      lineHeight = 22;
    }

    const textAlign = post.appearance?.alignment || (textLength < 140 ? "center" : "left");

    return (
      <LinearGradient
        colors={theme.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.textArtCard, theme.borderColor ? { borderColor: theme.borderColor, borderWidth: 1 } : null]}
      >
        <Text
          style={[
            styles.textArtBody,
            {
              color: post.appearance?.textColor || theme.textColor,
              fontSize,
              lineHeight,
              textAlign,
            },
          ]}
        >
          {post.body}
        </Text>
      </LinearGradient>
    );
  }

  // Parse text with interactive #hashtags and @mentions
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;

    // Tokenize text by spaces/newlines while retaining punctuation
    const tokens = rawText.split(/(\s+)/);

    return (
      <Text style={[styles.standardBody, { color: colors.text }]}>
        {tokens.map((token, index) => {
          if (token.startsWith("#") && token.length > 1) {
            return (
              <Text
                key={index}
                style={[styles.hashtag, { color: colors.primary }]}
                onPress={() => onHashtagPress?.(token)}
              >
                {token}
              </Text>
            );
          }
          if (token.startsWith("@") && token.length > 1) {
            return (
              <Text
                key={index}
                style={[styles.mention, { color: colors.accent || colors.primary }]}
                onPress={() => onMentionPress?.(token.slice(1))}
              >
                {token}
              </Text>
            );
          }
          return <Text key={index}>{token}</Text>;
        })}
      </Text>
    );
  };

  // Structured Content Blocks if present
  const blocks = post.structured_content?.blocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;

  return (
    <View style={styles.container}>
      {hasBlocks ? (
        <View style={styles.blocksContainer}>
          {blocks.map((block, idx) => {
            if (block.type === "heading") {
              return (
                <Text
                  key={idx}
                  style={[
                    styles.headingBlock,
                    { color: colors.text, fontSize: block.level === 1 ? 19 : 17 },
                  ]}
                >
                  {block.content}
                </Text>
              );
            }
            if (block.type === "quote") {
              return (
                <View key={idx} style={[styles.quoteBlock, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}>
                  <Text style={[styles.quoteText, { color: colors.text }]}>{block.content}</Text>
                </View>
              );
            }
            if (block.type === "code") {
              return (
                <View key={idx} style={styles.codeBlock}>
                  <Text style={styles.codeText}>{block.content}</Text>
                </View>
              );
            }
            if (block.type === "list") {
              return (
                <View key={idx} style={{ marginVertical: 4 }}>
                  {(block.items || []).map((item, itemIdx) => (
                    <Text key={itemIdx} style={[styles.listItem, { color: colors.text }]}>
                      {block.ordered ? `${itemIdx + 1}. ` : "• "}
                      {item}
                    </Text>
                  ))}
                </View>
              );
            }
            if (block.type === "divider") {
              return <View key={idx} style={[styles.divider, { backgroundColor: colors.border }]} />;
            }
            // default paragraph
            return <View key={idx}>{renderFormattedText(block.content || "")}</View>;
          })}
        </View>
      ) : (
        renderFormattedText(post.body)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  standardBody: {
    fontSize: 14.5,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  hashtag: {
    fontWeight: "700",
  },
  mention: {
    fontWeight: "700",
  },
  textArtCard: {
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 28,
    marginVertical: 6,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 140,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  textArtBody: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  blocksContainer: {
    gap: 8,
  },
  headingBlock: {
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 2,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginVertical: 4,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  codeBlock: {
    backgroundColor: "#0F172A",
    borderRadius: radius.md,
    padding: 10,
    marginVertical: 4,
  },
  codeText: {
    fontFamily: "monospace",
    color: "#38BDF8",
    fontSize: 12.5,
  },
  listItem: {
    fontSize: 14,
    lineHeight: 22,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
});
