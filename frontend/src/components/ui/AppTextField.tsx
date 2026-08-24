import { ReactNode, useState, useEffect } from "react";
import { View, TextInput, TextInputProps, Pressable, Platform, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

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

  // Animated values
  const focusAnim = useSharedValue(0);
  const labelTop = useSharedValue(16);
  const labelSize = useSharedValue(15);
  
  const isActive = isFocused || (value !== undefined && value.length > 0);

  useEffect(() => {
    focusAnim.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
    labelTop.value = withSpring(isActive ? -8 : 16, { damping: 14, stiffness: 150 });
    labelSize.value = withTiming(isActive ? 12 : 15, { duration: 200 });
  }, [isFocused, isActive, focusAnim, labelTop, labelSize]);

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
      elevation: isFocused ? 4 : 0,
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

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: editable ? colors.surface : colors.surface2 },
          animatedContainerStyle,
        ]}
      >
        {leftIcon && (
          <MaterialCommunityIcons
            name={leftIcon}
            size={20}
            color={isFocused ? colors.primary : colors.muted}
            style={styles.iconLeft}
          />
        )}
        
        <View style={styles.inputContainer}>
          <Animated.Text style={[styles.label, { backgroundColor: colors.surface }, animatedLabelStyle]}>
            {label}
          </Animated.Text>
          <TextInput
            {...props}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            editable={editable}
            placeholder={isFocused ? props.placeholder : ""}
            placeholderTextColor={colors.muted}
            cursorColor={colors.primary}
            selectionColor={`${colors.primary}40`}
            style={[styles.input, { color: editable ? colors.text : colors.muted }]}
          />
        </View>

        {rightIcon && (
          <Pressable
            hitSlop={12}
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
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.md,
    minHeight: 56,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  inputContainer: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16, // To give space for the floating label
    fontSize: 15,
    fontWeight: "500",
  },
  label: {
    position: "absolute",
    left: 12,
    paddingHorizontal: 4,
    fontWeight: "600",
    zIndex: 1,
  },
  iconLeft: {
    marginLeft: 16,
    marginRight: -4,
  },
  iconRight: {
    padding: 16,
  },
  helper: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 4,
  },
});
