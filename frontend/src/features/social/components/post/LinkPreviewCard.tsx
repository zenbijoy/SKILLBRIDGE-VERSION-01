import React from "react";
import { View, Text, StyleSheet, Image, Pressable, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { LinkMetadata } from "../../types";

interface LinkPreviewCardProps {
  preview: LinkMetadata;
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  const { colors } = useTheme();

  const handlePress = () => {
    if (preview.url) {
      Linking.openURL(preview.url).catch(() => {});
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      {preview.image && (
        <Image source={{ uri: preview.image }} style={styles.image} resizeMode="cover" />
      )}
      <View style={styles.content}>
        <Row style={{ alignItems: "center", gap: 6, marginBottom: 4 }}>
          <MaterialCommunityIcons name="link-variant" size={14} color={colors.primary} />
          <Text style={[styles.siteName, { color: colors.primary }]}>
            {preview.site_name || "External Link"}
          </Text>
        </Row>

        {preview.title && (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}

        {preview.description && (
          <Text style={[styles.description, { color: colors.muted }]} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    marginVertical: 8,
  },
  image: {
    width: "100%",
    height: 150,
    backgroundColor: "#1E293B",
  },
  content: {
    padding: 12,
  },
  siteName: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
});
