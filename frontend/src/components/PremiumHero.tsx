import React, { ReactNode, useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radius, spacing, useTheme } from "@/theme";
import { usePreferencesStore } from "@/state/usePreferencesStore";

export function PremiumHero({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  const { colors, isDark, isOled } = useTheme();
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const [floatAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      floatAnim.stopAnimation();
      floatAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim, reduceMotion]);

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const inverseTranslateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  const gradient = isOled
    ? ["#0F172A", "#09090B", "#000000"] as const
    : isDark
    ? [colors.surfaceElevated, colors.surface, colors.bg] as const
    : [colors.primary, colors.primary2, `${colors.primary2}DD`] as const;

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, { borderColor: `${colors.white}25` }]}
    >
      <Animated.View style={[s.orb, { backgroundColor: `${colors.primary}33`, transform: [{ translateY }] }]} />
      <Animated.View style={[s.orb2, { backgroundColor: `${colors.accent}22`, transform: [{ translateY: inverseTranslateY }] }]} />
      <Text style={[s.eyebrow, { color: isDark ? colors.accent : "#E0F2FE" }]}>{eyebrow}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={[s.detail, { color: isDark ? colors.textSecondary : "#F0F9FF" }]}>{detail}</Text>
      {children ? <View style={s.childrenContainer}>{children}</View> : null}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  hero: { overflow: "hidden", borderRadius: radius.xl, padding: spacing.lg, gap: 10, borderWidth: 1 },
  orb: { position: "absolute", width: 220, height: 220, borderRadius: 110, right: -70, top: -85 },
  orb2: { position: "absolute", width: 140, height: 140, borderRadius: 70, left: -40, bottom: -40 },
  eyebrow: { fontWeight: "900", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.8, lineHeight: 34 },
  detail: { fontSize: 15, lineHeight: 22 },
  childrenContainer: { marginTop: 6 },
});
