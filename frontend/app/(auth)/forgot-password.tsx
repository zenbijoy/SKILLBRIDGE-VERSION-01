import { useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, H1, Muted, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function ForgotPassword() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    try {
      triggerHaptic();
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "skillbridge://reset-password",
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
    <LinearGradient colors={isDark ? ["#0C192A", "#07111F"] : ["#F8FAFC", "#EEF4FF"]} style={s.container}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <ScrollView
            contentContainerStyle={[s.scrollContent, { paddingTop: Math.max(insets.top, 16) }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.content}>
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
                <View style={s.form}>
                  <Field
                    autoCapitalize="none"
                    keyboardType="email-address"
                    leftIcon="email-outline"
                    placeholder="Email address"
                    clearable
                    onClear={() => setEmail("")}
                    value={email}
                    onChangeText={setEmail}
                  />
                  <Button
                    title={busy ? "Sending..." : "Send Reset Link"}
                    disabled={busy || !email}
                    loading={busy}
                    onPress={submit}
                  />
                </View>
              ) : (
                <View style={{ gap: 16, marginTop: 8 }}>
                  <Button
                    title="Back to Sign In"
                    variant="primary"
                    onPress={() => router.replace("/(auth)/sign-in")}
                  />
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: 32,
  },
  content: { width: "100%" },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  backText: { fontSize: 15, fontWeight: "700" },
  header: { gap: 8, marginBottom: 32 },
  form: { gap: 16 },
});

