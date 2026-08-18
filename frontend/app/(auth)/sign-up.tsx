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
  ScrollView,
} from "react-native";
import { Button, Field, H1, Muted } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function SignUp() {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState("");
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
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) throw error;
      Alert.alert("Check your email", "Verify your email, then sign in.", [
        { text: "OK", onPress: () => router.replace("/(auth)/sign-in") },
      ]);
    } catch (e) {
      Alert.alert(
        "Sign up failed",
        e instanceof Error ? e.message : "Try again",
      );
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
        <Animated.View style={[s.content, { opacity: fadeAnim }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={[s.backText, { color: colors.muted }]}>← Back</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.header}>
              <H1>Create your identity</H1>
              <Muted>
                Your real authenticated identity is used for ownership, privacy,
                and reputation.
              </Muted>
            </View>

            <View style={s.form}>
              <Field
                placeholder="Full name"
                value={name}
                onChangeText={setName}
              />
              <Field
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
              />
              <Field
                secureTextEntry
                placeholder="Password (8+ characters)"
                value={password}
                onChangeText={setPassword}
              />
              <Button
                title={busy ? "Creating..." : "Create account"}
                disabled={busy || password.length < 8 || !name || !email}
                onPress={submit}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollContent: {
    padding: spacing.xl,
    justifyContent: "center",
    minHeight: "100%",
  },
  backBtn: {
    position: "absolute",
    top: 60,
    left: spacing.xl,
    padding: 10,
    zIndex: 10,
  },
  backText: { fontSize: 16, fontWeight: "600" },
  header: { gap: 10, marginBottom: 40, marginTop: 100 },
  form: { gap: 16 },
});
