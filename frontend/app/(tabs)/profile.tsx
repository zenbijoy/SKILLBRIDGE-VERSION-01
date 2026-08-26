import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, ZoomIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Button, Card, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  
  const orbY = useSharedValue(0);

  useEffect(() => {
    orbY.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 4000 }),
        withTiming(0, { duration: 4000 })
      ),
      -1,
      true
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: orbY.value }],
  }));

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ profile: Profile; skillsKnown: { name: string }[]; skillsWanted: { name: string }[] }>(
        "/profiles/me",
      ),
  });

  const p = profile.data?.profile;
  const completion = p
    ? Math.round(
        (["full_name", "username", "bio", "avatar_url", "university", "department", "batch"].filter(
          (key) => Boolean((p as any)[key]),
        ).length /
          7) *
          100,
      )
    : 0;

  return (
    <Screen
      onRefresh={async () => {
        await profile.refetch();
      }}
      refreshing={profile.isRefetching}
    >
      <AppHeader
        title={t("nav.profile")}
        actionIcon="cog-outline"
        actionLabel={t("profile.settings")}
        onAction={() => {
          triggerHaptic();
          router.push("/settings" as any);
        }}
      />

      {profile.isLoading ? (
        <>
          <Skeleton height={180} />
          <Skeleton height={140} />
        </>
      ) : null}
      {profile.isError ? (
        <ErrorState detail={(profile.error as Error).message} onRetry={() => profile.refetch()} />
      ) : null}

      {p ? (
        <>
          {/* Dynamic Gradient Cover Banner */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={[colors.primary, colors.primary2, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.cover}
            >
              <Animated.View style={[s.coverOrb, { backgroundColor: `${colors.white}1E` }, orbStyle]} />
            </LinearGradient>
          </Animated.View>

          {/* Identity & Avatar Card */}
          <Animated.View entering={ZoomIn.delay(100).springify()} style={s.identityWrap}>
            {p.avatar_url ? (
              <Image source={{ uri: p.avatar_url }} style={[s.avatar, { borderColor: colors.bg }]} />
            ) : (
              <View
                style={[
                  s.avatar,
                  s.avatarFallback,
                  { backgroundColor: colors.primary, borderColor: colors.bg },
                ]}
              >
                <Text style={s.initials}>{initials(p.full_name)}</Text>
              </View>
            )}
            <H1>{p.full_name}</H1>
            <Muted>
              @{p.username}
              {p.university ? ` · ${p.university}` : ""}
            </Muted>
            {p.department || p.batch ? (
              <Muted>{[p.department, p.batch].filter(Boolean).join(" · ")}</Muted>
            ) : null}
            <Row>
              {p.roles.map((role) => (
                <Pill
                  key={role}
                  tone={
                    role === "peer_tutor"
                      ? "success"
                      : role === "researcher"
                      ? "accent"
                      : role === "moderator" || role === "admin"
                      ? "danger"
                      : "primary"
                  }
                >
                  {role.replace("_", " ")}
                </Pill>
              ))}
            </Row>
          </Animated.View>

          {/* Stats & Profile Health */}
          <Animated.View entering={FadeInUp.delay(200).springify()}>
            <Card tone="glow">
              <View style={s.stats}>
                <ProfileStat label={t("profile.reputation")} value={p.reputation} />
                <ProfileStat label="Health" value={`${completion}%`} />
                <ProfileStat label="Active Roles" value={p.roles.length} />
              </View>

              {/* Profile Completion Bar */}
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressBar,
                    {
                      width: `${completion}%`,
                      backgroundColor: completion >= 80 ? colors.success : colors.primary,
                    },
                  ]}
                />
              </View>
              <Muted style={{ fontSize: 12, textAlign: "center" }}>
                {completion === 100
                  ? "✨ Your profile is fully complete and visible across matches"
                  : `${completion}% complete · Add bio and skills to increase match ranking`}
              </Muted>
            </Card>
          </Animated.View>

          {p.bio ? (
            <Animated.View entering={FadeInUp.delay(300).springify()}>
              <Card>
                <H2>About</H2>
                <Muted>{p.bio}</Muted>
              </Card>
            </Animated.View>
          ) : null}

          {/* Skill Passport Card */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <Card>
              <View style={s.sectionTitle}>
                <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="passport" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <H2>{t("profile.skillPassport")}</H2>
                  <Muted>Declared competencies for peer tutoring, classroom discovery and research.</Muted>
                </View>
              </View>

              <H2 style={{ marginTop: 8 }}>{t("profile.canTeach")}</H2>
              <Row>
                {profile.data?.skillsKnown?.length ? (
                  profile.data.skillsKnown.map((skill) => (
                    <Pill key={skill.name} tone="success">
                      ✓ {skill.name}
                    </Pill>
                  ))
                ) : (
                  <Muted>No teaching skills listed yet. Tap Edit Skills to add.</Muted>
                )}
              </Row>

              <H2 style={{ marginTop: 8 }}>{t("profile.wantLearn")}</H2>
              <Row>
                {profile.data?.skillsWanted?.length ? (
                  profile.data.skillsWanted.map((skill) => (
                    <Pill key={skill.name} tone="primary">
                      🎯 {skill.name}
                    </Pill>
                  ))
                ) : (
                  <Muted>No learning goals listed yet.</Muted>
                )}
              </Row>
            </Card>
          </Animated.View>

          {/* Quick Actions */}
          <Animated.View entering={FadeInUp.delay(500).springify()} style={{ gap: 8 }}>
            <Button
              title={t("profile.edit")}
              variant="secondary"
              icon="account-edit-outline"
              onPress={() => router.push("/settings/profile" as any)}
            />
            <Button
              title={t("profile.skills")}
              variant="secondary"
              icon="school-outline"
              onPress={() => router.push("/settings/skills" as any)}
            />
            <Button
              title={t("profile.settings")}
              variant="secondary"
              icon="cog-outline"
              onPress={() => router.push("/settings" as any)}
            />
            <Button
              title={t("profile.signOut")}
              variant="ghost"
              icon="logout"
              onPress={async () => {
                triggerHaptic();
                await supabase.auth.signOut();
                qc.clear();
                router.replace("/(auth)/welcome" as any);
              }}
            />
          </Animated.View>
        </>
      ) : null}
    </Screen>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SB"
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  const { colors } = useTheme();
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: colors.text }]}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { height: 120, borderRadius: radius.xl, overflow: "hidden" },
  coverOrb: { position: "absolute", width: 220, height: 220, borderRadius: 110, right: -40, top: -70 },
  identityWrap: { alignItems: "center", gap: 6, marginTop: -58 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 5 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  stats: { flexDirection: "row", justifyContent: "space-around" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 22, fontWeight: "900" },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00000015",
    overflow: "hidden",
    marginTop: 6,
  },
  progressBar: { height: 8, borderRadius: 4 },
  sectionTitle: { flexDirection: "row", gap: 12, alignItems: "center" },
  iconBox: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
