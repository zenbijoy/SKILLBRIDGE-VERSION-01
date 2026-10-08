import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";
import { getEmailConfirmationUrl } from "@/features/auth/redirects";
import { classifyAuthError, logAuthFailure } from "@/features/auth/authErrors";
import { signInWithGoogle } from "@/features/auth/googleOAuth";
import { useI18n } from "@/i18n";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

export default function SignUp() {
  const { colors, isDark } = useTheme();
  const { language } = useI18n();
  const isBn = language === "bn";

  // ---------------------------------------------------------------------------
  // Responsive hero sizing: the banner and bridge artwork scale with the device
  // screen (portrait) instead of using fixed pixel sizes. Bounds keep the hero
  // from becoming too tall on small phones or too large on tablets.
  // ---------------------------------------------------------------------------
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(Math.min(Math.max(windowHeight * 0.24, 180), 300));
  const heroContentWidth = Math.min(windowWidth, 520); // matches scrollContent maxWidth
  const bridgeImageWidth = Math.round(Math.min(heroContentWidth * 0.62, 300));
  const bridgeImageHeight = Math.round(bridgeImageWidth / 2); // source artwork is 2:1

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------------------------------
  // Keyboard-aware form scrolling
  // The Android window uses `adjustResize`, but there is a race between the
  // field gaining focus and the keyboard appearing, so the focused field can
  // still end up hidden behind the keyboard. We track each field's position in
  // the scroll content and explicitly bring the focused field into view when
  // focus changes or the keyboard opens.
  // ---------------------------------------------------------------------------
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  const focusedFieldRef = useRef<string | null>(null);
  const cardY = useRef(0);
  const formY = useRef(0);
  const fieldY = useRef<Record<string, number>>({});

  function scrollFieldIntoView(key: string) {
    const target = cardY.current + formY.current + (fieldY.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, target - 96), animated: true });
  }

  function handleFieldFocus(key: string) {
    focusedFieldRef.current = key;
    if (keyboardHeight > 0) {
      scrollFieldIntoView(key);
    }
  }

  useEffect(() => {
    if (keyboardHeight > 0 && focusedFieldRef.current) {
      scrollFieldIntoView(focusedFieldRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardHeight]);

  function showExistingEmailAlert(targetEmail: string) {
    Alert.alert(
      isBn ? "অ্যাকাউন্ট আগে থেকেই আছে" : "Account Already Exists",
      isBn
        ? `"${targetEmail}" দিয়ে একটি অ্যাকাউন্ট ইতোমধ্যে তৈরি করা আছে। আপনি কি সাইন ইন করতে চান?`
        : `An account with "${targetEmail}" is already registered. Would you like to sign in instead?`,
      [
        {
          text: isBn ? "অন্য ইমেইল দিন" : "Use Different Email",
          style: "cancel",
          onPress: () => setEmail(""),
        },
        {
          text: isBn ? "পাসওয়ার্ড রিসেট" : "Forgot Password?",
          onPress: () => {
            router.push(`/(auth)/forgot-password?email=${encodeURIComponent(targetEmail)}` as any);
          },
        },
        {
          text: isBn ? "সাইন ইন করুন" : "Sign In",
          onPress: () => {
            router.replace(`/(auth)/sign-in?email=${encodeURIComponent(targetEmail)}` as any);
          },
        },
      ]
    );
  }

  async function submit() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      Alert.alert(
        isBn ? "তথ্য অসম্পূর্ণ" : "Incomplete Information",
        isBn
          ? "দয়া করে আপনার পুরো নাম, ইমেইল এবং অন্তত ৮ অক্ষরের পাসওয়ার্ড দিন।"
          : "Please enter your full name, email, and at least 8 character password."
      );
      return;
    }

    try {
      triggerHaptic();
      setBusy(true);

      const targetEmail = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: targetEmail,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: getEmailConfirmationUrl("/auth/callback"),
        },
      });
      if (error) throw error;

      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        showExistingEmailAlert(targetEmail);
        return;
      }

      Alert.alert(
        isBn ? "ইমেইল চেক করুন" : "Check your email",
        isBn
          ? "আপনার ইমেইলে একটি ভেরিফিকেশন লিঙ্ক পাঠানো হয়েছে। ভেরিফাই করে সাইন ইন করুন।"
          : "We sent a verification link to your email. Please verify your account before signing in.",
        [{ text: "OK", onPress: () => router.replace(`/(auth)/sign-in?email=${encodeURIComponent(targetEmail)}` as any) }]
      );
    } catch (e) {
      logAuthFailure("auth_signup_failed", { error: e });
      const classified = classifyAuthError(e);
      if (classified.category === "AUTH_EMAIL_ALREADY_REGISTERED") {
        showExistingEmailAlert(email.trim());
        return;
      }
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignUp() {
    if (busy) return;
    try {
      triggerHaptic();
      setBusy(true);
      const result = await signInWithGoogle();
      if (result.cancelled) {
        return;
      }
      if (!result.success && result.error) {
        Alert.alert(result.error.title, result.error.message);
      }
    } catch (e) {
      const classified = classifyAuthError(e);
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scrollContent, { paddingBottom: keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* TOP HERO BANNER: Features user's authentic bridge illustration */}
        <View
          style={[
            s.heroBannerContainer,
            { height: heroHeight, backgroundColor: isDark ? "#0A0F1D" : "#F1F5F9" },
          ]}
        >
          <LinearGradient
            colors={isDark ? ["#0F172A", "#0B0F19"] : ["#F8FAFC", "#EEF2F6"]}
            style={StyleSheet.absoluteFill}
          />

          <View style={s.topNavRow}>
            <TouchableOpacity
              style={[s.navCircleBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.9)" }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => {
                triggerHaptic();
                router.back();
              }}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>

            <View style={[s.securityBadgeTop, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.2)" : "#ECFDF5" }]}>
              <View style={s.greenDot} />
              <Text style={s.securityBadgeText}>
                {isBn ? "ক্যাম্পাস পাসপোর্ট" : "Campus Passport"}
              </Text>
            </View>
          </View>

          <Animated.View entering={FadeIn.duration(600)} style={s.bridgeImageWrap}>
            <Image
              source={require("@/../assets/branding/skillbridge-bridge-logo.png")}
              style={{ width: bridgeImageWidth, height: bridgeImageHeight }}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* OVERLAPPING REGISTRATION SHEET */}
        <Animated.View
          entering={SlideInDown.duration(450)}
          onLayout={(e) => {
            cardY.current = e.nativeEvent.layout.y;
          }}
          style={[
            s.cardSheet,
            {
              backgroundColor: isDark ? "#111827" : "#FFFFFF",
              borderColor: isDark ? "#1F2937" : "#F1F5F9",
            },
          ]}
        >
          <Text style={[s.sheetTitle, { color: colors.text }]}>
            {isBn ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "Create your identity"}
          </Text>

          <View
            style={[
              s.encryptionPill,
              {
                backgroundColor: isDark ? "rgba(16, 185, 129, 0.12)" : "#ECFDF5",
                borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0",
              },
            ]}
          >
            <View style={s.pulsingGreenDot} />
            <Text style={s.encryptionPillText}>
              {isBn ? "এন্ড-টু-এন্ড এনক্রিপ্টেড ও সুরক্ষিত" : "End-to-End Encrypted & Secure"}
            </Text>
          </View>

          <View
            style={s.formContainer}
            onLayout={(e) => {
              formY.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Full Name */}
            <View
              onLayout={(e) => {
                fieldY.current.name = e.nativeEvent.layout.y;
              }}
              style={[
                s.inputWrapper,
                {
                  backgroundColor: isDark ? "#1F2937" : "#F8FAFC",
                  borderColor: isDark ? "#374151" : "#E2E8F0",
                },
              ]}
            >
              <View style={[s.iconBox, { backgroundColor: isDark ? "#374151" : "#FEF3C7" }]}>
                <Ionicons name="person-outline" size={18} color="#D97706" />
              </View>
              <TextInput
                style={[s.inputField, { color: colors.text }]}
                placeholder={isBn ? "আপনার পুরো নাম" : "Full name"}
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                onFocus={() => handleFieldFocus("name")}
              />
            </View>

            {/* Email Address */}
            <View
              onLayout={(e) => {
                fieldY.current.email = e.nativeEvent.layout.y;
              }}
              style={[
                s.inputWrapper,
                {
                  backgroundColor: isDark ? "#1F2937" : "#F8FAFC",
                  borderColor: isDark ? "#374151" : "#E2E8F0",
                },
              ]}
            >
              <View style={[s.iconBox, { backgroundColor: isDark ? "#374151" : "#FEF3C7" }]}>
                <Ionicons name="mail-outline" size={18} color="#D97706" />
              </View>
              <TextInput
                style={[s.inputField, { color: colors.text }]}
                placeholder={isBn ? "ইমেইল ঠিকানা" : "Email address"}
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onFocus={() => handleFieldFocus("email")}
              />
            </View>

            {/* Password */}
            <View
              onLayout={(e) => {
                fieldY.current.password = e.nativeEvent.layout.y;
              }}
              style={[
                s.inputWrapper,
                {
                  backgroundColor: isDark ? "#1F2937" : "#F8FAFC",
                  borderColor: isDark ? "#374151" : "#E2E8F0",
                },
              ]}
            >
              <View style={[s.iconBox, { backgroundColor: isDark ? "#374151" : "#FEF3C7" }]}>
                <Ionicons name="lock-closed-outline" size={18} color="#D97706" />
              </View>
              <TextInput
                style={[s.inputField, { color: colors.text }]}
                placeholder={isBn ? "পাসওয়ার্ড (অন্তত ৮ অক্ষর)" : "Password (min 8 chars)"}
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                onFocus={() => handleFieldFocus("password")}
              />
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setShowPassword(!showPassword);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={s.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={submit}
              disabled={busy}
              activeOpacity={0.88}
              style={[s.submitBtnWrap, busy && { opacity: 0.7 }]}
            >
              <LinearGradient
                colors={["#D97706", "#EA580C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.submitGradient}
              >
                <Text style={s.submitBtnText}>
                  {busy
                    ? isBn
                      ? "অ্যাকাউন্ট তৈরি হচ্ছে..."
                      : "Creating account..."
                    : isBn
                      ? "নিবন্ধন সম্পন্ন করুন  →"
                      : "Create Account  →"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.dividerRow}>
              <View style={[s.dividerLine, { backgroundColor: isDark ? "#374151" : "#E2E8F0" }]} />
              <Text style={[s.dividerText, { color: colors.muted }]}>
                {isBn ? "অথবা অন্য উপায়ে সাইন আপ করুন" : "or sign up with"}
              </Text>
              <View style={[s.dividerLine, { backgroundColor: isDark ? "#374151" : "#E2E8F0" }]} />
            </View>

            {/* Google Social Button */}
            <TouchableOpacity
              onPress={handleGoogleSignUp}
              activeOpacity={0.85}
              style={[
                s.socialBtn,
                {
                  backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                  borderColor: isDark ? "#374151" : "#E2E8F0",
                },
              ]}
            >
              <Image
                source={require("@/../assets/branding/google-logo.png")}
                style={s.googleLogo}
                resizeMode="contain"
              />
              <Text style={[s.socialBtnText, { color: colors.text }]}>
                {isBn ? "Google দিয়ে সাইন আপ করুন" : "Sign up with Google"}
              </Text>
            </TouchableOpacity>

            {/* Already have an account? Sign In */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.replace("/(auth)/sign-in");
              }}
              style={s.registerLink}
            >
              <Text style={[s.registerNormalText, { color: colors.muted }]}>
                {isBn ? "আগে থেকেই অ্যাকাউন্ট আছে? " : "Already have an account? "}
                <Text style={s.registerHighlightText}>
                  {isBn ? "সাইন ইন করুন >" : "Sign in >"}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  heroBannerContainer: {
    width: "100%",
    paddingTop: 12,
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  navCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  securityBadgeTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10B981",
  },
  securityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  bridgeImageWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  cardSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  encryptionPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    marginBottom: 20,
  },
  pulsingGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10B981",
  },
  encryptionPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  formContainer: {
    gap: 14,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 10,
  },
  googleLogo: {
    width: 20,
    height: 20,
  },
  eyeBtn: {
    padding: 8,
  },
  submitBtnWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  submitGradient: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "600",
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  registerLink: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 6,
  },
  registerNormalText: {
    fontSize: 13,
    fontWeight: "600",
  },
  registerHighlightText: {
    color: "#D97706",
    fontWeight: "800",
  },
});

export { ErrorBoundary } from "./_layout";
