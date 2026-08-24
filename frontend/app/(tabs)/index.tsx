import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View, TextInput } from "react-native";
import Animated, { FadeInUp, useSharedValue, useAnimatedProps, withTiming, withDelay } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Dashboard, Profile } from "@/types";
import { Button, Card, ErrorState, H2, Muted, Pill, Row, Screen, SectionHeader, Skeleton, triggerHaptic } from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { ProfileCard } from "@/components/ProfileCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PremiumHero } from "@/components/PremiumHero";
import { AppHeader } from "@/components/navigation/AppHeader";
import { useAppStore } from "@/state/useAppStore";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { spotIllustrations } from "@/assets/illustrations";

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { mode, setMode } = useAppStore();
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  const dashboard = useQuery({
    queryKey: ["dashboard", mode],
    queryFn: () => api<Dashboard>(`/dashboard?mode=${mode}`),
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });

  const d = dashboard.data;
  const firstName = me.data?.profile.full_name?.split(/\s+/)[0] ?? t("home.learnerFallback");

  const visibleWidgets = [...(d?.layout.widgets ?? [])]
    .filter((widget) => widget.visible)
    .sort((a, b) => a.order - b.order);

  const activeAnnouncements = (d?.announcements ?? []).filter(
    (announcement) => !dismissedAnnouncements.includes(announcement.id),
  );

  const profileQuest = d?.profileQuest;

  const dismissAnnouncement = async (announcementId: string) => {
    triggerHaptic();
    setDismissedAnnouncements((previous) => [...previous, announcementId]);
    try {
      await api(`/dashboard/announcements/${announcementId}/dismiss`, { method: "POST" });
    } catch (error) {
      setDismissedAnnouncements((previous) => previous.filter((id) => id !== announcementId));
      Alert.alert(t("common.error"), error instanceof Error ? error.message : t("home.dismissFailed"));
    }
  };

  return (
    <Screen
      onRefresh={async () => {
        await Promise.all([dashboard.refetch(), me.refetch()]);
      }}
      refreshing={dashboard.isRefetching || me.isRefetching}
    >
      {/* Top Header with Universal Search */}
      <AppHeader searchPlaceholder={t("common.searchEverything")} />

      {dashboard.isError ? (
        <Card tone="accent" style={{ marginBottom: 8, padding: 10 }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="cloud-sync-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>
              Connecting to SkillBridge Cloud… Showing cached offline dashboard.
            </Text>
          </Row>
        </Card>
      ) : null}

      {dashboard.isLoading && !d ? (
        <Card><Skeleton width="40%" /><Skeleton height={120} /></Card>
      ) : visibleWidgets.length === 0 && !dashboard.isLoading ? (
        <Muted>{t("home.noWidgets")}</Muted>
      ) : visibleWidgets.map((widget, idx) => {
        const renderWidget = () => {
        switch (widget.widget_key) {
          case "announcements":
            if (!activeAnnouncements.length) return null;
            return (
              <View key="announcements" style={{ gap: 8 }}>
                {activeAnnouncements.map((ann) => (
                  <Card key={ann.id} tone="accent" style={styles.announcementCard}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.announcementTitle, { color: colors.text }]}>{language === "bn" ? ann.title_bn : ann.title_en}</Text>
                        <Text style={[styles.announcementBody, { color: colors.muted }]}>{language === "bn" ? ann.body_bn : ann.body_en}</Text>
                      </View>
                      {ann.is_dismissible ? (
                        <Pressable onPress={() => void dismissAnnouncement(ann.id)} hitSlop={12} style={{ padding: 4 }}>
                          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </Row>
                    {ann.action_url ? (
                      <Button
                        compact
                        variant="secondary"
                        title={(language === "bn" ? ann.action_label_bn : ann.action_label_en) || ann.action_label_en || t("common.more")}
                        onPress={() => {
                          if (ann.action_url?.startsWith("https://")) void Linking.openURL(ann.action_url);
                          else if (ann.action_url) router.push(ann.action_url as never);
                        }}
                      />
                    ) : null}
                  </Card>
                ))}
              </View>
            );

          case "greeting_hero":
            return (
              <View key="greeting_hero" style={{ gap: 12 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.greeting, { color: colors.text }]}>
                      {t("home.hello")}, {firstName} 👋
                    </Text>
                    <Muted>{mode === "learn" ? t("home.learnSubtitle") : t("home.teachSubtitle")}</Muted>
                  </View>
                  {d?.featureFlags.dashboard_customization !== false ? <Pressable
                    onPress={() => {
                      triggerHaptic();
                      router.push("/dashboard/customize" as any);
                    }}
                    style={[styles.customizeButton, { borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="tune-variant" size={18} color={colors.primary} />
                  </Pressable> : null}
                </Row>

                <PremiumHero
                  eyebrow={t("home.networkEyebrow")}
                  title={mode === "learn" ? t("home.learnTitle") : t("home.teachTitle")}
                  detail={mode === "learn" ? t("home.learnHeroDetail") : t("home.teachHeroDetail")}
                >
                  <View style={styles.modeWrap}>
                    <Button
                      title={t("home.learn")}
                      variant={mode === "learn" ? "primary" : "ghost"}
                      onPress={() => setMode("learn")}
                      compact
                    />
                    <Button
                      title={t("home.teach")}
                      variant={mode === "teach" ? "primary" : "ghost"}
                      onPress={() => setMode("teach")}
                      compact
                    />
                  </View>
                </PremiumHero>
              </View>
            );

          case "profile_quest":
            if (!profileQuest || profileQuest.completionPercent >= 100) return null;
            return (
              <Card key="profile_quest" tone="glow" style={styles.questCard}>
                <Row style={{ alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <Image
                    source={spotIllustrations.dashboardBoost}
                    style={{ width: 44, height: 44 }}
                    resizeMode="contain"
                    accessible={false}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no"
                  />
                  <View style={{ flex: 1 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.questTitle, { color: colors.text }]}>{t("home.completeProfileQuest")}</Text>
                      <Pill tone="primary">{profileQuest.completionPercent}%</Pill>
                    </Row>
                    <Muted>{t("home.completeProfileDetail")}</Muted>
                  </View>
                </Row>
                <View style={[styles.progressTrack, { backgroundColor: colors.surface, marginTop: 10 }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: colors.primary, width: `${profileQuest.completionPercent}%` },
                    ]}
                  />
                </View>
                <Row style={{ marginTop: 12, justifyContent: "flex-end" }}>
                  <Button
                    title={t("home.completeProfileAction")}
                    compact
                    onPress={() => router.push("/(auth)/onboarding" as any)}
                  />
                </Row>
              </Card>
            );

          case "momentum_stats":
            return (
              <Card key="momentum_stats">
                <H2>{t("home.momentum")}</H2>
                <View style={styles.statsGrid}>
                  <Stat n={d?.stats?.reputation ?? 0} label={t("home.reputation")} />
                  <Stat n={d?.stats?.connections ?? 0} label={t("home.connections")} />
                  <Stat n={d?.stats?.sessionsTaught ?? 0} label={t("home.taught")} />
                  <Stat n={d?.stats?.sessionsAttended ?? 0} label={t("home.learned")} />
                </View>
              </Card>
            );

          case "quick_actions":
            return (
              <View key="quick_actions">
                <SectionHeader
                  title={t("home.quickActions")}
                  action={t("common.more")}
                  onAction={() => router.push("/discover" as any)}
                />
                <FeatureGrid compact />
              </View>
            );

          case "urgent_rooms":
            return (
              <View key="urgent_rooms">
                <SectionHeader
                  title={mode === "learn" ? t("home.urgentLearn") : t("home.urgentTeach")}
                  action={t("common.seeAll")}
                  onAction={() => router.push("/rooms" as any)}
                />
                {d?.urgentRooms?.length ? (
                  d.urgentRooms.slice(0, 3).map((room) => <RoomCard key={room.id} room={room} />)
                ) : dashboard.isLoading ? (
                  <Skeleton height={120} />
                ) : (
                  <Muted>{t("home.noRooms")}</Muted>
                )}
              </View>
            );

          case "recommended_peers":
            return (
              <View key="recommended_peers">
                <SectionHeader
                  title={t("home.people")}
                  action={t("common.seeAll")}
                  onAction={() => router.push("/discover" as any)}
                />
                {d?.recommendedPeople?.slice(0, 3).map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} />
                ))}
              </View>
            );

          case "live_and_upcoming":
            return (
              <View key="live_and_upcoming">
                <SectionHeader
                  title={t("home.sessions")}
                  action={t("common.seeAll")}
                  onAction={() => router.push("/schedule" as any)}
                />
                {d?.upcomingSessions?.length ? (
                  d.upcomingSessions.slice(0, 3).map((session) => (
                    <Card key={session.id}>
                      <View style={styles.sessionRow}>
                        <View style={[styles.dateTile, { backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.dateDay, { color: colors.primary }]}>
                            {new Date(session.starts_at).getDate()}
                          </Text>
                          <Text style={[styles.dateMonth, { color: colors.primary }]}>
                            {new Date(session.starts_at).toLocaleString(undefined, { month: "short" }).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={[styles.itemTitle, { color: colors.text }]}>{t("home.sessionTitle")}</Text>
                          <Muted>
                            {new Date(session.starts_at).toLocaleString()} · {session.mode}
                          </Muted>
                        </View>
                      </View>
                    </Card>
                  ))
                ) : (
                  <Muted>{t("home.noSessions")}</Muted>
                )}
              </View>
            );

          case "campus_events":
            return (
              <View key="campus_events">
                <SectionHeader
                  title={t("home.events")}
                  action={t("common.seeAll")}
                  onAction={() => router.push("/events" as any)}
                />
                {d?.events?.slice(0, 3).map((event) => (
                  <Card key={event.id}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{event.title}</Text>
                    <Muted>{new Date(event.starts_at).toLocaleDateString()} · {event.location}</Muted>
                  </Card>
                ))}
              </View>
            );

          case "research_opportunities":
            if (!d?.researchProjects?.length) return null;
            return (
              <View key="research_opportunities">
                <SectionHeader
                  title={t("home.research")}
                  action={t("common.seeAll")}
                  onAction={() => router.push("/research" as any)}
                />
                {d.researchProjects.map((project) => (
                  <Card key={project.id}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{project.title}</Text>
                    <Muted>{project.research_areas?.[0] || t("home.researchGeneral")} · {t("home.coauthorsOpen")}</Muted>
                  </Card>
                ))}
              </View>
            );

          case "leaderboard_preview":
            return (
              <Card key="leaderboard_preview" tone="glow" style={{ marginTop: 8 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{t("home.leaderboardTitle")}</Text>
                    <Muted>{t("home.leaderboardDetail")}</Muted>
                  </View>
                  <Button
                    title={t("home.viewLeaderboard")}
                    compact
                    onPress={() => router.push("/leaderboard" as any)}
                  />
                </Row>
              </Card>
            );

          default:
            return null;
        }
        };

        const content = renderWidget();
        if (!content) return null;

        return (
          <Animated.View key={widget.widget_key} entering={FadeInUp.delay(idx * 80).duration(500).springify().damping(14)}>
            {content}
          </Animated.View>
        );
      })}
    </Screen>
  );
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function Stat({ n, label }: { n: number; label: string }) {
  const { colors } = useTheme();
  
  // Animated number counter
  const animatedValue = useSharedValue(0);
  
  useEffect(() => {
    animatedValue.value = withDelay(300, withTiming(n, { duration: 1200 }));
  }, [n, animatedValue]);

  const animatedProps = useAnimatedProps(() => {
    return {
      text: `${Math.round(animatedValue.value)}`,
    } as any;
  });

  return (
    <View style={styles.statBox}>
      <AnimatedTextInput 
        animatedProps={animatedProps}
        editable={false}
        style={[styles.statNum, { color: colors.primary, padding: 0, margin: 0, height: 26, textAlign: "center" }]} 
        defaultValue="0"
      />
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: {
    fontSize: 22,
    fontWeight: "800",
  },
  customizeButton: {
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modeWrap: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    minWidth: "22%",
    padding: 8,
    alignItems: "center",
  },
  statNum: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  questCard: {
    padding: 16,
    borderRadius: radius.lg,
  },
  questBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  questTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  sessionRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  dateTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: {
    fontSize: 18,
    fontWeight: "800",
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: "700",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  announcementCard: {
    padding: 12,
    borderRadius: radius.md,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  announcementBody: {
    fontSize: 13,
    marginTop: 2,
  },
});
