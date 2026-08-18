import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius, spacing, useTheme, type AppPalette } from "@/theme";
import { usePreferencesStore } from "@/state/usePreferencesStore";

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
  tone = "default",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "soft" | "primary";
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.card,
        tone === "soft" && styles.cardSoft,
        tone === "primary" && styles.cardPrimary,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  const { colors } = useTheme();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[makeStyles(colors).h1, largeText && { fontSize: 31 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  const { colors } = useTheme();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[makeStyles(colors).h2, largeText && { fontSize: 20 }, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  const { colors } = useTheme();
  return <Text style={[makeStyles(colors).h3, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<any>; numberOfLines?: number }) {
  const { colors } = useTheme();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[makeStyles(colors).muted, largeText && { fontSize: 15, lineHeight: 22 }, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<any>; numberOfLines?: number }) {
  const { colors } = useTheme();
  return <Text style={[makeStyles(colors).body, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger" | "primary";
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.pill,
        tone === "accent" && styles.pillAccent,
        tone === "warning" && styles.pillWarning,
        tone === "danger" && styles.pillDanger,
        tone === "primary" && styles.pillPrimary,
      ]}
    >
      <Text style={[styles.pillText, tone === "primary" && { color: colors.primary }]}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  icon,
  compact = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        { opacity: disabled ? 0.45 : pressed ? 0.78 : 1 },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={variant === "secondary" || variant === "ghost" ? colors.text : colors.white} /> : null}
      <Text style={[styles.buttonText, (variant === "secondary" || variant === "ghost") && { color: colors.text }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  badge,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
  label: string;
  badge?: number;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.72 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={23} color={colors.text} />
      {badge && badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />;
}

export function Loading({ label = "Loading SkillBridge…" }: { label?: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Muted>{label}</Muted>
    </View>
  );
}

export function Empty({ title, detail, actionTitle, onAction }: { title: string; detail: string; actionTitle?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card tone="soft" style={{ alignItems: "center", paddingVertical: 28 }}>
      <MaterialCommunityIcons name="tray" size={32} color={colors.muted} />
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <Muted style={{ textAlign: "center" }}>{detail}</Muted>
      {actionTitle ? <Button title={actionTitle} variant="secondary" onPress={onAction} compact /> : null}
    </Card>
  );
}

export function ErrorState({ title = "Something went wrong", detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card tone="soft" style={{ alignItems: "center", paddingVertical: 28 }}>
      <MaterialCommunityIcons name="alert-circle-outline" size={34} color={colors.danger} />
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <Muted style={{ textAlign: "center" }}>{detail ?? "We couldn't load this content."}</Muted>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} compact /> : null}
    </Card>
  );
}

export function Skeleton({ width = "100%", height = 16, radiusValue = 8 }: { width?: number | `${number}%`; height?: number; radiusValue?: number }) {
  const { colors } = useTheme();
  return <View style={{ width, height, borderRadius: radiusValue, backgroundColor: colors.surface2 }} />;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <H2 style={{ flex: 1 }}>{title}</H2>
      {action ? <Pressable onPress={onAction}><Text style={{ color: colors.primary, fontWeight: "800" }}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function SettingSwitch({
  title,
  detail,
  value,
  onValueChange,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Body style={{ fontWeight: "800" }}>{title}</Body>
        {detail ? <Muted>{detail}</Muted> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={value ? colors.primary : colors.muted} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }, style]}>{children}</View>;
}

const makeStyles = (colors: AppPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 44 },
  content: { flex: 1, padding: spacing.md, gap: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSoft: { backgroundColor: colors.surface2, shadowOpacity: 0, elevation: 0 },
  cardPrimary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, shadowOpacity: 0, elevation: 0 },
  h1: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.7, lineHeight: 34 },
  h2: { color: colors.text, fontSize: 18, fontWeight: "800", lineHeight: 24 },
  h3: { color: colors.text, fontSize: 16, fontWeight: "800" },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  pillAccent: { backgroundColor: `${colors.accent}18` },
  pillWarning: { backgroundColor: `${colors.warning}18` },
  pillDanger: { backgroundColor: `${colors.danger}18` },
  pillPrimary: { backgroundColor: colors.primarySoft },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  button: { minHeight: 48, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  buttonCompact: { minHeight: 40, paddingHorizontal: 14 },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15 },
  center: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  badge: { position: "absolute", right: -4, top: -4, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "900" },
});

