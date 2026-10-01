import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme";
import { Row } from "@/components/ui";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PostCard } from "../post/PostCard";
import type { SocialPost } from "../../types";

interface ComposerPreviewProps {
  post: SocialPost;
}

export function ComposerPreview({ post }: ComposerPreviewProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Row style={styles.header}>
        <MaterialCommunityIcons name="eye-outline" size={16} color={colors.primary} />
        <Text style={[styles.previewLabel, { color: colors.primary }]}>Live Feed Preview</Text>
      </Row>

      {/* Renders via canonical PostCard renderer */}
      <PostCard
        post={post}
        isPreview={true}
        onReact={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
