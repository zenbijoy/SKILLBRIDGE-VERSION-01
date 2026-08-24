import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

interface ScreenContainerProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  keyboardAvoiding?: boolean;
}

export function ScreenContainer({
  children,
  style,
  edges = ["top", "bottom", "left", "right"],
  keyboardAvoiding = true,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  
  const content = (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );

  if (keyboardAvoiding) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
}
