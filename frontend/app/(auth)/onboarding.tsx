import { useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/lib/api";
import { Button, Card, Field, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

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

export default function OnboardingWizard() {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  // Step 1: Academic Info
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [bio, setBio] = useState("");

  // Step 2: Skills
  const [teachSkills, setTeachSkills] = useState<string[]>([]);
  const [learnSkills, setLearnSkills] = useState<string[]>([]);

  // Step 3: Preferences
  const [preferredMode, setPreferredMode] = useState<"online" | "offline" | "hybrid">("hybrid");

  const toggleTeach = (name: string) => {
    triggerHaptic();
    setTeachSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };

  const toggleLearn = (name: string) => {
    triggerHaptic();
    setLearnSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };

  const handleNext = () => {
    triggerHaptic();
    if (step === 1) {
      if (!fullName.trim() || !username.trim()) {
        Alert.alert("Missing fields", "Please enter your full name and username.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleFinish = async () => {
    try {
      triggerHaptic();
      setBusy(true);

      // 1. Update Profile
      await api("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
          university: university.trim(),
          department: department.trim(),
          batch: batch.trim(),
          bio: bio.trim() || `Student at ${university.trim() || "SkillBridge"} passionate about learning.`,
          study_mode_preference: preferredMode,
          onboarding_completed: true,
        }),
      });

      // 2. Persist Teaching (Known) Skills
      for (const skillName of teachSkills) {
        await api("/profiles/me/skills", {
          method: "POST",
          body: JSON.stringify({
            name: skillName,
            kind: "known",
            proficiency: 4,
          }),
        }).catch(() => undefined);
      }

      // 3. Persist Learning (Wanted) Skills
      for (const skillName of learnSkills) {
        await api("/profiles/me/skills", {
          method: "POST",
          body: JSON.stringify({
            name: skillName,
            kind: "wanted",
            proficiency: 1,
          }),
        }).catch(() => undefined);
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Setup Complete", "Profile setup finished. Welcome to SkillBridge!", [
        { text: "Get Started", onPress: () => router.replace("/(tabs)") },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? [colors.surfaceElevated, colors.bg] : [colors.primarySoft, colors.bg]}
      style={s.container}
    >
      <Screen scroll={true} contentStyle={s.content}>
        {/* Step Indicator Header */}
        <View style={s.stepHeader}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={[s.stepBadge, { color: colors.primary }]}>STEP {step} OF 3</Text>
            {step < 3 ? (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  router.replace("/(tabs)");
                }}
              >
                <Muted style={{ fontWeight: "700" }}>Skip setup</Muted>
              </Pressable>
            ) : null}
          </Row>
          <View style={s.stepTrack}>
            <View
              style={[
                s.stepFill,
                { width: step === 1 ? "33%" : step === 2 ? "66%" : "100%", backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>

        {/* Step 1: Academic Identity */}
        {step === 1 ? (
          <View style={s.stepBody}>
            <H1>Welcome to SkillBridge 🎓</H1>
            <Muted>Let's personalize your academic profile so peers, study rooms, and tutors can find you.</Muted>

            <Card tone="glow">
              <H2>Your Student Identity</H2>
              <Field placeholder="Full Name (e.g. Joy Saha)" value={fullName} onChangeText={setFullName} />
              <Field
                autoCapitalize="none"
                placeholder="Username (e.g. joysaha)"
                value={username}
                onChangeText={setUsername}
              />
              <Field
                placeholder="University / College (e.g. BUET / NSU / DU)"
                value={university}
                onChangeText={setUniversity}
              />
              <Field
                placeholder="Department (e.g. Computer Science)"
                value={department}
                onChangeText={setDepartment}
              />
              <Field placeholder="Batch / Year (e.g. 2024)" value={batch} onChangeText={setBatch} />
              <Field
                multiline
                numberOfLines={3}
                placeholder="Short bio or learning mission (optional)"
                value={bio}
                onChangeText={setBio}
              />
            </Card>

            <Button title="Continue to Skills →" onPress={handleNext} disabled={!fullName.trim() || !username.trim()} />
          </View>
        ) : null}

        {/* Step 2: Learning & Teaching Passions */}
        {step === 2 ? (
          <View style={s.stepBody}>
            <H1>Choose Your Skills 💡</H1>
            <Muted>Select topics you can teach peers, and topics you want to master together.</Muted>

            <Card>
              <H2>Topics You Can Teach</H2>
              <Muted>Tap to select skills you are comfortable tutoring or answering questions on:</Muted>
              <Row style={{ marginTop: 6 }}>
                {POPULAR_SKILLS.map((skill) => {
                  const selected = teachSkills.includes(skill.name);
                  return (
                    <Pill
                      key={skill.id}
                      tone={selected ? "success" : "default"}
                      onPress={() => toggleTeach(skill.name)}
                    >
                      {selected ? `✓ ${skill.name}` : `+ ${skill.name}`}
                    </Pill>
                  );
                })}
              </Row>
            </Card>

            <Card>
              <H2>Topics You Want to Learn</H2>
              <Muted>Select what you are currently studying or want help with:</Muted>
              <Row style={{ marginTop: 6 }}>
                {POPULAR_SKILLS.map((skill) => {
                  const selected = learnSkills.includes(skill.name);
                  return (
                    <Pill
                      key={`learn-${skill.id}`}
                      tone={selected ? "primary" : "default"}
                      onPress={() => toggleLearn(skill.name)}
                    >
                      {selected ? `🎯 ${skill.name}` : `+ ${skill.name}`}
                    </Pill>
                  );
                })}
              </Row>
            </Card>

            <Row style={{ justifyContent: "space-between" }}>
              <Button title="← Back" variant="ghost" onPress={() => setStep(1)} />
              <Button title="Continue →" onPress={handleNext} />
            </Row>
          </View>
        ) : null}

        {/* Step 3: Study Preference */}
        {step === 3 ? (
          <View style={s.stepBody}>
            <H1>Study Style & Matching 🚀</H1>
            <Muted>Choose how you want to participate in peer sessions and study rooms.</Muted>

            <Card tone="glow">
              <H2>Preferred Classroom Mode</H2>
              <Muted>You can change this anytime in room filters or settings:</Muted>
              <View style={s.modeList}>
                {[
                  {
                    key: "online",
                    title: "🌐 Online Video & LiveKit",
                    desc: "Join live virtual classrooms, screen share, and audio study rooms.",
                  },
                  {
                    key: "offline",
                    title: "📍 On-Campus Peer Study",
                    desc: "Meet peers in library study areas, labs, and campus cafeterias.",
                  },
                  {
                    key: "hybrid",
                    title: "⚡ Hybrid (Both Online & Campus)",
                    desc: "Get notified for both online virtual rooms and local campus meetups.",
                  },
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      triggerHaptic();
                      setPreferredMode(item.key as any);
                    }}
                    style={[
                      s.modeCard,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: preferredMode === item.key ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{item.title}</Text>
                      <Muted style={{ fontSize: 12 }}>{item.desc}</Muted>
                    </View>
                    {preferredMode === item.key ? (
                      <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </Card>

            <Row style={{ justifyContent: "space-between" }}>
              <Button title="← Back" variant="ghost" onPress={() => setStep(2)} />
              <Button
                title={busy ? "Finishing Setup…" : "Enter SkillBridge 🚀"}
                loading={busy}
                disabled={busy}
                onPress={handleFinish}
              />
            </Row>
          </View>
        ) : null}
      </Screen>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: spacing.lg, gap: spacing.lg },
  stepHeader: { gap: 8 },
  stepBadge: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  stepTrack: { height: 6, borderRadius: 3, backgroundColor: "#00000015", overflow: "hidden" },
  stepFill: { height: 6, borderRadius: 3 },
  stepBody: { gap: 14 },
  modeList: { gap: 10, marginTop: 8 },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: 12,
  },
});
