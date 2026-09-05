import { useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { Button, H1, Muted, triggerHaptic } from "@/components/ui";
import { AppTextField, PasswordField, ScreenContainer } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { classifyAuthError, logAuthFailure } from "@/features/auth/authErrors";
import { signInWithGoogle } from "@/features/auth/googleOAuth";
import { useLocalSearchParams } from "expo-router";

export default function SignIn() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  
  const [email, setEmail] = useState(params?.email ? decodeURIComponent(params.email) : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);


  async function submit() {
    try {
      triggerHaptic();
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw error;
      }
      router.replace("/(tabs)");
    } catch (e) {
      logAuthFailure("auth_signin_failed", { error: e });
      const classified = classifyAuthError(e);
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (busy) return;
    try {
      triggerHaptic();
      setBusy(true);
      const result = await signInWithGoogle();
      if (result.cancelled) {
        // User intentionally cancelled or dismissed the browser session
        return;
      }
      if (!result.success && result.error) {
        Alert.alert(result.error.title, result.error.message);
      }
    } catch (e) {
      const classified = classifyAuthError(e);
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={s.content}>
          <TouchableOpacity
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => {
              triggerHaptic();
              router.back();
            }}
          >
            <Text style={[s.backText, { color: colors.muted }]}>← Back</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <H1>Welcome back</H1>
            <Muted>
              Use your verified campus or personal email to access your account.
            </Muted>
          </View>

          <Animated.View entering={SlideInDown.duration(500).delay(100)} style={s.form}>
            <AppTextField
              label="Email address"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              leftIcon="email-outline"
              value={email}
              onChangeText={setEmail}
            />
            <PasswordField
              label="Password"
              leftIcon="lock-outline"
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
            />
            
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.push("/(auth)/forgot-password");
              }}
              style={s.forgotPassword}
            >
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={s.spacer} />
            <Button
              title={busy ? "Signing in..." : "Sign in"}
              disabled={busy || !email || !password}
              loading={busy}
              onPress={submit}
            />

            <View style={s.dividerContainer}>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[s.dividerText, { color: colors.muted, backgroundColor: colors.bg }]}>or continue with</Text>
            </View>

            <View style={s.socialRow}>
              <Button
                variant="social"
                icon="google"
                title="Continue with Google"
                onPress={handleGoogleSignIn}
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.replace("/(auth)/sign-up");
              }}
              style={s.footerLink}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Don't have an account? <Text style={{ color: colors.primary, fontWeight: "600" }}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 32,
    paddingTop: 16,
  },
  content: {
    width: "100%",
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  backText: { fontSize: 15, fontWeight: "700" },
  header: { gap: 8, marginBottom: 32 },
  form: { gap: 0 },
  forgotPassword: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingLeft: 16,
    marginBottom: 16,
    marginTop: -8,
  },
  spacer: { height: 16 },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
  },
  dividerLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: "500",
  },
  socialRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  footerLink: {
    alignItems: "center",
    padding: 8,
  }
});

export { ErrorBoundary } from "./_layout";
