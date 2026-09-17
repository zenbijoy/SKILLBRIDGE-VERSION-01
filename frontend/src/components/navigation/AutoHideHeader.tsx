import React, { type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAutoHideNavigation } from "@/navigation/AutoHideNavigationContext";
import { useTheme } from "@/theme";

export interface AutoHideHeaderProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  floating?: boolean;
}

export function AutoHideHeader({ children, style, floating = true }: AutoHideHeaderProps) {
  const { headerAnimatedStyle, isNavVisible, setHeaderHeight } = useAutoHideNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Animated.View
      onLayout={(e) => {
        const height = e.nativeEvent.layout.height;
        if (height > 0) {
          setHeaderHeight(height);
        }
      }}
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 8,
          paddingHorizontal: 16,
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
        },
        floating && styles.floating,
        headerAnimatedStyle,
        style,
      ]}
      pointerEvents={isNavVisible ? "auto" : "none"}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",
    zIndex: 100,
  },
  floating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
});
