import { useState, useEffect } from "react";
import { View, TextInput, TextInputProps, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "./haptics";

export interface AppTextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  success?: boolean;
  leftIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onRightIconPress?: () => void;
  helperText?: string;
}

export function AppTextField({
  label,
  error,
  success,
  leftIcon,
  rightIcon,
  onRightIconPress,
  helperText,
  value,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: AppTextFieldProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const isActive = isFocused || (value !== undefined && value !== null && value.length > 0);

  // Animated values
  const focusAnim = useSharedValue(0);
  const labelTop = useSharedValue(isActive ? -9 : 17);
  const labelLeft = useSharedValue(isActive ? 14 : (leftIcon ? 44 : 16));
  const labelSize = useSharedValue(isActive ? 12 : 15);

  useEffect(() => {
    focusAnim.value = withTiming(isFocused ? 1 : 0, { duration: 180 });
    labelTop.value = withTiming(isActive ? -9 : 17, { duration: 180 });
    labelLeft.value = withTiming(isActive ? 14 : (leftIcon ? 44 : 16), { duration: 180 });
    labelSize.value = withTiming(isActive ? 12 : 15, { duration: 180 });
  }, [isFocused, isActive, leftIcon, focusAnim, labelTop, labelLeft, labelSize]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      focusAnim.value,
      [0, 1],
      [
        error ? colors.danger : success ? colors.success : colors.border,
        error ? colors.danger : success ? colors.success : colors.primary
      ]
    );

    return {
      borderColor,
      shadowOpacity: focusAnim.value * 0.15,
      elevation: isFocused ? 3 : 0,
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    const labelColor = interpolateColor(
      focusAnim.value,
      [0, 1],
      [
        error ? colors.danger : colors.muted,
        error ? colors.danger : colors.primary
      ]
    );
    return {
      top: labelTop.value,
      left: labelLeft.value,
      fontSize: labelSize.value,
      color: labelColor,
    };
  });

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const surfaceBg = editable ? colors.surface : colors.surface2;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: surfaceBg, opacity: editable ? 1 : 0.65 },
          animatedContainerStyle,
        ]}
      >
        {/* Floating Label: sits smoothly on border cut when active */}
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.label,
            { backgroundColor: isActive ? surfaceBg : "transparent" },
            animatedLabelStyle,
          ]}
        >
          {label}
        </Animated.Text>

        {leftIcon && (
          <MaterialCommunityIcons
            name={leftIcon}
            size={20}
            color={isFocused ? colors.primary : error ? colors.danger : colors.muted}
            style={styles.iconLeft}
          />
        )}

        <TextInput
          accessible={true}
          accessibilityLabel={props.accessibilityLabel || label}
          accessibilityHint={props.accessibilityHint || helperText || props.placeholder}
          accessibilityState={{ disabled: !editable }}
          {...props}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={editable}
          multiline={false}
          placeholder={isFocused ? props.placeholder : ""}
          placeholderTextColor={colors.muted}
          cursorColor={colors.primary}
          selectionColor={`${colors.primary}40`}
          style={[
            styles.input,
            {
              color: editable ? colors.text : colors.muted,
              paddingLeft: leftIcon ? 8 : 16,
              paddingRight: rightIcon ? 8 : 16,
            },
          ]}
        />

        {rightIcon && (
          <Pressable
            hitSlop={12}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${label} action`}
            onPress={() => {
              triggerHaptic();
              if (onRightIconPress) onRightIconPress();
            }}
            style={styles.iconRight}
          >
            <MaterialCommunityIcons
              name={rightIcon}
              size={20}
              color={isFocused ? colors.primary : colors.muted}
            />
          </Pressable>
        )}
      </Animated.View>

      {(error || helperText) && (
        <Animated.Text style={[styles.helper, { color: error ? colors.danger : colors.muted }]}>
          {error || helperText}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    marginBottom: 16,
    flexGrow: 0,
    flexShrink: 0,
    position: "relative",
  },
  container: {
    width: "100%",
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.md,
    position: "relative",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: "500",
    textAlignVertical: "center",
  },
  label: {
    position: "absolute",
    zIndex: 10,
    paddingHorizontal: 6,
    fontWeight: "600",
    borderRadius: 4,
  },
  iconLeft: {
    marginLeft: 16,
    marginRight: 0,
  },
  iconRight: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  helper: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 4,
  },
});

