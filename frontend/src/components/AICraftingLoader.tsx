import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Dimensions, Platform } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/theme";

interface AICraftingLoaderProps {
  title?: string;
  subtitle?: string;
  steps?: string[];
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
}

const DEFAULT_STEPS = [
  "Analyzing skill syllabus & learning prerequisites…",
  "Formulating Bloom's Taxonomy cognitive stems…",
  "Engineering high-discrimination distractors…",
  "Finalizing adaptive assessment matrix…",
];

export function AICraftingLoader({
  title = "Crafting Your Assessment",
  subtitle = "AI is generating personalized questions with Bloom's taxonomy distractor engineering.",
  steps = DEFAULT_STEPS,
  iconName = "brain",
}: AICraftingLoaderProps) {
  const { colors, isDark } = useTheme();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // ── 1. Rotational Shared Values ───────────────────────────────────────────
  const outerRotate = useSharedValue(0);
  const middleRotate = useSharedValue(0);
  const innerRotate = useSharedValue(0);

  // ── 2. Pulsing & Levitation Shared Values ─────────────────────────────────
  const haloScale = useSharedValue(0.92);
  const haloOpacity = useSharedValue(0.35);
  const coreFloatY = useSharedValue(0);
  const coreScale = useSharedValue(1);

  // ── 3. Bouncing Wave Dots (4 dots with staggered harmonic timing) ─────────
  const dotY0 = useSharedValue(0);
  const dotY1 = useSharedValue(0);
  const dotY2 = useSharedValue(0);
  const dotY3 = useSharedValue(0);

  // ── 4. Shimmer Progress Bar ───────────────────────────────────────────────
  const shimmerX = useSharedValue(-120);

  // Step ticker interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStepIdx((prev) => (prev + 1) % steps.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [steps.length]);

  // Start continuous Reanimated animations
  useEffect(() => {
    // Outer orbit: clockwise continuous 360 rotation (6.5s)
    outerRotate.value = withRepeat(
      withTiming(360, { duration: 6500, easing: Easing.linear }),
      -1,
      false
    );

    // Middle orbit: counter-clockwise continuous -360 rotation (4.2s)
    middleRotate.value = withRepeat(
      withTiming(-360, { duration: 4200, easing: Easing.linear }),
      -1,
      false
    );

    // Inner orbit: clockwise 360 rotation (3s)
    innerRotate.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );

    // Halo pulse: breathing scale & glow
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.92, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    haloOpacity.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.25, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Core levitation (floating up and down)
    coreFloatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(7, { duration: 1500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // Core subtle heartbeat scale
    coreScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.98, { duration: 1200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    // Staggered Bouncing Wave Dots
    const bounceDuration = 700;
    const makeBounce = (sharedVal: typeof dotY0, delayMs: number) => {
      sharedVal.value = withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(-9, { duration: bounceDuration / 2, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: bounceDuration / 2, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 300 })
          ),
          -1,
          false
        )
      );
    };

    makeBounce(dotY0, 0);
    makeBounce(dotY1, 140);
    makeBounce(dotY2, 280);
    makeBounce(dotY3, 420);

    // Shimmer bar sweep
    shimmerX.value = withRepeat(
      withTiming(220, { duration: 1800, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false
    );
  }, []);

  // ── Animated Styles ───────────────────────────────────────────────────────
  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${outerRotate.value}deg` }],
  }));

  const middleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${middleRotate.value}deg` }],
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${innerRotate.value}deg` }],
  }));

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

  const coreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: coreFloatY.value }, { scale: coreScale.value }],
  }));

  const dot0Style = useAnimatedStyle(() => ({ transform: [{ translateY: dotY0.value }] }));
  const dot1Style = useAnimatedStyle(() => ({ transform: [{ translateY: dotY1.value }] }));
  const dot2Style = useAnimatedStyle(() => ({ transform: [{ translateY: dotY2.value }] }));
  const dot3Style = useAnimatedStyle(() => ({ transform: [{ translateY: dotY3.value }] }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      {/* ── 1. Gyroscopic Multi-Orbit Spinner Structure ────────────────── */}
      <View style={styles.spinnerWrapper}>
        {/* Glowing Background Radial Halo */}
        <Animated.View
          style={[
            styles.haloGlow,
            { backgroundColor: colors.primary },
            haloAnimatedStyle,
          ]}
        />

        {/* Outer Orbit (Dashed / Dual-colored Arc Ring with Satellite) */}
        <Animated.View
          style={[
            styles.outerOrbit,
            {
              borderColor: isDark ? "rgba(99, 102, 241, 0.28)" : "rgba(37, 99, 235, 0.25)",
              borderTopColor: colors.primary,
              borderBottomColor: colors.accent || "#38BDF8",
            },
            outerStyle,
          ]}
        >
          {/* Orbiting Satellite Dot 1 */}
          <View style={[styles.satelliteDot, { backgroundColor: colors.accent || "#38BDF8" }]} />
          {/* Orbiting Satellite Dot 2 */}
          <View style={[styles.satelliteDotOpposite, { backgroundColor: colors.primary }]} />
        </Animated.View>

        {/* Middle Orbit (Opposite Rotation with Luminous Accent Bead) */}
        <Animated.View
          style={[
            styles.middleOrbit,
            {
              borderColor: isDark ? "rgba(56, 189, 248, 0.2)" : "rgba(14, 165, 233, 0.2)",
              borderLeftColor: isDark ? "#60A5FA" : "#2563EB",
              borderRightColor: isDark ? "#A78BFA" : "#7C3AED",
            },
            middleStyle,
          ]}
        >
          <View style={[styles.middleBead, { backgroundColor: "#60A5FA" }]} />
        </Animated.View>

        {/* Inner Pulsing Track */}
        <Animated.View
          style={[
            styles.innerOrbit,
            {
              borderColor: isDark ? "rgba(167, 139, 250, 0.35)" : "rgba(124, 58, 237, 0.3)",
              borderTopColor: colors.primary,
            },
            innerStyle,
          ]}
        />

        {/* Central Core: Floating Brain Capsule with Glassmorphic Glow */}
        <Animated.View
          style={[
            styles.coreCapsule,
            {
              backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : colors.primarySoft,
              borderColor: isDark ? "rgba(96, 165, 250, 0.45)" : colors.primary + "40",
            },
            coreAnimatedStyle,
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["rgba(59, 130, 246, 0.3)", "rgba(147, 51, 234, 0.15)"]
                : ["rgba(255, 255, 255, 0.6)", "rgba(219, 234, 254, 0.3)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.coreGradient}
          >
            <MaterialCommunityIcons name={iconName} size={48} color={colors.primary} />
            {/* AI Sparkle badge */}
            <View style={[styles.sparkleBadge, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="auto-fix" size={11} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* ── 2. Title & Subtitle ────────────────────────────────────────── */}
      <Animated.Text
        entering={FadeInDown.delay(150).springify()}
        style={[styles.title, { color: colors.text }]}
      >
        {title}
      </Animated.Text>

      <Animated.Text
        entering={FadeInDown.delay(250).springify()}
        style={[styles.subtitle, { color: colors.muted }]}
      >
        {subtitle}
      </Animated.Text>

      {/* ── 3. Harmonic Wave Bouncing Dots ─────────────────────────────── */}
      <View style={styles.waveDotsRow}>
        <Animated.View style={[styles.waveDot, { backgroundColor: colors.primary }, dot0Style]} />
        <Animated.View style={[styles.waveDot, { backgroundColor: "#38BDF8" }, dot1Style]} />
        <Animated.View style={[styles.waveDot, { backgroundColor: "#818CF8" }, dot2Style]} />
        <Animated.View style={[styles.waveDot, { backgroundColor: colors.primary }, dot3Style]} />
      </View>

      {/* ── 4. Dynamic Live AI Step Progress Ticker ────────────────────── */}
      <Animated.View
        entering={FadeInUp.delay(350).springify()}
        style={[
          styles.stepCard,
          {
            backgroundColor: isDark ? "rgba(30, 41, 59, 0.7)" : colors.surface2,
            borderColor: isDark ? "rgba(71, 85, 105, 0.5)" : colors.border,
          },
        ]}
      >
        <View style={styles.stepHeader}>
          <View style={[styles.stepPulseDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.stepCounterText, { color: colors.primary }]}>
            AI Engine • Step {currentStepIdx + 1} of {steps.length}
          </Text>
        </View>

        <Text
          key={currentStepIdx}
          numberOfLines={2}
          style={[styles.stepText, { color: colors.text }]}
        >
          {steps[currentStepIdx]}
        </Text>

        {/* Shimmering Progress Track */}
        <View style={[styles.progressBarTrack, { backgroundColor: isDark ? "#0F172A" : colors.border }]}>
          <View
            style={[
              styles.progressBarFilled,
              {
                width: `${((currentStepIdx + 1) / steps.length) * 100}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
          {/* Animated beam reflection */}
          <Animated.View style={[styles.shimmerBeam, shimmerStyle]}>
            <LinearGradient
              colors={["transparent", "rgba(255,255,255,0.7)", "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const SPINNER_SIZE = 176;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  spinnerWrapper: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  haloGlow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    filter: Platform.OS === "web" ? "blur(32px)" : undefined,
  },
  outerOrbit: {
    position: "absolute",
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: SPINNER_SIZE / 2,
    borderWidth: 2.2,
    borderStyle: "dashed",
  },
  satelliteDot: {
    position: "absolute",
    top: -5,
    left: SPINNER_SIZE / 2 - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: "#38BDF8",
    shadowRadius: 8,
    shadowOpacity: 0.9,
    elevation: 4,
  },
  satelliteDotOpposite: {
    position: "absolute",
    bottom: -5,
    left: SPINNER_SIZE / 2 - 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: "#2563EB",
    shadowRadius: 6,
    shadowOpacity: 0.8,
    elevation: 3,
  },
  middleOrbit: {
    position: "absolute",
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 2,
  },
  middleBead: {
    position: "absolute",
    top: 68 - 4,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    shadowColor: "#60A5FA",
    shadowRadius: 6,
    shadowOpacity: 0.9,
    elevation: 3,
  },
  innerOrbit: {
    position: "absolute",
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1.5,
  },
  coreCapsule: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  coreGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleBadge: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 20,
    maxWidth: 420,
  },
  waveDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 24,
    marginTop: 2,
  },
  waveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: "#38BDF8",
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 2,
  },
  stepCard: {
    marginTop: 10,
    width: "100%",
    maxWidth: 380,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  stepPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepText: {
    fontSize: 13.5,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },
  progressBarTrack: {
    width: "100%",
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
    position: "relative",
    marginTop: 2,
  },
  progressBarFilled: {
    height: "100%",
    borderRadius: 2.5,
  },
  shimmerBeam: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 60,
  },
});
