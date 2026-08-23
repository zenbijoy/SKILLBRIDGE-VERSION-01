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
}

export function GrowthHero({
  eyebrow,
  title,
  subtitle,
  illustration,
  illustrationSize,
  children,
  style,
}: GrowthHeroProps) {
  const { colors, isDark, isOled } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const defaultImgSize = isWide ? 160 : 130;
  const imgSize = illustrationSize || defaultImgSize;

  const gradientColors = isOled
    ? (["#0B132B", "#050B1A", "#000000"] as const)
    : isDark
    ? ([colors.surfaceElevated, colors.surface, colors.bg] as const)
    : ([`${colors.primary}12`, `${colors.primary2}08`, colors.surface] as const);

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.heroContainer,
        {
          borderColor: isDark ? `${colors.white}18` : `${colors.primary}25`,
          backgroundColor: colors.surface,
        },
        isWide ? styles.wideLayout : styles.stackedLayout,
        style,
      ]}
    >
      <View style={[styles.textBlock, isWide && { flex: 1 }]}>
        {eyebrow ? (
          <Text
            style={[
              styles.eyebrow,
              { color: isDark ? colors.accent : colors.primary },
            ]}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
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
