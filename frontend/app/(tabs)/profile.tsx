import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp, ZoomIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile, Room } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { fetchActivityTimeline, type ActivityEvent } from "@/features/growth/growthApi";
import { nextGenAvatarFrames } from "@/assets/nextgen";

function initials(name?: string): string {
  if (!name) return "SB";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type TabKey = "about" | "activity" | "resources";

export default function OwnProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>("about");

  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ profile: Profile; skillsKnown: { name: string }[]; skillsWanted: { name: string }[] }>(
        "/profiles/me",
      ),
  });

  const connectionsQuery = useQuery({
    queryKey: ["connections-count"],
    queryFn: () => api<{ connections: any[] }>("/connections"),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms-mine-count"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms/mine"),
  });

  const activityQuery = useQuery({
    queryKey: ["my-activity-profile"],
    queryFn: () => fetchActivityTimeline(20, 0),
    enabled: activeTab === "activity",
  });

  const p = profileQuery.data?.profile;
  const skillsKnown = profileQuery.data?.skillsKnown ?? [];
  const skillsWanted = profileQuery.data?.skillsWanted ?? [];

  const connectionsCount = connectionsQuery.data?.connections?.length ?? 0;
  const roomsCount = roomsQuery.data?.rooms?.length ?? 0;

  const handleShare = () => {
    if (!p) return;
    triggerHaptic();
    void Share.share({
      message: `Check out ${p.full_name}'s profile on SkillBridge: https://skillbridge.app/user/${p.id}`,
    });
  };

  const onRefresh = async () => {
    await Promise.all([
      profileQuery.refetch(),
      connectionsQuery.refetch(),
      roomsQuery.refetch(),
      activeTab === "activity" ? activityQuery.refetch() : Promise.resolve(),
    ]);
  };

  const isRefreshing =
    profileQuery.isRefetching ||
    connectionsQuery.isRefetching ||
    roomsQuery.isRefetching ||
    activityQuery.isRefetching;

  return (
    <Screen
      header={
        <AppHeader
          title={t("nav.profile") || "Profile"}
          actionIcon="cog-outline"
          actionLabel={t("profile.settings") || "Settings"}
          onAction={() => {
            triggerHaptic();
            router.push("/settings" as any);
          }}
        />
      }
      onRefresh={onRefresh}
      refreshing={isRefreshing}
    >
      {profileQuery.isLoading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={120} />
          <Skeleton height={80} />
          <Skeleton height={140} />
        </View>
      ) : profileQuery.isError ? (
        <ErrorState
          detail={(profileQuery.error as Error).message}
          onRetry={() => profileQuery.refetch()}
        />
      ) : p ? (
        <Animated.View entering={FadeInUp.duration(300)} style={{ gap: 16 }}>
          {/* Header Card with Cover and Avatar */}
          <View style={[s.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <LinearGradient
              colors={[colors.primary, colors.accent, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.cover}
            />

            <View style={s.profileBody}>
              {/* Avatar with nextGen Frame */}
              <Animated.View entering={ZoomIn.springify()} style={s.avatarContainer}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={[s.avatar, { borderColor: colors.surface }]} />
                ) : (
                  <View
                    style={[
                      s.avatar,
                      s.avatarFallback,
                      { backgroundColor: colors.primary, borderColor: colors.surface },
                    ]}
                  >
                    <Text style={s.avatarInitials}>{initials(p.full_name)}</Text>
                  </View>
                )}
                {/* Visual Distinction Frame */}
                {(p.reputation ?? 0) >= 50 && (
                  <Image
                    source={nextGenAvatarFrames.verified}
                    style={s.avatarFrame}
                    resizeMode="contain"
                  />
                )}
              </Animated.View>

              {/* Name and Academic Identity */}
              <H1 style={s.fullName}>{p.full_name}</H1>
              <Muted style={s.username}>@{p.username}</Muted>

              {p.university || p.department ? (
                <Text style={[s.academicSub, { color: colors.text }]}>
                  {[p.university, p.department, p.batch].filter(Boolean).join(" • ")}
                </Text>
              ) : null}

              {p.bio ? (
                <Text style={[s.bio, { color: colors.text }]} numberOfLines={3}>
                  {p.bio}
                </Text>
              ) : null}

              {/* Action Buttons: Edit Profile & Share */}
              <Row style={s.actionsRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Edit Profile"
                    variant="primary"
                    compact
                    icon="account-edit-outline"
                    onPress={() => {
                      triggerHaptic();
                      router.push("/settings/profile" as any);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Share"
                    variant="secondary"
                    compact
                    icon="share-variant-outline"
                    onPress={handleShare}
                  />
                </View>
              </Row>

              {/* Statistics Strip: Reputation, Connections, Rooms */}
              <Row style={[s.statsStrip, { borderTopColor: colors.border }]}>
                <View style={s.statItem}>
                  <Text style={[s.statNum, { color: colors.primary }]}>{p.reputation || 0}</Text>
                  <Text style={[s.statLabel, { color: colors.muted }]}>Reputation</Text>
                </View>
                <View style={[s.statDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={s.statItem}
                  onPress={() => {
                    triggerHaptic();
                    router.push("/connections" as any);
                  }}
                >
                  <Text style={[s.statNum, { color: colors.text }]}>{connectionsCount}</Text>
                  <Text style={[s.statLabel, { color: colors.muted }]}>Connections</Text>
                </Pressable>
                <View style={[s.statDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  style={s.statItem}
                  onPress={() => {
                    triggerHaptic();
                    router.push("/rooms" as any);
                  }}
                >
                  <Text style={[s.statNum, { color: colors.text }]}>{roomsCount}</Text>
                  <Text style={[s.statLabel, { color: colors.muted }]}>Rooms</Text>
                </Pressable>
              </Row>
            </View>
          </View>

          {/* Profile Tabs: About | Activity | Resources */}
          <Row style={s.tabsRow}>
            {(["about", "activity", "resources"] as const).map((tab) => {
              const isSelected = activeTab === tab;
              const label = tab === "about" ? "About" : tab === "activity" ? "Activity" : "Resources";
              return (
                <Pressable
                  key={tab}
                  onPress={() => {
                    triggerHaptic();
                    setActiveTab(tab);
                  }}
                  style={[
                    s.tabBtn,
                    {
                      borderBottomColor: isSelected ? colors.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.tabText,
                      {
                        color: isSelected ? colors.primary : colors.muted,
                        fontWeight: isSelected ? "800" : "600",
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>

          {/* TAB CONTENT: ABOUT */}
          {activeTab === "about" && (
            <Animated.View entering={FadeInUp.duration(250)} style={{ gap: 14 }}>
              {/* Skills Known */}
              <Card style={{ gap: 10 }}>
                <H2 style={s.cardTitle}>Skills & Competencies</H2>
                {skillsKnown.length > 0 ? (
                  <Row style={{ flexWrap: "wrap", gap: 6 }}>
                    {skillsKnown.map((sItem) => (
                      <Pill key={sItem.name} tone="primary">
                        {sItem.name}
                      </Pill>
                    ))}
                  </Row>
                ) : (
                  <Muted style={{ fontSize: 13 }}>No skills added yet. Tap Edit Profile to add skills.</Muted>
                )}
              </Card>

              {/* Skills Wanted / Learning Goals */}
              {skillsWanted.length > 0 && (
                <Card style={{ gap: 10 }}>
                  <H2 style={s.cardTitle}>Looking to Learn</H2>
                  <Row style={{ flexWrap: "wrap", gap: 6 }}>
                    {skillsWanted.map((sItem) => (
                      <Pill key={sItem.name} tone="accent">
                        {sItem.name}
                      </Pill>
                    ))}
                  </Row>
                </Card>
              )}

              {/* Research Interests */}
              {(p as any).research_interests && (p as any).research_interests.length > 0 && (
                <Card style={{ gap: 10 }}>
                  <H2 style={s.cardTitle}>Research Interests</H2>
                  <Row style={{ flexWrap: "wrap", gap: 6 }}>
                    {((p as any).research_interests as string[]).map((ri: string) => (
                      <Pill key={ri} tone="default">
                        🔬 {ri}
                      </Pill>
                    ))}
                  </Row>
                </Card>
              )}

              {/* Academic Overview */}
              <Card style={{ gap: 10 }}>
                <H2 style={s.cardTitle}>Academic Background</H2>
                <View style={{ gap: 6 }}>
                  {p.university ? (
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="school-outline" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{p.university}</Text>
                    </Row>
                  ) : null}
                  {p.department ? (
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="book-open-outline" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{p.department}</Text>
                    </Row>
                  ) : null}
                  {p.batch ? (
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="calendar-range" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>Batch {p.batch}</Text>
                    </Row>
                  ) : null}
                </View>
              </Card>
            </Animated.View>
          )}

          {/* TAB CONTENT: ACTIVITY */}
          {activeTab === "activity" && (
            <Animated.View entering={FadeInUp.duration(250)} style={{ gap: 10 }}>
              {activityQuery.isLoading ? (
                <>
                  <Skeleton height={50} />
                  <Skeleton height={50} />
                </>
              ) : (activityQuery.data?.events?.length ?? 0) > 0 ? (
                activityQuery.data!.events.map((ev: ActivityEvent) => (
                  <Card key={ev.id} style={s.activityRow}>
                    <View style={[s.activityIconBox, { backgroundColor: colors.primarySoft }]}>
                      <MaterialCommunityIcons name="chart-line" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                        {ev.event_title || (ev as any).title}
                      </Text>
                      {ev.metadata?.description || (ev as any).description ? (
                        <Muted style={{ fontSize: 12 }} numberOfLines={2}>
                          {ev.metadata?.description || (ev as any).description}
                        </Muted>
                      ) : null}
                      <Muted style={{ fontSize: 11 }}>
                        {new Date(ev.created_at).toLocaleDateString()}
                      </Muted>
                    </View>
                  </Card>
                ))
              ) : (
                <Empty
                  title="No public activity yet"
                  detail="Join study rooms, complete quizzes, and answer peer questions to build your activity timeline."
                />
              )}
            </Animated.View>
          )}

          {/* TAB CONTENT: RESOURCES */}
          {activeTab === "resources" && (
            <Animated.View entering={FadeInUp.duration(250)} style={{ gap: 10 }}>
              <Card style={{ gap: 10 }}>
                <H2 style={s.cardTitle}>Shared Learning Materials</H2>
                <Muted style={{ fontSize: 13 }}>
                  Resources and materials shared in your study rooms will be organized here.
                </Muted>
                <Button
                  title="View Saved Library →"
                  variant="secondary"
                  compact
                  onPress={() => router.push("/saved" as any)}
                />
              </Card>
            </Animated.View>
          )}
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  headerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  cover: {
    height: 100,
    width: "100%",
  },
  profileBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: "center",
    marginTop: -42,
  },
  avatarContainer: {
    marginBottom: 8,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
  },
  avatarFrame: {
    position: "absolute",
    top: -8,
    left: -8,
    width: 100,
    height: 100,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  fullName: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  username: {
    fontSize: 13,
    marginBottom: 4,
  },
  academicSub: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  bio: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  actionsRow: {
    width: "100%",
    gap: 10,
    marginBottom: 16,
  },
  statsStrip: {
    width: "100%",
    paddingTop: 12,
    borderTopWidth: 1,
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statNum: {
    fontSize: 16,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  tabsRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#33333330",
    gap: 16,
    justifyContent: "center",
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
