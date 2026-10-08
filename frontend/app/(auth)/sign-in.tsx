import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, SlideInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenContainer, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { spacing, useTheme } from "@/theme";
import { classifyAuthError, logAuthFailure } from "@/features/auth/authErrors";
import { signInWithGoogle } from "@/features/auth/googleOAuth";
import { useI18n } from "@/i18n";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

export default function SignIn() {
  const { colors, isDark } = useTheme();
  const { language } = useI18n();
  const isBn = language === "bn";
  const params = useLocalSearchParams<{ email?: string }>();

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

  const [email, setEmail] = useState(params?.email ? decodeURIComponent(params.email) : "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert(
        isBn ? "প্রয়োজনীয় তথ্য দিন" : "Required Information",
        isBn ? "অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড প্রদান করুন।" : "Please enter your email and password."
      );
      return;
    }

    try {
      triggerHaptic();
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw error;
      }
      router.replace("/(tabs)");
    } catch (e) {
      logAuthFailure("auth_signin_failed", { error: e });
      const classified = classifyAuthError(e);
      Alert.alert(classified.title, classified.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
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

  function handleFacebookSignIn() {
    triggerHaptic();
    Alert.alert(
      isBn ? "ফেসবুক লগইন" : "Facebook Sign In",
      isBn
        ? "ক্যাম্পাস শিক্ষার্থীদের সুরক্ষার্থে গুগল অথবা অফিসিয়াল ইমেইল সাইন ইন ব্যবহার করুন।"
        : "For university security, please use Google or campus email sign in."
    );
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
        {/* TOP HERO BANNER: Features the user's authentic bridge illustration */}
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

          {/* Top navigation row */}
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
                {isBn ? "এন্ড-টু-এন্ড এনক্রিপ্টেড" : "End-to-End Encrypted"}
              </Text>
            </View>
          </View>

          {/* User's Exact Bridge Image ("Bridging Success") */}
          <Animated.View entering={FadeIn.duration(600)} style={s.bridgeImageWrap}>
            <Image
              source={require("@/../assets/branding/skillbridge-bridge-logo.png")}
              style={{ width: bridgeImageWidth, height: bridgeImageHeight }}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* OVERLAPPING AUTH SHEET CARD */}
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
          {/* Sheet Header Title */}
          <Text style={[s.sheetTitle, { color: colors.text }]}>
            {isBn ? "আপনার অ্যাকাউন্টে সাইন ইন করুন" : "Sign in to your account"}
          </Text>

          {/* End-to-End Secure Pill Badge */}
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

          {/* FORM INPUTS */}
          <View
            style={s.formContainer}
            onLayout={(e) => {
              formY.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Email Field with Amber Icon Box */}
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

            {/* Password Field with Amber Icon Box & Toggle Eye */}
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
                placeholder={isBn ? "পাসওয়ার্ড" : "Password"}
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
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

            {/* Remember Me & Forgot Password Row */}
            <View style={s.optionsRow}>
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  setRememberMe(!rememberMe);
                }}
                style={s.rememberMeBox}
              >
                <Ionicons
                  name={rememberMe ? "checkbox" : "square-outline"}
                  size={19}
                  color={rememberMe ? "#D97706" : colors.muted}
                />
                <Text style={[s.rememberText, { color: colors.muted }]}>
                  {isBn ? "আমাকে মনে রাখুন" : "Remember me"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  triggerHaptic();
                  router.push(`/(auth)/forgot-password?email=${encodeURIComponent(email)}` as any);
                }}
              >
                <Text style={s.forgotPassText}>
                  {isBn ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot password?"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Primary Sign In Button with Amber/Orange Gradient */}
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
                      ? "যাচাই করা হচ্ছে..."
                      : "Signing in..."
                    : isBn
                      ? "সাইন ইন করুন  →"
                      : "Sign In  →"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider: Or Continue With */}
            <View style={s.dividerRow}>
              <View style={[s.dividerLine, { backgroundColor: isDark ? "#374151" : "#E2E8F0" }]} />
              <Text style={[s.dividerText, { color: colors.muted }]}>
                {isBn ? "অথবা অন্য উপায়ে চালিয়ে যান" : "or continue with"}
              </Text>
              <View style={[s.dividerLine, { backgroundColor: isDark ? "#374151" : "#E2E8F0" }]} />
            </View>

            {/* Social Logins: Google & Facebook */}
            <View style={s.socialStack}>
              {/* Google Button */}
              <TouchableOpacity
                onPress={handleGoogleSignIn}
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
                  {isBn ? "Google দিয়ে সাইন ইন করুন" : "Sign in with Google"}
                </Text>
              </TouchableOpacity>

              {/* Facebook Button */}
              <TouchableOpacity
                onPress={handleFacebookSignIn}
                activeOpacity={0.85}
                style={[
                  s.socialBtn,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                    borderColor: isDark ? "#374151" : "#E2E8F0",
                  },
                ]}
              >
                <MaterialCommunityIcons name="facebook" size={20} color="#1877F2" />
                <Text style={[s.socialBtnText, { color: colors.text }]}>
                  {isBn ? "Facebook দিয়ে সাইন ইন করুন" : "Sign in with Facebook"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Privacy Policy & Terms Link */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.push("/settings/privacy" as any);
              }}
              style={s.privacyRow}
            >
              <Ionicons name="shield-checkmark-outline" size={15} color="#D97706" />
              <Text style={s.privacyText}>
                {isBn ? "গোপনীয়তা নীতি ও শর্তাবলী পড়ুন" : "Privacy Policy & Terms"}
              </Text>
            </TouchableOpacity>

            {/* Don't have an account? Sign up */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic();
                router.replace("/(auth)/sign-up");
              }}
              style={s.registerLink}
            >
              <Text style={[s.registerNormalText, { color: colors.muted }]}>
                {isBn ? "অ্যাকাউন্ট নেই? " : "Don't have an account? "}
                <Text style={s.registerHighlightText}>
                  {isBn ? "নিবন্ধন করুন >" : "Sign up >"}
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
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: -2,
    marginBottom: 4,
  },
  rememberMeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rememberText: {
    fontSize: 13,
    fontWeight: "600",
  },
  forgotPassText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D97706",
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
  socialStack: {
    gap: 10,
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
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  privacyText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D97706",
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
