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

// Master symbol aspect ratio: width 512px : height 512px (1:1 square)
const SYMBOL_ASPECT_RATIO = 1;

// Bundled official brand mark asset
const BRAND_MARK_ASSET = require("@/../assets/branding/skillbridge-mark.png");

export interface SkillBridgeLoaderProps {
  /**
   * Logical width of the brand mark:
   * - "small": 44px
   * - "medium": 72px (default for card/inline loading)
   * - "large": 100px
   * - "hero": 120px (default for full-screen boots)
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
      ? 44
      : size === "medium"
      ? 72
      : size === "large"
      ? 100
      : 120; // hero / fullScreen
  const height = Math.round(width / SYMBOL_ASPECT_RATIO);

  // Animated values
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [glowAnim] = useState(() => new Animated.Value(0.4));
  const [translateYAnim] = useState(() => new Animated.Value(0));
  const [barAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      scaleAnim.setValue(1);
      glowAnim.setValue(0.5);
      translateYAnim.setValue(0);
      barAnim.setValue(0.5);
      return;
    }

    const useNativeDriver = Platform.OS !== "web";

    // Logo pulsing animation
    const pulseAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.06,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.96,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.85,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.35,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(translateYAnim, {
            toValue: -3,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver,
          }),
          Animated.timing(translateYAnim, {
            toValue: 3,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver,
          }),
        ]),
      ])
    );

    // Progress bar runner animation (fullScreen only)
    const barAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(barAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(barAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ])
    );

    pulseAnimation.start();
    if (fullScreen) {
      barAnimation.start();
    }

    return () => {
      pulseAnimation.stop();
      barAnimation.stop();
    };
  }, [reduceMotion, fullScreen, scaleAnim, glowAnim, translateYAnim, barAnim]);

  const containerBg = background ?? (fullScreen ? colors.bg : "transparent");

  const containerStyle = [
    styles.container,
    fullScreen && styles.fullScreen,
    { backgroundColor: containerBg },
    style,
  ];

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["15%", "90%"],
  });

  return (
    <View style={containerStyle} testID={testID} accessibilityRole="progressbar">
      <View style={styles.logoWrapper}>
        {/* Ambient Glow Aura */}
        {fullScreen && (
          <Animated.View
            style={[
              styles.glowAura,
              {
                width: width * 1.5,
                height: height * 1.5,
                borderRadius: (width * 1.5) / 2,
                backgroundColor: colors.primary,
                opacity: reduceMotion ? 0.2 : glowAnim,
                transform: [{ scale: reduceMotion ? 1 : scaleAnim }],
              },
            ]}
          />
        )}

        <Animated.View
          style={{
            width,
            height,
            transform: [
              { scale: reduceMotion ? 1 : scaleAnim },
              { translateY: reduceMotion ? 0 : translateYAnim },
            ],
          }}
        >
          <Image
            source={BRAND_MARK_ASSET}
            style={{ width, height, borderRadius: width * 0.2 }}
            resizeMode="contain"
            accessible
            accessibilityLabel="SkillBridge"
          />
        </Animated.View>
      </View>

      {fullScreen ? (
        <View style={styles.brandContent}>
          <Text style={[styles.brandTitle, { color: colors.text }]}>SkillBridge</Text>
          <Text style={[styles.brandTagline, { color: isDark ? colors.textSecondary : colors.muted }]}>
            {message || "Campus Peer Learning & Skills"}
          </Text>

          {/* Animated Progress Bar */}
          <View style={[styles.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: barWidth,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ) : message ? (
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
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glowAura: {
    position: "absolute",
    filter: "blur(20px)" as any,
  },
  brandContent: {
    alignItems: "center",
    marginTop: 22,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  brandTagline: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  progressTrack: {
    width: 140,
    height: 4,
    borderRadius: 2,
    marginTop: 24,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
  },
  message: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
