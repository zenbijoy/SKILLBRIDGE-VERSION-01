import { useState, useEffect, useRef } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { usePreferencesStore, type AppLanguage } from "@/state/usePreferencesStore";
import type { Profile } from "@/types";

const STEP_IDS = [
  "language",
  "identity",
  "academic",
  "mission",
  "skills",
  "preferences",
  "privacy",
  "notifications",
  "review",
] as const;

type OnboardingResponse = {
  success: boolean;
  profile: Profile;
  completion_percent: number;
  missing_fields: string[];
  skills_known: string[];
  skills_wanted: string[];
  requestId?: string;
};

type OnboardingContent = Record<string, { title?: string; body?: string }>;
type OnboardingContentResponse = {
  contentSets: { version: number; content: unknown }[];
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, marginVertical: 4, width: "100%", flexGrow: 0, flexShrink: 0 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{label}</Text>
      <TextInput
        testID={testID}
        style={{
          width: "100%",
          height: 52,
          minHeight: 52,
          maxHeight: 52,
          backgroundColor: colors.surface,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 0,
          fontSize: 15,
          textAlignVertical: "center",
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const POPULAR_SKILLS = [
  { id: "python", name: "Python", category: "Programming" },
  { id: "dsa", name: "Data Structures & Algorithms", category: "Computer Science" },
  { id: "react", name: "React & Native", category: "Web & Mobile" },
  { id: "calculus", name: "Calculus & Linear Algebra", category: "Mathematics" },
  { id: "physics", name: "Physics & Circuits", category: "Engineering" },
  { id: "ml", name: "Machine Learning & AI", category: "Data Science" },
  { id: "ux", name: "UI/UX Design & Figma", category: "Design" },
  { id: "english", name: "Academic Writing & English", category: "Languages" },
  { id: "finance", name: "Finance & Accounting", category: "Business" },
];

export default function ProgressiveOnboardingScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const setPushEnabled = usePreferencesStore((state) => state.setPushEnabled);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ step?: string; mode?: string }>();

  const isEditMode = params.mode === "edit";

  // Step 0 = Intro; Step 1-9 = Setup steps
  const [step, setStep] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(1);
  const [serverContent, setServerContent] = useState<OnboardingContent>({});

  // Step 1: Language & Region
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka");

  // Step 2: Identity
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Academic Profile
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");

  // Step 4: Learning Mission
  const [mission, setMission] = useState<"learn" | "teach" | "both" | "research">("both");

  // Step 5: Skills
  const [teachSkills, setTeachSkills] = useState<string[]>([]);
  const [learnSkills, setLearnSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");

  // Step 6: Study Preferences
  const [studyMode, setStudyMode] = useState<"online" | "offline" | "hybrid">("hybrid");

  // Step 7: Privacy & Safety
  const [profileVisibility, setProfileVisibility] = useState<"public" | "connections" | "private">("public");

  // Step 8: Notifications
  const [pushOptIn, setPushOptIn] = useState(true);

  // Debounced username check
  useEffect(() => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    let cancelled = false;
    const clean = username.trim().toLowerCase();
    usernameTimer.current = setTimeout(async () => {
      if (clean.length < 3) {
        if (!cancelled) setUsernameStatus("idle");
        return;
      }
      if (!cancelled) setUsernameStatus("checking");
      try {
        const res = await api<{ available: boolean }>(`/profiles/check-username?username=${encodeURIComponent(clean)}`);
        if (!cancelled) setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        if (!cancelled) setUsernameStatus("idle");
      }
    }, clean.length < 3 ? 0 : 400);
    return () => {
      cancelled = true;
      if (usernameTimer.current) clearTimeout(usernameTimer.current);
    };
  }, [username]);

  // Load existing profile safely
  const loadExistingProfile = async () => {
    setHydrating(true);
    setHydrationError(null);
    try {
      const me = await api<{ profile: Profile; skillsKnown: { name: string }[]; skillsWanted: { name: string }[] }>("/profiles/me");
      if (me.profile) {
        if (me.profile.full_name && me.profile.full_name.trim().toLowerCase() !== "new member") {
          setFullName(me.profile.full_name);
        }
        if (me.profile.username && !/^user_[0-9a-f]{10}$/.test(me.profile.username)) {
          setUsername(me.profile.username);
        }
        if (me.profile.university) setUniversity(me.profile.university);
        if (me.profile.department) setDepartment(me.profile.department);
        if (me.profile.batch) setBatch(me.profile.batch);
        if (me.profile.study_mode_preference) setStudyMode(me.profile.study_mode_preference);
        if (me.profile.profile_visibility) setProfileVisibility(me.profile.profile_visibility);
        if (me.profile.avatar_url) setAvatarUri(me.profile.avatar_url);
        if (me.profile.preferred_locale) setSelectedLanguage(me.profile.preferred_locale);
        if (me.profile.timezone) setTimezone(me.profile.timezone);
        if (me.profile.onboarding_mission) setMission(me.profile.onboarding_mission);
        if (typeof me.profile.onboarding_push_opt_in === "boolean") setPushOptIn(me.profile.onboarding_push_opt_in);
        if (me.skillsKnown?.length) setTeachSkills(me.skillsKnown.map((s) => s.name));
        if (me.skillsWanted?.length) setLearnSkills(me.skillsWanted.map((s) => s.name));

        // Check if deep linked to specific step
        if (params.step) {
          const stepIndex = STEP_IDS.indexOf(params.step as (typeof STEP_IDS)[number]);
          if (stepIndex >= 0) {
            setStep(stepIndex + 1);
            return;
          }
          const num = parseInt(params.step, 10);
          if (!isNaN(num) && num >= 1 && num <= 9) {
            setStep(num);
            return;
          }
        }

        // Check if resuming from previous in_progress state
        if (me.profile.onboarding_status === "in_progress" && me.profile.onboarding_step) {
          const legacyMatch = /^step_(\d+)$/.exec(me.profile.onboarding_step);
          const resumeStep = legacyMatch
            ? Math.min(9, Number(legacyMatch[1]) + 1)
            : STEP_IDS.indexOf(me.profile.onboarding_step as (typeof STEP_IDS)[number]) + 1;
          if (resumeStep >= 1) {
            setStep(resumeStep);
            return;
          }
        }

        // If completed or deferred and opening without specific step, show step 1 or edit
        if (me.profile.onboarding_status === "completed" || me.profile.onboarding_status === "deferred" || isEditMode) {
          setStep(1);
        } else {
          // Default first-time user: show Intro (Step 0)
          setStep(0);
        }
      }
    } catch (err) {
      setHydrationError(err instanceof Error ? err.message : t("onboarding.hydrationErrorDetail"));
    } finally {
      setHydrating(false);
    }
  };

  useEffect(() => {
    void loadExistingProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api<OnboardingContentResponse>(`/experience/content?type=onboarding&locale=${selectedLanguage}`)
      .then((response) => {
        if (cancelled) return;
        const active = response.contentSets[0];
        if (active?.content && typeof active.content === "object" && !Array.isArray(active.content)) {
          setServerContent(active.content as OnboardingContent);
          setContentVersion(active.version);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedLanguage]);

  const copy = (id: string, titleKey: string, bodyKey: string) => ({
    title: serverContent[id]?.title ?? t(titleKey),
    body: serverContent[id]?.body ?? t(bodyKey),
  });

  const handlePickAvatar = async () => {
    triggerHaptic();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.55,
      base64: true,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset?.base64) {
      const contentType =
        asset.mimeType === "image/png" || asset.mimeType === "image/webp"
          ? asset.mimeType
          : "image/jpeg";
      setAvatarUri(asset.uri);
      try {
        await api("/profiles/me/avatar", {
          method: "POST",
          body: JSON.stringify({
            imageBase64: asset.base64,
            contentType,
          }),
        });
      } catch (e) {
        setAvatarUri(null);
        Alert.alert(t("onboarding.avatarUploadFailed"), e instanceof Error ? e.message : t("common.tryAgain"));
      }
    }
  };

  // Build partial payload tailored strictly to current step
  const buildStepPayload = (
    currentStepNumber: number,
    nextStepId: (typeof STEP_IDS)[number] | "completed",
    status: "in_progress" | "deferred" | "completed",
  ) => {
    const base: Record<string, unknown> = {
      onboarding_step: nextStepId,
      onboarding_status: status,
    };

    switch (currentStepNumber) {
      case 1:
        return {
          ...base,
          preferred_locale: selectedLanguage,
          timezone,
          onboarding_version: contentVersion,
        };
      case 2:
        return {
          ...base,
          full_name: fullName.trim() || undefined,
          username: username.trim().toLowerCase() || undefined,
          avatar_url: avatarUri || undefined,
        };
      case 3:
        return {
          ...base,
          university: university.trim() || undefined,
          department: department.trim() || undefined,
          batch: batch.trim() || undefined,
        };
      case 4:
        return {
          ...base,
          onboarding_mission: mission,
        };
      case 5:
        return {
          ...base,
          teachSkills,
          learnSkills,
        };
      case 6:
        return {
          ...base,
          study_mode_preference: studyMode,
        };
      case 7:
        return {
          ...base,
          profile_visibility: profileVisibility,
        };
      case 8:
        return {
          ...base,
          onboarding_push_opt_in: pushOptIn,
        };
      case 9:
      default:
        return {
          ...base,
          onboarding_step: "completed",
          onboarding_status: "completed",
        };
    }
  };

  const saveCurrentStepProgress = async (
    currentStepNumber: number,
    nextStepId: (typeof STEP_IDS)[number] | "completed",
    status: "in_progress" | "deferred" | "completed",
  ) => {
    const payload = buildStepPayload(currentStepNumber, nextStepId, status);
    return api<OnboardingResponse>("/profiles/me/onboarding/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  const handleDoLater = async () => {
    triggerHaptic();
    setBusy(true);
    try {
      await api("/profiles/me/onboarding/defer", { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["session-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/(tabs)");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const ref = apiErr?.requestId ? `\n\n${t("onboarding.saveErrorReference")} ${apiErr.requestId}` : "";
      Alert.alert(
        t("onboarding.saveFailedTitle"),
        (apiErr?.message || t("onboarding.saveFailedDetail")) + ref,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndExit = async () => {
    triggerHaptic();
    if (busy) return;
    setBusy(true);
    try {
      const currentStepId = STEP_IDS[step - 1] ?? "language";
      await saveCurrentStepProgress(step, currentStepId, "in_progress");
      await queryClient.invalidateQueries({ queryKey: ["session-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      if (isEditMode) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const ref = apiErr?.requestId ? `\n\n${t("onboarding.saveErrorReference")} ${apiErr.requestId}` : "";
      Alert.alert(
        t("onboarding.saveFailedTitle"),
        (apiErr?.message || t("onboarding.saveFailedDetail")) + ref,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNextStep = async () => {
    triggerHaptic();
    if (hydrating || busy) return;

    if (step === 2) {
      const normalizedUsername = username.trim().toLowerCase();
      if (!fullName.trim() || !normalizedUsername) {
        Alert.alert(t("onboarding.requiredTitle"), t("onboarding.requiredIdentity"));
        return;
      }
      if (!/^[a-z0-9_.]{3,30}$/.test(normalizedUsername)) {
        Alert.alert(t("onboarding.invalidUsernameTitle"), t("onboarding.invalidUsernameDetail"));
        return;
      }
      setBusy(true);
      try {
        const availability = await api<{ available: boolean }>(
          `/profiles/check-username?username=${encodeURIComponent(normalizedUsername)}`,
        );
        if (!availability.available) {
          setUsernameStatus("taken");
          Alert.alert(t("onboarding.usernameTaken"), t("onboarding.chooseAnotherUsername"));
          return;
        }
        setUsernameStatus("available");
      } catch (error) {
        Alert.alert(t("common.error"), error instanceof Error ? error.message : t("common.tryAgain"));
        return;
      } finally {
        setBusy(false);
      }
    }

    const nextStepNumber = Math.min(9, step + 1);
    const nextStepId = STEP_IDS[nextStepNumber - 1] ?? "review";
    setBusy(true);
    try {
      await saveCurrentStepProgress(step, nextStepId, "in_progress");
      if (step === 1) setLanguage(selectedLanguage);
      setStep(nextStepNumber);
    } catch (error) {
      const apiErr = error instanceof ApiError ? error : null;
      const ref = apiErr?.requestId ? `\n\n${t("onboarding.saveErrorReference")} ${apiErr.requestId}` : "";
      Alert.alert(
        t("onboarding.saveFailedTitle"),
        (apiErr?.message || t("onboarding.saveFailedDetail")) + ref,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSkipStep = () => {
    triggerHaptic();
    if (busy) return;
    const nextStepNumber = Math.min(9, step + 1);
    setStep(nextStepNumber);
  };

  const handleFinish = async () => {
    try {
      triggerHaptic();
      setBusy(true);

      if (!fullName.trim() || !/^[a-z0-9_.]{3,30}$/.test(username.trim().toLowerCase())) {
        Alert.alert(t("onboarding.requiredTitle"), t("onboarding.requiredIdentity"));
        return;
      }
      const result = await saveCurrentStepProgress(9, "completed", "completed");
      if (!result.profile.onboarding_completed || result.profile.onboarding_status !== "completed") {
        throw new Error(t("onboarding.requiredIdentity"));
      }
      setLanguage(selectedLanguage);
      setPushEnabled(pushOptIn);
      queryClient.setQueryData(["me"], (current: { profile?: Profile } | undefined) => ({
        ...(current ?? {}),
        profile: result.profile,
      }));
      await queryClient.invalidateQueries({ queryKey: ["session-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      if (isEditMode) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const ref = apiErr?.requestId ? `\n\n${t("onboarding.saveErrorReference")} ${apiErr.requestId}` : "";
      Alert.alert(
        t("onboarding.setupError"),
        (apiErr?.message || t("onboarding.saveFailedDetail")) + ref,
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (type: "teach" | "learn", name: string) => {
    triggerHaptic();
    if (type === "teach") {
      setTeachSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
    } else {
      setLearnSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
    }
  };

  const addCustomSkill = (type: "teach" | "learn") => {
    const clean = customSkill.trim();
    if (!clean) return;
    triggerHaptic();
    if (type === "teach" && !teachSkills.includes(clean)) {
      setTeachSkills((prev) => [...prev, clean]);
    } else if (type === "learn" && !learnSkills.includes(clean)) {
      setLearnSkills((prev) => [...prev, clean]);
    }
    setCustomSkill("");
  };

  // Hydration Error Screen
  if (hydrationError) {
    return (
      <Screen scroll={false}>
        <View style={styles.centerContainer}>
          <Card style={{ gap: 14, alignItems: "center", padding: 24 }}>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.danger} />
            <H2 style={{ textAlign: "center" }}>{t("onboarding.hydrationErrorTitle")}</H2>
            <Muted style={{ textAlign: "center" }}>{hydrationError}</Muted>
            <Row style={{ gap: 10, marginTop: 12, width: "100%" }}>
              <View style={{ flex: 1 }}>
                <Button title={t("onboarding.goToHome")} variant="secondary" onPress={() => router.replace("/(tabs)")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={t("onboarding.retry")} onPress={() => void loadExistingProfile()} />
              </View>
            </Row>
          </Card>
        </View>
      </Screen>
    );
  }

  // STEP 0: Optional Profile Setup Introduction
  if (step === 0 && !hydrating) {
    return (
      <Screen scroll={false}>
        <View style={styles.introContainer}>
          <View style={styles.introHeader}>
            <View style={[styles.introIconBox, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="account-star" size={40} color={colors.primary} />
            </View>
            <H1 style={{ textAlign: "center", marginTop: 12 }}>{t("onboarding.introTitle")}</H1>
            <Muted style={{ textAlign: "center", lineHeight: 22, marginTop: 6 }}>
              {t("onboarding.introSubtitle")}
            </Muted>
          </View>

          <Card style={{ gap: 14, marginVertical: 20 }}>
            <Row style={{ gap: 12, alignItems: "center" }}>
              <MaterialCommunityIcons name="school" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>Campus & Course Matching</Text>
                <Muted style={{ fontSize: 12 }}>Connect with classmates from your university & major.</Muted>
              </View>
            </Row>
            <Row style={{ gap: 12, alignItems: "center" }}>
              <MaterialCommunityIcons name="book-education-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>Peer Tutoring & Exchange</Text>
                <Muted style={{ fontSize: 12 }}>Declare what you teach and what you want to master.</Muted>
              </View>
            </Row>
            <Row style={{ gap: 12, alignItems: "center" }}>
              <MaterialCommunityIcons name="compass-outline" size={22} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>Tailored Recommendations</Text>
                <Muted style={{ fontSize: 12 }}>Discover relevant live rooms, study groups, and quizzes.</Muted>
              </View>
            </Row>
          </Card>

          <View style={{ gap: 10, marginTop: "auto", marginBottom: 20 }}>
            <Button
              testID="profileSetup.intro.start"
              title={t("onboarding.setupNow")}
              onPress={() => {
                triggerHaptic();
                setStep(1);
              }}
              icon="arrow-right"
            />
            <Button
              testID="profileSetup.intro.defer"
              title={t("onboarding.doLater")}
              variant="ghost"
              onPress={handleDoLater}
              loading={busy}
              disabled={busy}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} keyboardAvoiding={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Progress Tracker */}
          <View style={styles.header}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.stepIndicator, { color: colors.primary }]}>
                {t("onboarding.step")} {step} {t("onboarding.of")} 9
              </Text>
              <Row style={{ gap: 12, alignItems: "center" }}>
                {step > 1 && step < 9 && (
                  <Pressable testID="profileSetup.skip" onPress={handleSkipStep} hitSlop={10}>
                    <Text style={[styles.skipLink, { color: colors.muted }]}>{t("onboarding.skip")}</Text>
                  </Pressable>
                )}
                <Pressable testID="profileSetup.saveExit" onPress={handleSaveAndExit} hitSlop={10}>
                  <Text style={[styles.skipLink, { color: colors.primary, fontWeight: "700" }]}>
                    {t("onboarding.saveExit")}
                  </Text>
                </Pressable>
              </Row>
            </Row>

            {/* Progress Bar */}
            <View
              testID="profileSetup.progress"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: 9, now: step }}
              style={[styles.progressBarTrack, { backgroundColor: colors.surface }]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  { backgroundColor: colors.primary, width: `${(step / 9) * 100}%` },
                ]}
              />
            </View>
          </View>

          {/* STEP 1: Language & Region */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <H1>{copy("language", "onboarding.langRegion", "onboarding.langRegionDesc").title}</H1>
              <Muted>{copy("language", "onboarding.langRegion", "onboarding.langRegionDesc").body}</Muted>

              <Card style={{ marginTop: 16, gap: 12 }}>
                <H2>{t("onboarding.appLanguage")} / ভাষা</H2>
                <Row style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setSelectedLanguage("en");
                    }}
                    style={[
                      styles.langOption,
                      { borderColor: selectedLanguage === "en" ? colors.primary : colors.border },
                      selectedLanguage === "en" && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langText,
                        { color: colors.text, fontWeight: selectedLanguage === "en" ? "800" : "600" },
                      ]}
                    >
                      English (US)
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setSelectedLanguage("bn");
                    }}
                    style={[
                      styles.langOption,
                      { borderColor: selectedLanguage === "bn" ? colors.primary : colors.border },
                      selectedLanguage === "bn" && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langText,
                        { color: colors.text, fontWeight: selectedLanguage === "bn" ? "800" : "600" },
                      ]}
                    >
                      বাংলা (Bangla)
                    </Text>
                  </Pressable>
                </Row>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.timezone")}</H2>
                <Muted style={{ marginTop: 4 }}>
                  {t("onboarding.detected")}: {timezone}
                </Muted>
              </Card>
            </View>
          )}

          {/* STEP 2: Identity */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <H1>{copy("identity", "onboarding.identity", "onboarding.identityDesc").title}</H1>
              <Muted>{copy("identity", "onboarding.identity", "onboarding.identityDesc").body}</Muted>

              {/* Avatar Uploader */}
              <View style={styles.avatarRow}>
                <Pressable
                  onPress={handlePickAvatar}
                  style={[styles.avatarCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <MaterialCommunityIcons name="camera-plus" size={32} color={colors.primary} />
                  )}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.avatarLabel, { color: colors.text }]}>{t("onboarding.profilePicture")}</Text>
                  <Muted>{t("onboarding.profilePictureDetail")}</Muted>
                </View>
              </View>

              <FormField
                label={t("onboarding.fullName")}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t("onboarding.fullNamePlaceholder")}
              />

              <FormField
                label={t("onboarding.username")}
                value={username}
                onChangeText={setUsername}
                placeholder={t("onboarding.usernamePlaceholder")}
                autoCapitalize="none"
              />
              {usernameStatus === "checking" && (
                <Muted style={{ marginTop: -8 }}>{t("onboarding.usernameChecking")}</Muted>
              )}
              {usernameStatus === "available" && (
                <Text style={{ color: "#10B981", fontSize: 13, marginTop: -8 }}>
                  {t("onboarding.usernameAvailable")}
                </Text>
              )}
              {usernameStatus === "taken" && (
                <Text style={{ color: "#EF4444", fontSize: 13, marginTop: -8 }}>
                  {t("onboarding.usernameTaken")}
                </Text>
              )}
            </View>
          )}

          {/* STEP 3: Academic Profile */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <H1>{copy("academic", "onboarding.academic", "onboarding.academicDesc").title}</H1>
              <Muted>{copy("academic", "onboarding.academic", "onboarding.academicDesc").body}</Muted>

              <FormField
                label={t("onboarding.university")}
                value={university}
                onChangeText={setUniversity}
                placeholder={t("onboarding.universityPlaceholder")}
              />
              <FormField
                label={t("onboarding.department")}
                value={department}
                onChangeText={setDepartment}
                placeholder={t("onboarding.departmentPlaceholder")}
              />
              <FormField
                label={t("onboarding.batch")}
                value={batch}
                onChangeText={setBatch}
                placeholder={t("onboarding.batchPlaceholder")}
              />
            </View>
          )}

          {/* STEP 4: Learning Mission */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <H1>{copy("mission", "onboarding.mission", "onboarding.missionDesc").title}</H1>
              <Muted>{copy("mission", "onboarding.mission", "onboarding.missionDesc").body}</Muted>

              <Card style={{ marginTop: 16, gap: 10 }}>
                {[
                  { id: "both", title: t("onboarding.missionBothTitle"), desc: t("onboarding.missionBothDetail") },
                  { id: "learn", title: t("onboarding.missionLearnTitle"), desc: t("onboarding.missionLearnDetail") },
                  { id: "teach", title: t("onboarding.missionTeachTitle"), desc: t("onboarding.missionTeachDetail") },
                  { id: "research", title: t("onboarding.missionResearchTitle"), desc: t("onboarding.missionResearchDetail") },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      triggerHaptic();
                      setMission(item.id as any);
                    }}
                    style={[
                      styles.missionCard,
                      { borderColor: mission === item.id ? colors.primary : colors.border },
                      mission === item.id && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text style={[styles.missionTitle, { color: colors.text }]}>{item.title}</Text>
                    <Muted>{item.desc}</Muted>
                  </Pressable>
                ))}
              </Card>
            </View>
          )}

          {/* STEP 5: Skills */}
          {step === 5 && (
            <View style={styles.stepContainer}>
              <H1>{copy("skills", "onboarding.skills", "onboarding.skillsDesc").title}</H1>
              <Muted>{copy("skills", "onboarding.skills", "onboarding.skillsDesc").body}</Muted>

              <Card style={{ marginTop: 16 }}>
                <H2>{t("onboarding.teachSkills")}</H2>
                <View style={styles.chipGrid}>
                  {POPULAR_SKILLS.map((skill) => (
                    <Pressable key={`teach-${skill.id}`} onPress={() => toggleSkill("teach", skill.name)}>
                      <Pill tone={teachSkills.includes(skill.name) ? "primary" : "default"}>
                        {teachSkills.includes(skill.name) ? "✓ " : "+ "}
                        {skill.name}
                      </Pill>
                    </Pressable>
                  ))}
                </View>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.learnSkills")}</H2>
                <View style={styles.chipGrid}>
                  {POPULAR_SKILLS.map((skill) => (
                    <Pressable key={`learn-${skill.id}`} onPress={() => toggleSkill("learn", skill.name)}>
                      <Pill tone={learnSkills.includes(skill.name) ? "accent" : "default"}>
                        {learnSkills.includes(skill.name) ? "✓ " : "+ "}
                        {skill.name}
                      </Pill>
                    </Pressable>
                  ))}
                </View>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.customSkill")}</H2>
                <FormField
                  label={t("onboarding.customSkillLabel")}
                  value={customSkill}
                  onChangeText={setCustomSkill}
                  placeholder={t("onboarding.customSkillPlaceholder")}
                />
                <Row style={{ gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={t("onboarding.addTeachSkill")}
                      compact
                      variant="secondary"
                      onPress={() => addCustomSkill("teach")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={t("onboarding.addLearnSkill")}
                      compact
                      variant="secondary"
                      onPress={() => addCustomSkill("learn")}
                    />
                  </View>
                </Row>
              </Card>
            </View>
          )}

          {/* STEP 6: Study Preferences */}
          {step === 6 && (
            <View style={styles.stepContainer}>
              <H1>{copy("preferences", "onboarding.preferences", "onboarding.preferencesDesc").title}</H1>
              <Muted>{copy("preferences", "onboarding.preferences", "onboarding.preferencesDesc").body}</Muted>

              <Card style={{ marginTop: 16, gap: 12 }}>
                <H2>{t("onboarding.collaborationMode")}</H2>
                <Row style={{ gap: 8 }}>
                  {(["hybrid", "online", "offline"] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        triggerHaptic();
                        setStudyMode(mode);
                      }}
                      style={[
                        styles.modeButton,
                        { borderColor: studyMode === mode ? colors.primary : colors.border },
                        studyMode === mode && { backgroundColor: colors.primarySoft },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          { color: colors.text, fontWeight: studyMode === mode ? "800" : "600" },
                        ]}
                      >
                        {t(`onboarding.mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </Card>
            </View>
          )}

          {/* STEP 7: Privacy & Safety */}
          {step === 7 && (
            <View style={styles.stepContainer}>
              <H1>{copy("privacy", "onboarding.privacy", "onboarding.privacyDesc").title}</H1>
              <Muted>{copy("privacy", "onboarding.privacy", "onboarding.privacyDesc").body}</Muted>

              <Card style={{ marginTop: 16, gap: 10 }}>
                {[
                  { id: "public", title: t("onboarding.privacyPublicTitle"), desc: t("onboarding.privacyPublicDetail") },
                  { id: "connections", title: t("onboarding.privacyConnectionsTitle"), desc: t("onboarding.privacyConnectionsDetail") },
                  { id: "private", title: t("onboarding.privacyPrivateTitle"), desc: t("onboarding.privacyPrivateDetail") },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      triggerHaptic();
                      setProfileVisibility(item.id as any);
                    }}
                    style={[
                      styles.missionCard,
                      { borderColor: profileVisibility === item.id ? colors.primary : colors.border },
                      profileVisibility === item.id && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text style={[styles.missionTitle, { color: colors.text }]}>{item.title}</Text>
                    <Muted>{item.desc}</Muted>
                  </Pressable>
                ))}
              </Card>
            </View>
          )}

          {/* STEP 8: Notifications */}
          {step === 8 && (
            <View style={styles.stepContainer}>
              <H1>{copy("notifications", "onboarding.notifications", "onboarding.notificationsDesc").title}</H1>
              <Muted>{copy("notifications", "onboarding.notifications", "onboarding.notificationsDesc").body}</Muted>

              <Card style={{ marginTop: 16, gap: 12 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.switchTitle, { color: colors.text }]}>{t("onboarding.studyAlerts")}</Text>
                    <Muted>{t("onboarding.studyAlertsDetail")}</Muted>
                  </View>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setPushOptIn(!pushOptIn);
                    }}
                  >
                    <Pill tone={pushOptIn ? "primary" : "default"}>
                      {pushOptIn ? t("onboarding.enabled") : t("onboarding.disabled")}
                    </Pill>
                  </Pressable>
                </Row>
              </Card>
            </View>
          )}

          {/* STEP 9: Review & Launch */}
          {step === 9 && (
            <View style={styles.stepContainer}>
              <H1>{copy("review", "onboarding.review", "onboarding.reviewDesc").title}</H1>
              <Muted>{copy("review", "onboarding.review", "onboarding.reviewDesc").body}</Muted>

              <Card style={{ marginTop: 16 }}>
                <H2>{t("onboarding.identityLanguage")}</H2>
                <Text style={{ color: colors.text, marginTop: 4 }}>
                  {fullName} (@{username}) · {selectedLanguage === "bn" ? "বাংলা" : "English"}
                </Text>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.academicPreferences")}</H2>
                <Text style={{ color: colors.text, marginTop: 4 }}>
                  {university || t("onboarding.campusNotSet")} · {department || t("onboarding.departmentNotSet")} ·{" "}
                  {t("onboarding.modeLabel")}: {t(`onboarding.mode${studyMode.charAt(0).toUpperCase()}${studyMode.slice(1)}`)}
                </Text>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.skillsConfigured")}</H2>
                <Text style={{ color: colors.text, marginTop: 4 }}>
                  {t("onboarding.teachingLabel")}: {teachSkills.length ? teachSkills.join(", ") : t("onboarding.noneSpecified")}
                </Text>
                <Text style={{ color: colors.text, marginTop: 4 }}>
                  {t("onboarding.learningLabel")}: {learnSkills.length ? learnSkills.join(", ") : t("onboarding.noneSpecified")}
                </Text>
              </Card>
            </View>
          )}

          {/* Bottom Navigation Buttons */}
          <View style={styles.footer}>
            {step > 1 && (
              <View style={{ flex: 1 }}>
                <Button
                  testID="profileSetup.back"
                  title={t("common.back")}
                  variant="secondary"
                  onPress={() => {
                    triggerHaptic();
                    setStep(step - 1);
                  }}
                  disabled={busy}
                />
              </View>
            )}
            <View style={{ flex: 2 }}>
              <Button
                testID="profileSetup.next"
                title={step === 9 ? (isEditMode ? t("common.save") : t("common.finish")) : t("common.next")}
                onPress={step === 9 ? handleFinish : handleNextStep}
                loading={busy}
                disabled={hydrating || busy}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  introContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    justifyContent: "space-between",
  },
  introHeader: {
    alignItems: "center",
  },
  introIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    gap: 8,
    marginBottom: 20,
  },
  stepIndicator: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  skipLink: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  stepContainer: {
    gap: 8,
  },
  langOption: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  langText: {
    fontSize: 14,
  },
  avatarRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginVertical: 12,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  missionCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 4,
  },
  missionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  modeButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  modeButtonText: {
    fontSize: 13,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
});
