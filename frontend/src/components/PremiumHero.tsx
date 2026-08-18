import React, { ReactNode, useEffect, useRef } from "react";
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
  const { colors, isDark } = useTheme();
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const floatAnim = useRef(new Animated.Value(0)).current;

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
  const gradient = isDark
    ? ["#17345E", "#1B245C", "#31205C"] as const
    : ["#1D4ED8", "#2563EB", "#4F46E5"] as const;

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { borderColor: `${colors.white}2B` }]}>
      <Animated.View style={[s.orb, { transform: [{ translateY }] }]} />
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.detail}>{detail}</Text>
      {children ? <View style={s.childrenContainer}>{children}</View> : null}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  hero: { overflow: "hidden", borderRadius: radius.xl, padding: spacing.lg, gap: 10, borderWidth: 1 },
  orb: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#FFFFFF18", right: -65, top: -80 },
  eyebrow: { color: "#CFFAFE", fontWeight: "900", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.8, lineHeight: 34 },
  detail: { color: "#E7EEFF", fontSize: 15, lineHeight: 22 },
  childrenContainer: { marginTop: 6 },
});
