import React, { ReactNode } from "react";
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  StyleSheet,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radius, spacing } from "@/theme";

interface GrowthHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  illustration: ImageSourcePropType;
  illustrationSize?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function GrowthHero({
  eyebrow,
  title,
  subtitle,
  illustration,
  illustrationSize,
  children,
  style,
  compact = false,
}: GrowthHeroProps) {
  const { colors, isDark, isOled } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const defaultImgSize = compact ? 64 : isWide ? 160 : 130;
  const imgSize = illustrationSize || defaultImgSize;

  const gradientColors = isOled
    ? (["#0B132B", "#050B1A", "#000000"] as const)
    : isDark
    ? ([colors.surfaceElevated, colors.surface, colors.bg] as const)
    : ([`${colors.primary}12`, `${colors.primary2}08`, colors.surface] as const);

  const layoutStyle = compact
    ? styles.compactLayout
    : isWide
    ? styles.wideLayout
    : styles.stackedLayout;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.heroContainer,
        compact && styles.compactHeroContainer,
        {
          borderColor: isDark ? `${colors.white}18` : `${colors.primary}25`,
          backgroundColor: colors.surface,
        },
        layoutStyle,
        style,
      ]}
    >
      <View style={[styles.textBlock, (isWide || compact) && { flex: 1 }, compact && styles.compactTextBlock]}>
        {eyebrow ? (
          <Text
            style={[
              styles.eyebrow,
              compact && styles.compactEyebrow,
              { color: isDark ? colors.accent : colors.primary },
            ]}
            numberOfLines={compact ? 1 : undefined}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={[
            styles.title,
            compact && styles.compactTitle,
            { color: colors.text },
          ]}
          numberOfLines={compact ? 1 : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              compact && styles.compactSubtitle,
              { color: colors.textSecondary },
            ]}
            numberOfLines={compact ? 2 : undefined}
          >
            {subtitle}
          </Text>
        ) : null}
        {children ? <View style={styles.actionContainer}>{children}</View> : null}
      </View>

      <View style={[styles.imageWrapper, { width: imgSize, height: imgSize }]}>
        <Image
          source={illustration}
          style={{ width: imgSize, height: imgSize }}
          resizeMode="contain"
          accessible={false}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  compactHeroContainer: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  compactLayout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  compactTextBlock: {
    gap: 2,
  },
  compactEyebrow: {
    fontSize: 10,
    letterSpacing: 0.8,
  },
  compactTitle: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  compactSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  stackedLayout: {
    flexDirection: "column-reverse",
    alignItems: "center",
    gap: 12,
  },
  wideLayout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  textBlock: {
    gap: 6,
    width: "100%",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  actionContainer: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imageWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
});
