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
import { AppTextField, ScreenContainer } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { getResetPasswordRedirect } from "@/features/auth/redirects";

export default function ForgotPassword() {
  const { colors } = useTheme();
  
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    try {
      triggerHaptic();
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getResetPasswordRedirect(),
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again");
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
            <H1>Reset Password</H1>
            <Muted>
              {sent
                ? "Check your email for the password reset link."
                : "Enter your email address to receive a password reset link."}
            </Muted>
          </View>

          {!sent ? (
            <Animated.View entering={SlideInDown.duration(500).delay(100)} style={s.form}>
              <AppTextField
                label="Email address"
                autoCapitalize="none"
                keyboardType="email-address"
                leftIcon="email-outline"
                value={email}
                onChangeText={setEmail}
              />
              <View style={s.spacer} />
              <Button
                title={busy ? "Sending..." : "Send Reset Link"}
                disabled={busy || !email}
                loading={busy}
                onPress={submit}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(400)} style={s.form}>
              <Button
                title="Back to Sign In"
                variant="primary"
                onPress={() => router.replace("/(auth)/sign-in")}
              />
            </Animated.View>
          )}
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
});
