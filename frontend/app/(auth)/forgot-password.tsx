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
} from "react-native";
import { Button, Field, H1, Muted } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function ForgotPassword() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    try {
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.content}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
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

          {!sent && (
            <View style={s.form}>
              <Field
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
              />
              <Button
                title={busy ? "Sending..." : "Send Reset Link"}
                disabled={busy || !email}
                onPress={submit}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: spacing.xl, justifyContent: "center" },
  backBtn: {
    position: "absolute",
    top: 60,
    left: spacing.xl,
    padding: 10,
    zIndex: 10,
  },
  backText: { fontSize: 16, fontWeight: "600" },
  header: { gap: 10, marginBottom: 40 },
  form: { gap: 16 },
});
