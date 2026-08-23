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

export default function ResetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
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
                  router.replace("/(auth)/sign-in");
                }}
              >
                <Text style={[s.backText, { color: colors.muted }]}>← Sign In</Text>
              </TouchableOpacity>

              <View style={s.header}>
                <H1>Set New Password 🔐</H1>
                <Muted>Enter and confirm your new secure password below.</Muted>
              </View>

              <View style={s.form}>
                <Field
                  secureTextEntry
                  leftIcon="lock-outline"
                  placeholder="New password (min 8 characters)"
                  value={password}
                  onChangeText={setPassword}
                />
                <Field
                  secureTextEntry
                  leftIcon="lock-check-outline"
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

