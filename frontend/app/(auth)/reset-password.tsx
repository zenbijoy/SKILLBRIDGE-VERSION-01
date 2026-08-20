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
import { Button, Field, H1, Muted, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function ResetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleResetPassword() {
    if (password.length < 8) {
      Alert.alert("Password too short", "Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }

    try {
      setBusy(true);
      triggerHaptic();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      Alert.alert(
        "Password Updated 🎉",
        "Your password has been reset successfully. Please sign in with your new password.",
        [{ text: "Sign In", onPress: () => router.replace("/(auth)/sign-in") }]
      );
    } catch (e: any) {
      Alert.alert("Reset Failed", e?.message || "Failed to update password. Please request a new link.");
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
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace("/(auth)/sign-in")}>
            <Text style={[s.backText, { color: colors.muted }]}>← Sign In</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <H1>Set New Password 🔐</H1>
            <Muted>Enter and confirm your new secure password below.</Muted>
          </View>

          <View style={s.form}>
            <Field
              secureTextEntry
              placeholder="New password (min 8 characters)"
              value={password}
              onChangeText={setPassword}
            />
            <Field
              secureTextEntry
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <Button
              title={busy ? "Updating..." : "Update Password"}
              disabled={busy || !password || !confirmPassword}
              loading={busy}
              onPress={handleResetPassword}
            />
          </View>
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
