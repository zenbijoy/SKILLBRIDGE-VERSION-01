import React from "react";
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useTheme, radius, spacing } from "@/theme";

interface GrowthEmptyStateProps {
  illustration: ImageSourcePropType;
  title: string;
  detail: string;
  actionTitle?: string;
  onAction?: () => void;
  illustrationSize?: number;
}

export function GrowthEmptyState({
  illustration,
  title,
  detail,
  actionTitle,
  onAction,
  illustrationSize = 160,
}: GrowthEmptyStateProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? `${colors.white}14` : colors.border,
        },
      ]}
    >
      <Image
        source={illustration}
        style={{ width: illustrationSize, height: illustrationSize }}
        resizeMode="contain"
        accessible={false}
        accessibilityElementsHidden={true}
        importantForAccessibility="no"
      />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
      {actionTitle && onAction ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionTitle}
        >
          <Text style={styles.actionBtnText}>{actionTitle}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  detail: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 280,
  },
  actionBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
