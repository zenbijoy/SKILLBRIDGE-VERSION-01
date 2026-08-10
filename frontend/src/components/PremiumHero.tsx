import React, { ReactNode, useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "@/theme";

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
  const [floatAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatAnim]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  return (
    <LinearGradient
      colors={["#17345E", "#1B245C", "#31205C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.hero}
    >
      <Animated.View style={[s.orb, { transform: [{ translateY }] }]} />
      <Animated.View
        style={[
          s.orb2,
          { transform: [{ translateY: Animated.multiply(translateY, -0.5) }] },
        ]}
      />
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.detail}>{detail}</Text>
      <View style={s.childrenContainer}>{children}</View>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  hero: {
    overflow: "hidden",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
    borderWidth: 1,
    borderColor: "#355889",
    shadowColor: "#1B245C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  orb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#2ADBB630",
    right: -60,
    top: -80,
    transform: [{ scale: 1.2 }],
  },
  orb2: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#D830B320",
    left: -30,
    bottom: -50,
  },
  eyebrow: {
    color: colors.accent,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    maxWidth: 520,
    lineHeight: 38,
  },
  detail: {
    color: "#CDDAEE",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 620,
    opacity: 0.9,
  },
  childrenContainer: { marginTop: 8 },
});
