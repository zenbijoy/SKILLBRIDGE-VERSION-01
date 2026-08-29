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
import { PasswordField, ScreenContainer } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  
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
              router.replace("/(auth)/sign-in");
            }}
          >
            <Text style={[s.backText, { color: colors.muted }]}>← Sign In</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <H1>Set New Password 🔐</H1>
            <Muted>Enter and confirm your new secure password below.</Muted>
          </View>

          <Animated.View entering={SlideInDown.duration(500).delay(100)} style={s.form}>
            <PasswordField
              label="New password"
              leftIcon="lock-outline"
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              showRequirements
            />
            <PasswordField
              label="Confirm password"
              leftIcon="lock-check-outline"
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <View style={s.spacer} />
            <Button
              title={busy ? "Updating..." : "Update Password"}
              disabled={busy || !password || !confirmPassword}
              loading={busy}
              onPress={handleResetPassword}
            />
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
});
