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
import { colors, spacing } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert("Success", "Password updated successfully");
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient colors={["#0C192A", "#07111F"]} style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.content}>
          <View style={s.header}>
            <H1>Update Password</H1>
            <Muted>Enter your new password below.</Muted>
          </View>

          <View style={s.form}>
            <Field
              secureTextEntry
              placeholder="New Password"
              value={password}
              onChangeText={setPassword}
            />
            <Button
              title={busy ? "Updating..." : "Update Password"}
              disabled={busy || !password || password.length < 6}
              onPress={submit}
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
  header: { gap: 10, marginBottom: 40 },
  form: { gap: 16 },
});
