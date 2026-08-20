import { useState, useEffect } from "react";
import { router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Button, Field, H1, Muted } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fadeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  async function submit() {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert(
        "Sign in failed",
        e instanceof Error ? e.message : "Try again",
      );
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
        <Animated.View style={[s.content, { opacity: fadeAnim }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <H1>Welcome back</H1>
            <Muted>
              Use your verified campus or personal email to access your account.
            </Muted>
          </View>

          <View style={s.form}>
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              secureTextEntry
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
            />
            <Button
              title={busy ? "Signing in..." : "Sign in"}
              disabled={busy || !email || !password}
              onPress={submit}
            />
            <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")} style={{ alignItems: "center", marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: "500" }}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
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
  backText: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  header: { gap: 10, marginBottom: 40 },
  form: { gap: 16 },
});
