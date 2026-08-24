import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { radius as defaultRadius, spacing, useTheme, type AppPalette } from "@/theme";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import { AppTextField } from "./ui/AppTextField";
import { PasswordField } from "./ui/PasswordField";
import { ScreenContainer } from "./ui/ScreenContainer";

export { AppTextField, PasswordField, ScreenContainer };

/** Memoize StyleSheet.create() so it only recalculates on theme change. */
function useStyles() {
  const { colors, radius } = useTheme();
  return useMemo(() => makeStyles(colors, radius), [colors, radius]);
}

export function triggerHaptic() {
  const hapticsEnabled = usePreferencesStore.getState().haptics;
  if (hapticsEnabled && Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
  onRefresh,
  refreshing = false,
  keyboardAvoiding = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  keyboardAvoiding?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [internalRefreshing, setInternalRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    triggerHaptic();
    setInternalRefreshing(true);
    try {
      await Promise.resolve(onRefresh());
    } finally {
      setInternalRefreshing(false);
    }
  };

  const isRefreshing = refreshing || internalRefreshing;
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;

  const body = (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary, colors.primary2]}
                progressBackgroundColor={colors.surface}
              />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 10) }}>
          {content}
        </View>
      )}
    </SafeAreaView>
  );

  if (keyboardAvoiding) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return body;
}

export function Card({
  children,
  style,
  tone = "default",
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "soft" | "primary" | "glass" | "glow" | "accent";
  onPress?: () => void;
}) {
  const styles = useStyles();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    if (onPress) scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    if (onPress) {
      triggerHaptic();
      onPress();
    }
  };

  const content = (
    <Animated.View
      style={[
        styles.card,
        tone === "soft" && styles.cardSoft,
        tone === "primary" && styles.cardPrimary,
        tone === "glow" && styles.cardGlow,
        tone === "glass" && styles.cardGlass,
        tone === "accent" && styles.cardAccent,
        style,
        onPress ? animatedStyle : undefined,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {content}
      </Pressable>
    );
  }

  return content;
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[styles.h1, largeText && { fontSize: 31 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[styles.h2, largeText && { fontSize: 20 }, style]}>{children}</Text>;
}
export function H3({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  return <Text style={[styles.h3, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const styles = useStyles();
  const largeText = usePreferencesStore((state) => state.largeText);
  return <Text style={[styles.muted, largeText && { fontSize: 15, lineHeight: 22 }, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const styles = useStyles();
  return <Text style={[styles.body, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export function Pill({
  children,
  tone = "default",
  onPress,
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger" | "primary" | "success" | "info" | "purple";
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const handlePress = () => {
    if (onPress) {
      triggerHaptic();
      onPress();
    }
  };

  const content = (
    <View
      style={[
        styles.pill,
        tone === "accent" && styles.pillAccent,
        tone === "warning" && styles.pillWarning,
        tone === "danger" && styles.pillDanger,
        tone === "primary" && styles.pillPrimary,
        tone === "success" && styles.pillSuccess,
        tone === "info" && styles.pillInfo,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "primary" && { color: colors.primary },
          tone === "accent" && { color: colors.accent },
          tone === "warning" && { color: colors.warning },
          tone === "danger" && { color: colors.danger },
          tone === "success" && { color: colors.success },
          tone === "info" && { color: colors.info },
        ]}
      >
        {children}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
        {content}
      </Pressable>
    );
  }

  return content;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  compact = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "social";
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : opacity.value,
  }));

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(0.8, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withTiming(1, { duration: 100 });
  };

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      triggerHaptic();
      onPress();
    }
  };

  // For Web Hover
  const handleHoverIn = () => {
    if (Platform.OS === 'web' && !disabled && !loading) opacity.value = withTiming(0.8, { duration: 150 });
  };
  const handleHoverOut = () => {
    if (Platform.OS === 'web') opacity.value = withTiming(1, { duration: 150 });
  };

  const getTextColor = () => {
    if (variant === "secondary" || variant === "ghost" || variant === "social") return colors.text;
    return colors.white;
  };

  const getIconColor = () => {
    if (variant === "secondary" || variant === "ghost" || variant === "social") return colors.text;
    return colors.white;
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={Platform.OS === 'web' ? handleHoverIn : undefined}
      onHoverOut={Platform.OS === 'web' ? handleHoverOut : undefined}
    >
      <Animated.View
        style={[
          styles.button,
          compact && styles.buttonCompact,
          variant === "secondary" && styles.secondary,
          variant === "ghost" && styles.ghost,
          variant === "danger" && styles.danger,
          variant === "social" && styles.social,
          variant === "accent" && { backgroundColor: colors.accent },
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={getIconColor()} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={20} color={getIconColor()} />
        ) : null}
        <Text style={[styles.buttonText, { color: getTextColor() }]}>{title}</Text>
      </Animated.View>
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
  const styles = useStyles();

  const handlePress = () => {
    triggerHaptic();
    if (onPress) onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={handlePress} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.72 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={23} color={colors.text} />
      {badge && badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text></View> : null}
    </Pressable>
  );
}

export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onRightIconPress?: () => void;
  clearable?: boolean;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  clearable,
  onClear,
  containerStyle,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  value,
  multiline,
  ...props
}: FieldProps) {
  const { colors, radius } = useTheme();
  const styles = useStyles();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [focusAnim] = useState(() => new Animated.Value(0));

  const handleFocus = (e: any) => {
    setIsFocused(true);
    triggerHaptic();
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
    if (onBlur) onBlur(e);
  };

  const isPassword = secureTextEntry !== undefined;
  const isActualSecure = isPassword ? (secureTextEntry && !isPasswordVisible) : false;

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : colors.border, error ? colors.danger : colors.primary],
  });

  const shadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.2],
  });

  return (
    <View style={[{ gap: 6, width: "100%" }, containerStyle]}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: "700", color: isFocused ? colors.primary : colors.textSecondary, marginLeft: 2 }}>
          {label}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.inputContainer,
          multiline && { minHeight: 90, alignItems: "flex-start" },
          {
            borderColor,
            shadowColor: error ? colors.danger : colors.primary,
            shadowOpacity,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: isFocused ? 3 : 0,
          },
        ]}
      >
        {leftIcon ? (
          <MaterialCommunityIcons
            name={leftIcon}
            size={20}
            color={isFocused ? colors.primary : colors.muted}
            style={{ marginLeft: 14, marginRight: 2, marginTop: multiline ? 12 : 0 }}
          />
        ) : null}

        <TextInput
          placeholderTextColor={colors.muted}
          cursorColor={colors.primary}
          selectionColor={`${colors.primary}40`}
          secureTextEntry={isActualSecure}
          value={value}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.inputInner, multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }, style]}
          {...props}
        />

        {clearable && value && value.length > 0 ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              triggerHaptic();
              if (onClear) onClear();
            }}
            style={{ padding: 8, marginRight: 4 }}
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        {isPassword ? (
          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
            onPress={() => {
              triggerHaptic();
              setIsPasswordVisible(!isPasswordVisible);
            }}
            style={{ padding: 10, marginRight: 6 }}
          >
            <MaterialCommunityIcons
              name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={isPasswordVisible ? colors.primary : colors.muted}
            />
          </Pressable>
        ) : rightIcon ? (
          <Pressable
            hitSlop={12}
            onPress={() => {
              triggerHaptic();
              if (onRightIconPress) onRightIconPress();
            }}
            style={{ padding: 10, marginRight: 6 }}
          >
            <MaterialCommunityIcons
              name={rightIcon}
              size={20}
              color={isFocused ? colors.primary : colors.muted}
            />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger, marginLeft: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading({ label = "Loading SkillBridge…" }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Muted>{label}</Muted>
    </View>
  );
}

export function Empty({
  title,
  detail,
  actionTitle,
  onAction,
  illustration,
}: {
  title: string;
  detail: string;
  actionTitle?: string;
  onAction?: () => void;
  illustration?: ImageSourcePropType;
}) {
  const { colors } = useTheme();
  return (
    <Card tone="soft" style={{ alignItems: "center", paddingVertical: 32, gap: 10 }}>
      {illustration ? (
        <Image
          source={illustration}
          style={{ width: 140, height: 140, marginBottom: 4 }}
          resizeMode="contain"
          accessible={false}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${colors.primary}18`, alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="tray" size={30} color={colors.primary} />
        </View>
      )}
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <Muted style={{ textAlign: "center", maxWidth: 280 }}>{detail}</Muted>
      {actionTitle ? <Button title={actionTitle} variant="secondary" onPress={onAction} compact /> : null}
    </Card>
  );
}

export function ErrorState({ title = "Something went wrong", detail, onRetry }: { title?: string; detail?: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card tone="soft" style={{ alignItems: "center", paddingVertical: 32, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${colors.danger}18`, alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="alert-circle-outline" size={32} color={colors.danger} />
      </View>
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      <Muted style={{ textAlign: "center", maxWidth: 280 }}>{detail ?? "We couldn't load this content."}</Muted>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} compact /> : null}
    </Card>
  );
}

export function Skeleton({ width = "100%", height = 16, radiusValue = 8, style }: { width?: number | `${number}%`; height?: number; radiusValue?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1,
      true
    );
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.6 : opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radiusValue,
          backgroundColor: colors.surface2,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <H2 style={{ flex: 1 }}>{title}</H2>
      {action ? (
        <Pressable
          onPress={() => {
            triggerHaptic();
            if (onAction) onAction();
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
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
  const handleToggle = (val: boolean) => {
    triggerHaptic();
    onValueChange(val);
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Body style={{ fontWeight: "800", color: colors.text }}>{title}</Body>
        {detail ? <Muted>{detail}</Muted> : null}
      </View>
      <Switch
        value={value}
        onValueChange={handleToggle}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.muted}
      />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }, style]}>{children}</View>;
}

const makeStyles = (colors: AppPalette, radius: typeof defaultRadius) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingBottom: 56 },
    content: {
      flex: 1,
      padding: spacing.md,
      gap: spacing.md,
      ...(Platform.OS === "web" ? { maxWidth: 1200, width: "100%", alignSelf: "center" as const } : {}),
    },
    card: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    cardSoft: { backgroundColor: colors.surface2, borderColor: colors.divider, shadowOpacity: 0, elevation: 0 },
    cardPrimary: { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}33`, shadowOpacity: 0, elevation: 0 },
    cardGlow: {
      backgroundColor: colors.surface,
      borderColor: `${colors.primary}55`,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 4,
    },
    cardGlass: {
      backgroundColor: `${colors.surface}E6`,
      borderColor: `${colors.white}22`,
      backdropFilter: "blur(16px)",
    } as any,
    cardAccent: {
      backgroundColor: `${colors.accent}14`,
      borderColor: `${colors.accent}44`,
    },
    h1: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.7, lineHeight: 34 },
    h2: { color: colors.text, fontSize: 18, fontWeight: "800", lineHeight: 24 },
    h3: { color: colors.text, fontSize: 16, fontWeight: "800" },
    body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
    muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
    pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface2 },
    pillAccent: { backgroundColor: `${colors.accent}1A` },
    pillWarning: { backgroundColor: `${colors.warning}1A` },
    pillDanger: { backgroundColor: `${colors.danger}1A` },
    pillPrimary: { backgroundColor: colors.primarySoft },
    pillSuccess: { backgroundColor: `${colors.success}1A` },
    pillInfo: { backgroundColor: `${colors.info}1A` },
    pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
    button: { minHeight: 48, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
    buttonCompact: { minHeight: 38, paddingHorizontal: 14 },
    secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: colors.danger },
    social: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    buttonText: { color: colors.white, fontWeight: "800", fontSize: 15 },
    input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 15, fontWeight: "500" },
    inputContainer: { minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", overflow: "hidden" },
    inputInner: { flex: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 15, fontWeight: "500" },
    center: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", gap: 12 },
    iconButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    badge: { position: "absolute", right: -4, top: -4, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
    badgeText: { color: colors.white, fontSize: 10, fontWeight: "900" },
  });
