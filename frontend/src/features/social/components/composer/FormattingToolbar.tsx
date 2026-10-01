import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface FormattingToolbarProps {
  onInsertMarkdown: (prefix: string, suffix?: string, defaultText?: string) => void;
  onOpenMentions: () => void;
  onOpenHashtags: () => void;
  onOpenEmoji: () => void;
  onOpenAiAssist: () => void;
  onToggleAppearance: () => void;
  isAppearanceActive?: boolean;
}

export function FormattingToolbar({
  onInsertMarkdown,
  onOpenMentions,
  onOpenHashtags,
  onOpenEmoji,
  onOpenAiAssist,
  onToggleAppearance,
  isAppearanceActive = false,
}: FormattingToolbarProps) {
  const { colors } = useTheme();

  const handleAction = (fn: () => void) => {
    triggerHaptic("selection");
    fn();
  };

  return (
    <View style={[styles.toolbarContainer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Style / Card Theme Toggle */}
        <Pressable
          onPress={() => handleAction(onToggleAppearance)}
          style={[
            styles.toolBtn,
            isAppearanceActive && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary },
          ]}
        >
          <MaterialCommunityIcons
            name="palette"
            size={18}
            color={isAppearanceActive ? colors.primary : colors.text}
          />
          <Text style={[styles.toolBtnText, { color: isAppearanceActive ? colors.primary : colors.text }]}>
            Style
          </Text>
        </Pressable>

        {/* AI Assist Action */}
        <Pressable
          onPress={() => handleAction(onOpenAiAssist)}
          style={[styles.aiBtn, { backgroundColor: "#8B5CF620", borderColor: "#8B5CF6" }]}
        >
          <MaterialCommunityIcons name="creation" size={16} color="#8B5CF6" />
          <Text style={styles.aiBtnText}>AI Assist</Text>
        </Pressable>

        <View style={[styles.separator, { backgroundColor: colors.border }]} />

        {/* Bold */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("**", "**", "bold text"))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="format-bold" size={20} color={colors.text} />
        </Pressable>

        {/* Italic */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("*", "*", "italic text"))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="format-italic" size={20} color={colors.text} />
        </Pressable>

        {/* Bullet List */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("\n• ", "", "list item"))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="format-list-bulleted" size={20} color={colors.text} />
        </Pressable>

        {/* Code Snippet */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("`", "`", "code"))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="code-tags" size={20} color={colors.text} />
        </Pressable>

        {/* Quote */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("\n> ", "", "quoted text"))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="format-quote-close" size={20} color={colors.text} />
        </Pressable>

        {/* Divider */}
        <Pressable
          onPress={() => handleAction(() => onInsertMarkdown("\n---\n", "", ""))}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="minus" size={20} color={colors.text} />
        </Pressable>

        <View style={[styles.separator, { backgroundColor: colors.border }]} />

        {/* @ Mention */}
        <Pressable onPress={() => handleAction(onOpenMentions)} style={styles.iconBtn}>
          <MaterialCommunityIcons name="at" size={20} color={colors.primary} />
        </Pressable>

        {/* # Hashtag */}
        <Pressable onPress={() => handleAction(onOpenHashtags)} style={styles.iconBtn}>
          <MaterialCommunityIcons name="pound" size={20} color={colors.primary} />
        </Pressable>

        {/* Emoji */}
        <Pressable onPress={() => handleAction(onOpenEmoji)} style={styles.iconBtn}>
          <MaterialCommunityIcons name="emoticon-happy-outline" size={20} color="#F59E0B" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbarContainer: {
    borderTopWidth: 1,
    paddingVertical: 6,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 6,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  toolBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  aiBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  separator: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
  iconBtn: {
    padding: 7,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
