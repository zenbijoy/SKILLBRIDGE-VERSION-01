import { useState } from "react";
import { View, StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { AppTextField, AppTextFieldProps } from "./AppTextField";
import { useTheme } from "@/theme";

interface PasswordFieldProps extends Omit<AppTextFieldProps, "rightIcon" | "onRightIconPress" | "secureTextEntry"> {
  showRequirements?: boolean;
}

export function PasswordField({ showRequirements, value = "", ...props }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { colors } = useTheme();

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const hasLength = value.length >= 8;
  const hasUpperLower = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);

  const reqs = [
    { label: "8+ characters", met: hasLength },
    { label: "uppercase & lowercase", met: hasUpperLower },
    { label: "number", met: hasNumber },
  ];

  return (
    <View style={styles.container}>
      <AppTextField
        {...props}
        value={value}
        secureTextEntry={!isVisible}
        rightIcon={isVisible ? "eye-off-outline" : "eye-outline"}
        onRightIconPress={toggleVisibility}
      />
      {showRequirements && value.length > 0 && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.requirementsContainer}>
          {reqs.map((req, idx) => (
            <Text
              key={idx}
              style={[
                styles.requirementText,
                { color: req.met ? colors.success : colors.muted }
              ]}
            >
              {req.met ? "✓" : "○"} {req.label}
            </Text>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  requirementsContainer: {
    marginTop: -8, // pull up slightly closer to the input
    marginBottom: 16,
    paddingHorizontal: 4,
    gap: 4,
  },
  requirementText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
