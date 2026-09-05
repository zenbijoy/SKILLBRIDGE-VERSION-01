import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "@/theme";

// Master symbol aspect ratio: width 584px : height 374px
const SYMBOL_ASPECT_RATIO = 584 / 374;

// Optimized local bundled brand mark asset
const BRAND_MARK_ASSET = require("@/../assets/branding/skillbridge-mark.png");

export interface SkillBridgeLoaderProps {
  /**
   * Logical width of the brand mark:
   * - "small": 48px
   * - "medium": 80px (default for card/inline loading)
   * - "large": 120px
   * - "hero": 140px (default for full-screen boots)
   * - custom numeric width
   */
  size?: "small" | "medium" | "large" | "hero" | number;
  /**
   * If true, stretches to fill the container with centered content and theme background
   */
  fullScreen?: boolean;
  /**
   * Optional custom background color (defaults to colors.bg when fullScreen is true)
   */
  background?: string;
  /**
   * Optional status message displayed below the logo mark.
   * Default is undefined: NO text is displayed by default.
   */
  message?: string;
  /**
   * Optional container style override
   */
  style?: ViewStyle;
  testID?: string;
}

export function SkillBridgeLoader({
  size = "medium",
  fullScreen = false,
  background,
  message,
  style,
  testID = "skillbridge-loader",
}: SkillBridgeLoaderProps) {
  const { colors, isDark } = useTheme();

  // Accessibility reduced-motion support
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  // Compute width and proportional height
  const width =
    typeof size === "number"
      ? size
      : size === "small"
      ? 48
      : size === "medium"
      ? 80
      : size === "large"
      ? 120
      : 140; // hero / fullScreen
  const height = Math.round(width / SYMBOL_ASPECT_RATIO);

  // Animated values (created once via useState initializer to comply with React 19 lint rules)
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [opacityAnim] = useState(() => new Animated.Value(0.95));
  const [translateYAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
      translateYAnim.setValue(0);
      return;
    }

    const useNativeDriver = Platform.OS !== "web";
    const duration = 700;
    const easing = Easing.inOut(Easing.quad);

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.025,
            duration,
            easing,
            useNativeDriver,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.975,
            duration,
            easing,
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 1.0,
            duration,
            easing,
            useNativeDriver,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.88,
            duration,
            easing,
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(translateYAnim, {
            toValue: -1.5,
            duration,
            easing,
            useNativeDriver,
          }),
          Animated.timing(translateYAnim, {
            toValue: 1.5,
            duration,
            easing,
            useNativeDriver,
          }),
        ]),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [reduceMotion, scaleAnim, opacityAnim, translateYAnim]);

  const containerBg =
    background ?? (fullScreen ? colors.bg : "transparent");

  const containerStyle = [
    styles.container,
    fullScreen && styles.fullScreen,
    { backgroundColor: containerBg },
    style,
  ];

  return (
    <View style={containerStyle} testID={testID} accessibilityRole="progressbar">
      <Animated.View
        style={{
          width,
          height,
          transform: [
            { scale: reduceMotion ? 1 : scaleAnim },
            { translateY: reduceMotion ? 0 : translateYAnim },
          ],
          opacity: reduceMotion ? 1 : opacityAnim,
        }}
      >
        <Image
          source={BRAND_MARK_ASSET}
          style={{ width, height }}
          resizeMode="contain"
          accessible
          accessibilityLabel="SkillBridge"
        />
      </Animated.View>

      {message ? (
        <Text
          style={[
            styles.message,
            { color: isDark ? colors.textSecondary : colors.muted },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  fullScreen: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  message: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
