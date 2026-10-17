import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useUserPresence } from "./usePresence";
import { useTheme } from "@/theme";

export interface ActiveDotProps {
  userId?: string | null;
  initialOnline?: boolean;
  size?: number;
  showPulse?: boolean;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
}

export function ActiveDot({
  userId,
  initialOnline,
  size = 11,
  showPulse = true,
  style,
  borderColor,
}: ActiveDotProps) {
  const { colors } = useTheme();
  const isOnline = useUserPresence(userId, initialOnline);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isOnline && showPulse) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1400 }),
          withTiming(1, { duration: 0 })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1400 }),
          withTiming(0.6, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = 1;
      pulseOpacity.value = 0;
    }
  }, [isOnline, showPulse, pulseScale, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  if (!isOnline) return null;

  const dotBorderColor = borderColor || colors.surface;

  return (
    <View
      style={[
        s.container,
        { width: size, height: size },
        style,
      ]}
      pointerEvents="none"
    >
      {showPulse && (
        <Animated.View
          style={[
            s.pulseRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: "#22C55E",
            },
            pulseAnimatedStyle,
          ]}
        />
      )}
      <View
        style={[
          s.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#22C55E",
            borderColor: dotBorderColor,
            borderWidth: Math.max(1.5, Math.round(size / 5)),
          },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
  },
  dot: {
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
});
