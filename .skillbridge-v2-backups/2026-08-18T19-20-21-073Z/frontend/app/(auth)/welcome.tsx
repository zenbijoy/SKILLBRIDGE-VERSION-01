import { router } from "expo-router";
import { StyleSheet, Text, View, Animated } from "react-native";
import { Button, H1 } from "@/components/ui";
import { colors, spacing } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";

export default function Welcome() {
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [fadeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatAnim, fadeAnim]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  return (
    <LinearGradient
      colors={["#0C192A", "#07111F", "#040914"]}
      style={s.container}
    >
      <Animated.View style={[s.orb1, { transform: [{ translateY }] }]} />
      <Animated.View
        style={[
          s.orb2,
          { transform: [{ translateY: Animated.multiply(translateY, -0.6) }] },
        ]}
      />

      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        <View style={s.hero}>
          <Text style={s.brand}>SKILLBRIDGE</Text>
          <H1>Learn from people around you. Teach what you know.</H1>
          <Text style={s.detail}>
            Peer learning, research collaboration, clubs, events, realtime rooms
            and live classes in one campus network.
          </Text>
        </View>

        <View style={s.actions}>
          <Button
            title="Create account"
            onPress={() => router.push("/(auth)/sign-up")}
          />
          <Button
            title="I already have an account"
            variant="secondary"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "space-between",
    paddingVertical: 80,
  },
  orb1: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#5B8CFF20",
    top: -100,
    right: -100,
    filter: [{ blur: 40 }] as any,
  },
  orb2: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "#22D3A615",
    bottom: -100,
    left: -150,
    filter: [{ blur: 50 }] as any,
  },
  hero: { gap: 20, marginTop: 40 },
  brand: {
    color: colors.accent,
    fontWeight: "900",
    letterSpacing: 4,
    fontSize: 14,
    textTransform: "uppercase",
  },
  detail: { color: colors.muted, fontSize: 18, lineHeight: 28, opacity: 0.9 },
  actions: { gap: spacing.md, paddingBottom: 40 },
});
