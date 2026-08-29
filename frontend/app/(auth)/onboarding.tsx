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
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";
import { Button, Card, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { usePreferencesStore, type AppLanguage } from "@/state/usePreferencesStore";
import type { Profile } from "@/types";

const STEP_IDS = ["language", "identity", "academic", "mission", "skills", "preferences", "privacy", "notifications", "review"] as const;
const OPTIONAL_STEPS = new Set([3, 4, 5, 6, 7, 8]);

type OnboardingResponse = {
  success: boolean;
  profile: Profile;
  completion_percent: number;
  missing_fields: string[];
  skills_known: string[];
  skills_wanted: string[];
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
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, marginVertical: 4, width: "100%", flexGrow: 0, flexShrink: 0 }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{label}</Text>
      <TextInput
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

  const [step, setStep] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);
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

  // Load existing profile if resuming
  useEffect(() => {
    void (async () => {
      try {
        const me = await api<{ profile: Profile; skillsKnown: { name: string }[]; skillsWanted: { name: string }[] }>("/profiles/me");
        if (me.profile) {
          if (me.profile.full_name && me.profile.full_name.trim().toLowerCase() !== "new member") setFullName(me.profile.full_name);
          if (me.profile.username && !/^user_[0-9a-f]{10}$/.test(me.profile.username)) setUsername(me.profile.username);
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
          if (me.profile.onboarding_status === "in_progress" && me.profile.onboarding_step) {
            const legacyMatch = /^step_(\d+)$/.exec(me.profile.onboarding_step);
            const resumeStep = legacyMatch
              ? Math.min(9, Number(legacyMatch[1]) + 1)
              : STEP_IDS.indexOf(me.profile.onboarding_step as (typeof STEP_IDS)[number]) + 1;
            if (resumeStep >= 1) setStep(resumeStep);
          }
        }
      } catch (err) {
        console.log("Could not preload profile for onboarding", err);
      } finally {
        setHydrating(false);
      }
    })();
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
      const contentType = asset.mimeType === "image/png" || asset.mimeType === "image/webp"
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

  const saveProgress = async (
    nextStep: (typeof STEP_IDS)[number] | "completed",
    status: "in_progress" | "completed",
  ) => api<OnboardingResponse>("/profiles/me/onboarding/bulk", {
    method: "POST",
    body: JSON.stringify({
      full_name: fullName.trim() || undefined,
      username: username.trim().toLowerCase() || undefined,
      university: university.trim() || undefined,
      department: department.trim() || undefined,
      batch: batch.trim() || undefined,
      study_mode_preference: studyMode,
      profile_visibility: profileVisibility,
      preferred_locale: selectedLanguage,
      onboarding_step: nextStep,
      onboarding_status: status,
      onboarding_version: contentVersion,
      onboarding_mission: mission,
      onboarding_push_opt_in: pushOptIn,
      timezone,
      teachSkills,
      learnSkills,
    }),
  });

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
        const availability = await api<{ available: boolean }>(`/profiles/check-username?username=${encodeURIComponent(normalizedUsername)}`);
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
      await saveProgress(nextStepId, "in_progress");
      if (step === 1) setLanguage(selectedLanguage);
      setStep(nextStepNumber);
    } catch (error) {
      Alert.alert(t("onboarding.saveFailedTitle"), error instanceof Error ? error.message : t("onboarding.saveFailedDetail"));
    } finally {
      setBusy(false);
    }
  };

  const handleSkipStep = async () => {
    triggerHaptic();
    if (!OPTIONAL_STEPS.has(step) || busy) return;
    const nextStepNumber = Math.min(9, step + 1);
    const nextStepId = STEP_IDS[nextStepNumber - 1] ?? "review";
    setBusy(true);
    try {
      await saveProgress(nextStepId, "in_progress");
      setStep(nextStepNumber);
    } catch (error) {
      Alert.alert(t("onboarding.saveFailedTitle"), error instanceof Error ? error.message : t("onboarding.saveFailedDetail"));
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    try {
      triggerHaptic();
      setBusy(true);

      if (!fullName.trim() || !/^[a-z0-9_.]{3,30}$/.test(username.trim().toLowerCase())) {
        Alert.alert(t("onboarding.requiredTitle"), t("onboarding.requiredIdentity"));
        return;
      }
      const result = await saveProgress("completed", "completed");
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

      // Navigate directly into the authenticated tab experience
      router.replace("/(tabs)" as any);
    } catch (err) {
      Alert.alert(t("onboarding.setupError"), err instanceof Error ? err.message : t("onboarding.saveFailedDetail"));
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
              {OPTIONAL_STEPS.has(step) && (
                <Pressable onPress={handleSkipStep} hitSlop={10}>
                  <Text style={[styles.skipLink, { color: colors.muted }]}>{t("common.skip")}</Text>
                </Pressable>
              )}
            </Row>

            {/* Progress Bar */}
            <View style={[styles.progressBarTrack, { backgroundColor: colors.surface }]}>
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
                    <Text style={[styles.langText, { color: colors.text, fontWeight: selectedLanguage === "en" ? "800" : "600" }]}>
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
                    <Text style={[styles.langText, { color: colors.text, fontWeight: selectedLanguage === "bn" ? "800" : "600" }]}>
                      বাংলা (Bangla)
                    </Text>
                  </Pressable>
                </Row>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <H2>{t("onboarding.timezone")}</H2>
                <Muted style={{ marginTop: 4 }}>{t("onboarding.detected")}: {timezone}</Muted>
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
                <Pressable onPress={handlePickAvatar} style={[styles.avatarCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

              <FormField label={t("onboarding.fullName")} value={fullName} onChangeText={setFullName} placeholder={t("onboarding.fullNamePlaceholder")} />

              <FormField
                label={t("onboarding.username")}
                value={username}
                onChangeText={setUsername}
                placeholder={t("onboarding.usernamePlaceholder")}
                autoCapitalize="none"
              />
              {usernameStatus === "checking" && <Muted style={{ marginTop: -8 }}>{t("onboarding.usernameChecking")}</Muted>}
              {usernameStatus === "available" && <Text style={{ color: "#10B981", fontSize: 13, marginTop: -8 }}>{t("onboarding.usernameAvailable")}</Text>}
              {usernameStatus === "taken" && <Text style={{ color: "#EF4444", fontSize: 13, marginTop: -8 }}>{t("onboarding.usernameTaken")}</Text>}
            </View>
          )}

          {/* STEP 3: Academic Profile */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <H1>{copy("academic", "onboarding.academic", "onboarding.academicDesc").title}</H1>
              <Muted>{copy("academic", "onboarding.academic", "onboarding.academicDesc").body}</Muted>

              <FormField label={t("onboarding.university")} value={university} onChangeText={setUniversity} placeholder={t("onboarding.universityPlaceholder")} />
              <FormField label={t("onboarding.department")} value={department} onChangeText={setDepartment} placeholder={t("onboarding.departmentPlaceholder")} />
              <FormField label={t("onboarding.batch")} value={batch} onChangeText={setBatch} placeholder={t("onboarding.batchPlaceholder")} />
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
                        {teachSkills.includes(skill.name) ? "✓ " : "+ "}{skill.name}
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
                        {learnSkills.includes(skill.name) ? "✓ " : "+ "}{skill.name}
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
                  <View style={{ flex: 1 }}><Button title={t("onboarding.addTeachSkill")} compact variant="secondary" onPress={() => addCustomSkill("teach")} /></View>
                  <View style={{ flex: 1 }}><Button title={t("onboarding.addLearnSkill")} compact variant="secondary" onPress={() => addCustomSkill("learn")} /></View>
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
                      <Text style={[styles.modeButtonText, { color: colors.text, fontWeight: studyMode === mode ? "800" : "600" }]}>
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
                    <Pill tone={pushOptIn ? "primary" : "default"}>{pushOptIn ? t("onboarding.enabled") : t("onboarding.disabled")}</Pill>
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
                  {university || t("onboarding.campusNotSet")} · {department || t("onboarding.departmentNotSet")} · {t("onboarding.modeLabel")}: {t(`onboarding.mode${studyMode.charAt(0).toUpperCase()}${studyMode.slice(1)}`)}
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

          {/* Bottom Actions */}
          <View style={styles.footer}>
            {step > 1 && (
              <View style={{ flex: 1 }}>
                <Button
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
                title={step === 9 ? t("common.finish") : t("common.next")}
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
    flexGrow: 1,
    padding: 20,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 20,
    gap: 8,
  },
  stepIndicator: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
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
    gap: 12,
  },
  langOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  langText: {
    fontSize: 15,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 12,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
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
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonText: {
    fontSize: 13,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 30,
  },
});
