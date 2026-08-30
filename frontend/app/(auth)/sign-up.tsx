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
import { getAuthCallbackUrl } from "@/features/auth/redirects";
import { classifyAuthError, logAuthFailure } from "@/features/auth/authErrors";
import { signInWithGoogle } from "@/features/auth/googleOAuth";

export default function SignUp() {
  const { colors } = useTheme();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      triggerHaptic();
      setBusy(true);
      
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: getAuthCallbackUrl("/auth/callback"),
        },
      });
      if (error) throw error;
      
      Alert.alert(
        "Check your email",
        "We sent a verification link to your email. Please verify your account before signing in.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/sign-in") }]
      );
    } catch (e) {
      logAuthFailure("auth_signup_failed", { error: e });
      const classified = classifyAuthError(e);
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    if (busy) return;
    try {
      triggerHaptic();
      setBusy(true);
      if (provider === "google") {
        const result = await signInWithGoogle();
        if (result.cancelled) {
          // User intentionally cancelled or dismissed the browser session
          return;
        }
        if (!result.success && result.error) {
          Alert.alert(result.error.title, result.error.message);
        }
        return;
      }

      // Fallback for other OAuth providers
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthCallbackUrl("/auth/callback"),
        },
      });
      if (error) throw error;
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
            <H1>Create your identity</H1>
            <Muted>
              Your real authenticated identity is used for ownership, privacy,
              and reputation.
            </Muted>
          </View>

          <Animated.View entering={SlideInDown.duration(500).delay(100)} style={s.form}>
            <AppTextField
              label="Full name"
              leftIcon="account-outline"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
            />
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
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              showRequirements
            />
            
            <View style={s.spacer} />
            <Button
              title={busy ? "Creating account..." : "Create account"}
              disabled={busy || password.length < 8 || !name || !email}
              loading={busy}
              onPress={submit}
            />

            <View style={s.dividerContainer}>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[s.dividerText, { color: colors.muted, backgroundColor: colors.bg }]}>or sign up with</Text>
            </View>

            <View style={s.socialRow}>
              <View style={{ flex: 1 }}>
                <Button variant="social" icon="google" title="Google" onPress={() => handleSocial("google")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="social" icon="facebook" title="Facebook" onPress={() => handleSocial("facebook")} />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.replace("/(auth)/sign-in");
              }}
              style={s.footerLink}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Already have an account? <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text>
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
