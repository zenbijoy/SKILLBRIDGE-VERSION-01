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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, H1, Muted, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

export default function SignIn() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fadeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  async function submit() {
    try {
      triggerHaptic();
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
            <Animated.View style={[s.content, { opacity: fadeAnim }]}>
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
                <H1>Welcome back</H1>
                <Muted>
                  Use your verified campus or personal email to access your account.
                </Muted>
              </View>

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
                <Field
                  secureTextEntry
                  leftIcon="lock-outline"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                />
                <Button
                  title={busy ? "Signing in..." : "Sign in"}
                  disabled={busy || !email || !password}
                  loading={busy}
                  onPress={submit}
                />

                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    router.push("/(auth)/forgot-password");
                  }}
                  style={{ alignItems: "center", marginTop: 8, padding: 8 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
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
  form: { gap: 16 },
});

