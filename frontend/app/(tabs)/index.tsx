import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import type { Dashboard, Profile } from "@/types";
import { Button, Card, ErrorState, H2, Muted, Row, Screen, SectionHeader, Skeleton } from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { ProfileCard } from "@/components/ProfileCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PremiumHero } from "@/components/PremiumHero";
import { AppHeader } from "@/components/navigation/AppHeader";
import { useAppStore } from "@/state/useAppStore";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export default function Home() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { mode, setMode } = useAppStore();
  const dashboard = useQuery({
    queryKey: ["dashboard", mode],
    queryFn: () => api<Dashboard>(`/dashboard?mode=${mode}`),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });

  const d = dashboard.data;
  const firstName = me.data?.profile.full_name?.split(/\s+/)[0] ?? "Learner";

  return (
    <Screen>
      <AppHeader searchPlaceholder={t("common.searchEverything")} />
      <View style={{ gap: 3 }}>
        <Text style={[s.greeting, { color: colors.text }]}>{t("home.hello")}, {firstName} 👋</Text>
        <Muted>{mode === "learn" ? "Build skills through people, rooms and real collaboration." : "Share what you know and grow your reputation."}</Muted>
      </View>

      <PremiumHero
        eyebrow="SKILLBRIDGE NETWORK"
        title={mode === "learn" ? t("home.learnTitle") : t("home.teachTitle")}
        detail={mode === "learn" ? "Find the right peer, resource or live room without hunting through disconnected groups." : "See learners who need your skills, teach live, and build a trusted skill profile."}
      >
        <View style={s.modeWrap}>
          <Button title={t("home.learn")} variant={mode === "learn" ? "primary" : "ghost"} onPress={() => setMode("learn")} compact />
          <Button title={t("home.teach")} variant={mode === "teach" ? "primary" : "ghost"} onPress={() => setMode("teach")} compact />
        </View>
      </PremiumHero>

      {dashboard.isLoading ? (
        <Card><Skeleton width="36%" /><Row><Skeleton width="22%" height={52} /><Skeleton width="22%" height={52} /><Skeleton width="22%" height={52} /></Row></Card>
      ) : dashboard.isError ? (
        <ErrorState detail={(dashboard.error as Error).message} onRetry={() => dashboard.refetch()} />
      ) : (
        <Card>
          <H2>{t("home.momentum")}</H2>
          <View style={s.statsGrid}>
            <Stat n={d?.stats.reputation ?? 0} label={t("home.reputation")} />
            <Stat n={d?.stats.connections ?? 0} label={t("home.connections")} />
            <Stat n={d?.stats.sessionsTaught ?? 0} label={t("home.taught")} />
            <Stat n={d?.stats.sessionsAttended ?? 0} label={t("home.learned")} />
          </View>
        </Card>
      )}

      <SectionHeader title={t("home.quickActions")} action="More" onAction={() => router.push("/discover" as any)} />
      <FeatureGrid compact />

      <SectionHeader title={mode === "learn" ? t("home.urgentLearn") : t("home.urgentTeach")} action={t("common.seeAll")} onAction={() => router.push("/rooms" as any)} />
      {d?.urgentRooms?.length ? d.urgentRooms.slice(0, 3).map((room) => <RoomCard key={room.id} room={room} />) : dashboard.isLoading ? <Skeleton height={120} /> : <Muted>No matching rooms right now. Create one when you need help.</Muted>}

      <SectionHeader title={t("home.people")} action={t("common.seeAll")} onAction={() => router.push("/connections" as any)} />
      {d?.recommendedPeople?.slice(0, 3).map((profile) => <ProfileCard key={profile.id} profile={profile} />)}

      <SectionHeader title={t("home.sessions")} action={t("common.seeAll")} onAction={() => router.push("/schedule" as any)} />
      {d?.upcomingSessions?.length ? d.upcomingSessions.slice(0, 3).map((session) => (
        <Card key={session.id}>
          <View style={s.sessionRow}>
            <View style={[s.dateTile, { backgroundColor: colors.primarySoft }]}>
              <Text style={[s.dateDay, { color: colors.primary }]}>{new Date(session.starts_at).getDate()}</Text>
              <Text style={[s.dateMonth, { color: colors.primary }]}>{new Date(session.starts_at).toLocaleString(undefined, { month: "short" }).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.itemTitle, { color: colors.text }]}>Learning session</Text>
              <Muted>{new Date(session.starts_at).toLocaleString()} · {session.mode}</Muted>
            </View>
          </View>
        </Card>
      )) : <Muted>No upcoming sessions yet.</Muted>}

      <SectionHeader title={t("home.events")} action={t("common.seeAll")} onAction={() => router.push("/events" as any)} />
      {d?.events?.slice(0, 3).map((event) => (
        <Card key={event.id}>
          <Text style={[s.itemTitle, { color: colors.text }]}>{event.title}</Text>
          <Muted>{new Date(event.starts_at).toLocaleString()}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[s.stat, { backgroundColor: colors.surface2 }]}>
      <Text style={[s.statNumber, { color: colors.text }]}>{n}</Text>
      <Muted numberOfLines={1}>{label}</Muted>
    </View>
  );
}

const s = StyleSheet.create({
  greeting: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  modeWrap: { flexDirection: "row", padding: 4, borderRadius: radius.md, backgroundColor: "#FFFFFF1C", gap: 4, alignSelf: "flex-start" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48%", minHeight: 74, borderRadius: radius.md, padding: 12, justifyContent: "center", gap: 2 },
  statNumber: { fontSize: 23, fontWeight: "900" },
  sessionRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  dateTile: { width: 52, height: 58, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  dateDay: { fontSize: 20, fontWeight: "900" },
  dateMonth: { fontSize: 10, fontWeight: "900" },
  itemTitle: { fontSize: 16, fontWeight: "800" },
});
