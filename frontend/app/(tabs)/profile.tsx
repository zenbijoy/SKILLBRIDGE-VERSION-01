import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Button, Card, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile; skillsKnown: { name: string }[]; skillsWanted: { name: string }[] }>("/profiles/me"),
  });
  const p = profile.data?.profile;
  const completion = p ? Math.round(["full_name", "username", "bio", "avatar_url", "university", "department", "batch"].filter((key) => Boolean((p as any)[key])).length / 7 * 100) : 0;

  return (
    <Screen>
      <AppHeader title={t("nav.profile")} actionIcon="cog-outline" actionLabel={t("profile.settings")} onAction={() => router.push("/settings" as any)} />
      {profile.isLoading ? <><Skeleton height={180} /><Skeleton height={140} /></> : null}
      {profile.isError ? <ErrorState detail={(profile.error as Error).message} onRetry={() => profile.refetch()} /> : null}
      {p ? (
        <>
          <View style={[s.cover, { backgroundColor: colors.primarySoft }]}>
            <View style={[s.coverOrb, { backgroundColor: `${colors.primary}22` }]} />
          </View>
          <View style={s.identityWrap}>
            {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={[s.avatar, { borderColor: colors.bg }]} /> : <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.primary, borderColor: colors.bg }]}><Text style={s.initials}>{initials(p.full_name)}</Text></View>}
            <H1>{p.full_name}</H1>
            <Muted>@{p.username}{p.university ? ` · ${p.university}` : ""}</Muted>
            {p.department || p.batch ? <Muted>{[p.department, p.batch].filter(Boolean).join(" · ")}</Muted> : null}
            <Row>{p.roles.map((role) => <Pill key={role} tone={role === "peer_tutor" || role === "researcher" ? "primary" : "default"}>{role.replace("_", " ")}</Pill>)}</Row>
          </View>

          <Card>
            <View style={s.stats}>
              <ProfileStat label={t("profile.reputation")} value={p.reputation} />
              <ProfileStat label="Completion" value={`${completion}%`} />
              <ProfileStat label="Roles" value={p.roles.length} />
            </View>
          </Card>

          {p.bio ? <Card><H2>About</H2><Muted>{p.bio}</Muted></Card> : null}

          <Card>
            <View style={s.sectionTitle}>
              <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}><MaterialCommunityIcons name="passport" size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><H2>{t("profile.skillPassport")}</H2><Muted>Your declared skills are the foundation for matching, teaching and research.</Muted></View>
            </View>
            <H2>{t("profile.canTeach")}</H2>
            <Row>{profile.data?.skillsKnown?.length ? profile.data.skillsKnown.map((skill) => <Pill key={skill.name} tone="primary">{skill.name}</Pill>) : <Muted>Add skills you can teach.</Muted>}</Row>
            <H2>{t("profile.wantLearn")}</H2>
            <Row>{profile.data?.skillsWanted?.length ? profile.data.skillsWanted.map((skill) => <Pill key={skill.name}>{skill.name}</Pill>) : <Muted>Add skills you want to learn.</Muted>}</Row>
          </Card>

          <Button title={t("profile.edit")} variant="secondary" icon="account-edit-outline" onPress={() => router.push("/settings/profile" as any)} />
          <Button title={t("profile.skills")} variant="secondary" icon="school-outline" onPress={() => router.push("/settings/skills" as any)} />
          <Button title={t("profile.settings")} variant="secondary" icon="cog-outline" onPress={() => router.push("/settings" as any)} />
          <Button title={t("profile.signOut")} variant="ghost" icon="logout" onPress={() => supabase.auth.signOut()} />
        </>
      ) : null}
    </Screen>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SB";
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  const { colors } = useTheme();
  return <View style={s.stat}><Text style={[s.statValue, { color: colors.text }]}>{value}</Text><Muted>{label}</Muted></View>;
}

const s = StyleSheet.create({
  cover: { height: 112, borderRadius: radius.xl, overflow: "hidden" },
  coverOrb: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -25, top: -60 },
  identityWrap: { alignItems: "center", gap: 5, marginTop: -54 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 5 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  stats: { flexDirection: "row", justifyContent: "space-around" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 21, fontWeight: "900" },
  sectionTitle: { flexDirection: "row", gap: 12, alignItems: "center" },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
