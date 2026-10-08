import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { SocialPost } from "../../types";
import { resolvePostAppearance, tokenizeInline } from "../../utils/postText";

interface PostContentProps {
  post: SocialPost;
  onHashtagPress?: (tag: string) => void;
  onMentionPress?: (username: string) => void;
}

const TRUNCATE_CHAR_LIMIT = 180;
const TRUNCATE_LINE_LIMIT = 3;

export function PostContent({ post, onHashtagPress, onMentionPress }: PostContentProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const appearance = resolvePostAppearance(post.appearance);
  /** Text-art keeps its oversized / centred "quote card" typography. */
  const isTextArt = post.post_type === "text_art";
  /** Any author-picked background renders a Facebook-style coloured post body. */
  const hasThemedBackground = !appearance.isDefault;

  // Palette used for the body so text stays readable on a themed background.
  const bodyColor = hasThemedBackground ? appearance.textColor || colors.text : colors.text;
  const accentColor = hasThemedBackground ? appearance.accentColor || colors.primary : colors.primary;
  const mutedColor = hasThemedBackground
    ? `${appearance.textColor || colors.text}CC`
    : colors.muted;

  if (isTextArt) {

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
        colors={appearance.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.textArtCard,
          appearance.borderColor
            ? { borderColor: appearance.borderColor, borderWidth: 1 }
            : null,
        ]}
      >
        <Text
          style={[
            styles.textArtBody,
            {
              color: appearance.textColor || colors.text,
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

  // Renders inline markdown tokens: **bold**, *italic*, `code`, [text](url),
  // #hashtag, @mention and bare/schemed URLs.
  //
  // Uses `tokenizeInline` (a single-pass scanner) instead of `String.split` with
  // a capture-group regex, which previously interleaved the regex's inner groups
  // into the rendered output and duplicated/mangled the text.
  const renderInlineTokens = (
    rawText: string,
    keyPrefix: string,
    textColor: string = colors.text,
    linkColor: string = colors.primary,
  ) => {
    if (!rawText) return null;

    return tokenizeInline(rawText).map((token, index) => {
      const key = `${keyPrefix}-${index}`;

      switch (token.type) {
        case "bold":
          return (
            <Text key={key} style={[styles.boldText, { color: textColor }]}>
              {token.value}
            </Text>
          );

        case "italic":
          return (
            <Text key={key} style={[styles.italicText, { color: textColor }]}>
              {token.value}
            </Text>
          );

        case "code":
          return (
            <Text
              key={key}
              style={[
                styles.inlineCode,
                {
                  backgroundColor: colors.surface2 || `${colors.primary}15`,
                  color: colors.primary,
                },
              ]}
            >
              {token.value}
            </Text>
          );

        case "link":
        case "url":
          return (
            <Text
              key={key}
              style={[styles.linkText, { color: linkColor }]}
              onPress={() => {
                if (token.href) Linking.openURL(token.href).catch(() => {});
              }}
            >
              {token.value}
            </Text>
          );

        case "hashtag":
          return (
            <Text
              key={key}
              style={[styles.hashtag, { color: colors.primary }]}
              onPress={() => onHashtagPress?.(token.value)}
            >
              {token.value}
            </Text>
          );

        case "mention":
          return (
            <Text
              key={key}
              style={[styles.mention, { color: linkColor }]}
              onPress={() => onMentionPress?.(token.value.slice(1))}
            >
              {token.value}
            </Text>
          );

        default:
          return <Text key={key}>{token.value}</Text>;
      }
    });
  };

  // Structured Content Blocks if present
  const blocks = post.structured_content?.blocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;

  if (hasBlocks) {
    const blocksView = (
      <View style={styles.blocksContainer}>
        {blocks.map((block, idx) => {
          if (block.type === "heading") {
            return (
              <Text
                key={idx}
                style={[
                  styles.headingBlock,
                  { color: bodyColor, fontSize: block.level === 1 ? 19 : 17 },
                ]}
              >
                {block.content}
              </Text>
            );
          }
          if (block.type === "quote") {
            return (
              <View
                key={idx}
                style={[
                  styles.quoteBlock,
                  {
                    borderLeftColor: accentColor,
                    backgroundColor: hasThemedBackground
                      ? "rgba(255,255,255,0.10)"
                      : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.quoteText, { color: bodyColor }]}>{block.content}</Text>
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
                  <Text key={itemIdx} style={[styles.listItem, { color: bodyColor }]}>
                    {block.ordered ? `${itemIdx + 1}. ` : "• "}
                    {item}
                  </Text>
                ))}
              </View>
            );
          }
          if (block.type === "divider") {
            return (
              <View
                key={idx}
                style={[
                  styles.divider,
                  { backgroundColor: hasThemedBackground ? "rgba(255,255,255,0.25)" : colors.border },
                ]}
              />
            );
          }
          return (
            <Text key={idx} style={[styles.standardBody, { color: bodyColor }]}>
              {renderInlineTokens(block.content || "", `blk-${idx}`, bodyColor, accentColor)}
            </Text>
          );
        })}
      </View>
    );

    if (hasThemedBackground) {
      return (
        <LinearGradient
          colors={appearance.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.themedBody,
            appearance.borderColor
              ? { borderColor: appearance.borderColor, borderWidth: 1 }
              : null,
          ]}
        >
          {blocksView}
        </LinearGradient>
      );
    }

    return <View style={styles.container}>{blocksView}</View>;
  }

  // Standard Post Body Rendering with Truncation & Formatting
  const rawBody = post.body || "";
  const lines = rawBody.split("\n");
  const isLong = rawBody.length > TRUNCATE_CHAR_LIMIT || lines.length > TRUNCATE_LINE_LIMIT;

  // Truncated version if not expanded
  let displayedText = rawBody;
  let showMoreButton = false;

  if (isLong && !isExpanded) {
    showMoreButton = true;
    if (lines.length > TRUNCATE_LINE_LIMIT) {
      displayedText = lines.slice(0, TRUNCATE_LINE_LIMIT).join("\n");
    }
    if (displayedText.length > TRUNCATE_CHAR_LIMIT) {
      const cut = displayedText.slice(0, TRUNCATE_CHAR_LIMIT);
      const lastSpace = cut.lastIndexOf(" ");
      displayedText = lastSpace > 120 ? cut.slice(0, lastSpace) : cut;
    }
  }

  const renderFormattedLines = (text: string) => {
    const textLines = text.split("\n");
    return textLines.map((line, lineIdx) => {
      const trimmed = line.trim();
      const isLastLine = lineIdx === textLines.length - 1;

      // Heading 1: # Title
      if (trimmed.startsWith("# ")) {
        return (
          <Text key={lineIdx} style={[styles.heading1, { color: bodyColor }]}>
            {renderInlineTokens(trimmed.slice(2), `h1-${lineIdx}`, bodyColor, accentColor)}
            {isLastLine && showMoreButton && (
              <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
                {" ... more"}
              </Text>
            )}
          </Text>
        );
      }

      // Heading 2: ## Subtitle
      if (trimmed.startsWith("## ")) {
        return (
          <Text key={lineIdx} style={[styles.heading2, { color: bodyColor }]}>
            {renderInlineTokens(trimmed.slice(3), `h2-${lineIdx}`, bodyColor, accentColor)}
            {isLastLine && showMoreButton && (
              <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
                {" ... more"}
              </Text>
            )}
          </Text>
        );
      }

      // Heading 3: ### Subtitle
      if (trimmed.startsWith("### ")) {
        return (
          <Text key={lineIdx} style={[styles.heading3, { color: bodyColor }]}>
            {renderInlineTokens(trimmed.slice(4), `h3-${lineIdx}`, bodyColor, accentColor)}
            {isLastLine && showMoreButton && (
              <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
                {" ... more"}
              </Text>
            )}
          </Text>
        );
      }

      // Blockquote: > Quote text
      if (trimmed.startsWith("> ")) {
        return (
          <View
            key={lineIdx}
            style={[
              styles.quoteBlock,
              {
                borderLeftColor: accentColor,
                backgroundColor: hasThemedBackground
                  ? "rgba(255,255,255,0.10)"
                  : colors.surface2 || colors.surface,
              },
            ]}
          >
            <Text style={[styles.quoteText, { color: bodyColor }]}>
              {renderInlineTokens(trimmed.slice(2), `quote-${lineIdx}`, bodyColor, accentColor)}
            </Text>
          </View>
        );
      }

      // Bullet List item: • or - or *
      if (/^([•\-\*])\s+/.test(trimmed)) {
        const itemContent = trimmed.replace(/^([•\-\*])\s+/, "");
        return (
          <Row key={lineIdx} style={styles.listItemRow}>
            <Text style={[styles.bulletDot, { color: accentColor }]}>•</Text>
            <Text style={[styles.listText, { color: bodyColor }]}>
              {renderInlineTokens(itemContent, `bullet-${lineIdx}`, bodyColor, accentColor)}
              {isLastLine && showMoreButton && (
                <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
                  {" ... more"}
                </Text>
              )}
            </Text>
          </Row>
        );
      }

      // Numbered List item: 1. or ১. (supports Bengali & English numerals)
      const numMatch = trimmed.match(/^([0-9\u09E6-\u09EF]+[\.\)])\s+(.*)/);
      if (numMatch) {
        const [, prefix, rest] = numMatch;
        return (
          <Row key={lineIdx} style={styles.listItemRow}>
            <Text style={[styles.numberPrefix, { color: accentColor }]}>{prefix} </Text>
            <Text style={[styles.listText, { color: bodyColor }]}>
              {renderInlineTokens(rest, `num-${lineIdx}`, bodyColor, accentColor)}
              {isLastLine && showMoreButton && (
                <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
                  {" ... more"}
                </Text>
              )}
            </Text>
          </Row>
        );
      }

      // Empty blank line
      if (!line) {
        return <View key={lineIdx} style={{ height: 6 }} />;
      }

      // Regular line
      return (
        <Text key={lineIdx} style={[styles.standardBody, { color: bodyColor }]}>
          {renderInlineTokens(line, `p-${lineIdx}`, bodyColor, accentColor)}
          {isLastLine && showMoreButton && (
            <Text onPress={() => setIsExpanded(true)} style={[styles.moreBtn, { color: mutedColor }]}>
              {" ... more"}
            </Text>
          )}
        </Text>
      );
    });
  };

  const renderedBody = (
    <>
      {renderFormattedLines(displayedText)}
      {isLong && isExpanded && (
        <Pressable onPress={() => setIsExpanded(false)} style={styles.lessBtnWrap}>
          <Text style={[styles.lessBtn, { color: mutedColor }]}>less</Text>
        </Pressable>
      )}
    </>
  );

  // Facebook-style authored background: colour the whole post body, while the
  // header / media / action bar keep the app surface so they stay readable.
  if (hasThemedBackground) {
    return (
      <LinearGradient
        colors={appearance.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.themedBody,
          appearance.borderColor
            ? { borderColor: appearance.borderColor, borderWidth: 1 }
            : null,
        ]}
      >
        {renderedBody}
      </LinearGradient>
    );
  }

  return <View style={styles.container}>{renderedBody}</View>;
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  /** Facebook-style authored background behind the post text. */
  themedBody: {
    marginVertical: 6,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: "hidden",
  },
  standardBody: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  boldText: {
    fontWeight: "800",
  },
  italicText: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  linkText: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  hashtag: {
    fontWeight: "700",
  },
  mention: {
    fontWeight: "700",
  },
  moreBtn: {
    fontWeight: "700",
    fontSize: 14,
  },
  lessBtnWrap: {
    marginTop: 4,
    alignSelf: "flex-end",
  },
  lessBtn: {
    fontWeight: "700",
    fontSize: 13,
  },
  heading1: {
    fontSize: 18.5,
    fontWeight: "800",
    lineHeight: 25,
    marginVertical: 4,
  },
  heading2: {
    fontSize: 16.5,
    fontWeight: "700",
    lineHeight: 23,
    marginVertical: 3,
  },
  heading3: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    marginVertical: 2,
  },
  listItemRow: {
    alignItems: "flex-start",
    marginVertical: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 22,
    marginRight: 8,
    fontWeight: "900",
  },
  numberPrefix: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
    minWidth: 20,
  },
  listText: {
    fontSize: 14.5,
    lineHeight: 22,
    flex: 1,
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
