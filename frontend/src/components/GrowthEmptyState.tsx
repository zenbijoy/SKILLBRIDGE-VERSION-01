import React from "react";
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius, spacing } from "@/theme";

interface GrowthEmptyStateProps {
  illustration?: ImageSourcePropType;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  animation?: ImageSourcePropType;
  title: string;
  detail: string;
  actionTitle?: string;
  onAction?: () => void;
  illustrationSize?: number;
}

export function GrowthEmptyState({
  illustration: _illustration,
  icon = "compass-outline",
  animation,
  title,
  detail,
  actionTitle,
  onAction,
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
      {animation ? (
        <Image
          source={animation}
          style={{ width: 64, height: 64, marginBottom: 4 }}
          resizeMode="contain"
          accessible={false}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      ) : (
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: `${colors.primary}18`,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: `${colors.primary}33`,
            marginBottom: 4,
          }}
        >
          <MaterialCommunityIcons name={icon} size={28} color={colors.primary} />
        </View>
      )}
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
