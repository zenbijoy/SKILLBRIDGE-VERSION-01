import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/theme";

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const content = <View style={s.content}>{children}</View>;
  return (
    <SafeAreaView style={s.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function H1({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<any>; numberOfLines?: number }) {
  return <Text style={[s.muted, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger";
}) {
  return (
    <View
      style={[
        s.pill,
        tone === "accent" && s.pillAccent,
        tone === "warning" && s.pillWarning,
        tone === "danger" && s.pillDanger,
      ]}
    >
      <Text style={s.pillText}>{children}</Text>
    </View>
  );
}
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "secondary" && s.secondary,
        variant === "ghost" && s.ghost,
        variant === "danger" && s.danger,
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[s.input, props.style]}
    />
  );
}
export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" />
      <Muted>Loading SkillBridge…</Muted>
    </View>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <H2>{title}</H2>
      <Muted>{detail}</Muted>
    </Card>
  );
}
export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 48 },
  content: { flex: 1, padding: spacing.md, gap: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#0C192AF0',
    borderWidth: 1,
    borderColor: '#1D3550AA',
    gap: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  h1: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  h2: { color: colors.text, fontSize: 18, fontWeight: "800" },
  muted: { color: colors.muted, lineHeight: 20 },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  pillAccent: { backgroundColor: "#123C37" },
  pillWarning: { backgroundColor: "#44351C" },
  pillDanger: { backgroundColor: "#431F2D" },
  pillText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  ghost: { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 },
  danger: { backgroundColor: colors.danger, shadowColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#1D355099',
    backgroundColor: '#0C192A99',
    color: colors.text,
    paddingHorizontal: 14,
  },
  center: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
});
