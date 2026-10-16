import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { nextGenHeroBanners } from "@/assets/nextgen";
import { formatRelativeTime } from "@/features/help/helpUtils";

export interface DayTrack {
  day: string;
  date: string;
  is_active: boolean;
  is_today: boolean;
  minutes: number;
}

export interface FeatureUsageItem {
  key: "rooms" | "quizzes" | "tutoring" | "self_study" | "doubts";
  title: string;
  minutes: number;
  count: number;
  icon: string;
  color: string;
  detail: string;
}

export interface StreakAnalytics {
  current_streak_days: number;
  longest_streak_days: number;
  total_active_days: number;
  total_learning_minutes: number;
  weekly_track: DayTrack[];
  features_usage: FeatureUsageItem[];
  recent_activities: Array<{
    id: string;
    event_type: string;
    event_title: string;
    created_at: string;
    metadata?: Record<string, any>;
  }>;
}

export default function StreakScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<StreakAnalytics>({
    queryKey: ["activity-streak"],
    queryFn: () => api<StreakAnalytics>("/activity/streak"),
  });

  const streak = data?.current_streak_days ?? 0;
  const longest = data?.longest_streak_days ?? 0;
  const totalDays = data?.total_active_days ?? 0;
  const totalMinutes = data?.total_learning_minutes ?? 0;
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const weeklyTrack = useMemo(() => data?.weekly_track ?? [], [data]);
  const featuresUsage = useMemo(() => data?.features_usage ?? [], [data]);
  const recentActivities = useMemo(() => data?.recent_activities ?? [], [data]);

  const maxFeatureMinutes = useMemo(() => {
    return Math.max(1, ...(featuresUsage.map((f) => f.minutes) || [1]));
  }, [featuresUsage]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "study_session":
        return "book-open-variant";
      case "quiz_completed":
        return "lightbulb-check";
      case "room_join":
        return "door-open";
      case "session_taught":
      case "session_attended":
        return "account-voice";
      case "goal_milestone":
        return "flag-checkered";
      case "achievement_earned":
        return "trophy";
      default:
        return "check-circle-outline";
    }
  };

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              triggerHaptic();
              refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ================================================================= */}
        {/* 1. TOP PREMIUM FULL-SCREEN HERO BANNER                           */}
        {/* ================================================================= */}
        <View style={[s.bannerContainer, { height: 260 + insets.top }]}>
          <Image
            source={nextGenHeroBanners.achievement}
            style={s.bannerImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[
              "rgba(0,0,0,0.65)",
              "rgba(15, 23, 42, 0.45)",
              isDark ? colors.background : "rgba(248, 250, 252, 0.95)",
              colors.background,
            ]}
            locations={[0, 0.45, 0.85, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Floating Top Nav Button */}
          <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                router.back();
              }}
              hitSlop={12}
              style={s.glassBackButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={s.topNavTitle}>Streak & Activity</Text>
            <View style={{ width: 38 }} />
          </View>

          {/* Hero Content */}
          <View style={s.heroContent}>
            <View style={s.flameBadge}>
              <Text style={{ fontSize: 32 }}>🔥</Text>
            </View>
            <Text style={s.heroStreakNumber}>{streak} Days Streak</Text>
            <Text style={s.heroSubtitle}>
              {streak > 0
                ? "You're on fire! Keep active today to maintain your momentum."
                : "Start learning today to spark your campus learning streak!"}
            </Text>
          </View>
        </View>

        {/* ================================================================= */}
        {/* 2. THREE KEY PERFORMANCE STAT CARDS                               */}
        {/* ================================================================= */}
        <View style={s.contentSection}>
          <Row style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="trophy-outline" size={22} color="#F59E0B" />
              <Text style={[s.statVal, { color: colors.text }]}>{longest}d</Text>
              <Text style={[s.statLbl, { color: colors.muted }]}>Longest</Text>
            </View>

            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-check-outline" size={22} color="#3B82F6" />
              <Text style={[s.statVal, { color: colors.text }]}>{totalDays}d</Text>
              <Text style={[s.statLbl, { color: colors.muted }]}>Active Days</Text>
            </View>

            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="clock-outline" size={22} color="#10B981" />
              <Text style={[s.statVal, { color: colors.text }]}>{totalHours}h</Text>
              <Text style={[s.statLbl, { color: colors.muted }]}>Time Logged</Text>
            </View>
          </Row>

          {/* =============================================================== */}
          {/* 3. 7-DAY VISUAL TRACKER (PAST WEEK)                             */}
          {/* =============================================================== */}
          <Card style={[s.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <View>
                <Text style={[s.sectionTitle, { color: colors.text }]}>Weekly Streak Track</Text>
                <Muted style={{ fontSize: 12 }}>Last 7 days of verified activity</Muted>
              </View>
              <Pill tone="primary">Week Active</Pill>
            </Row>

            <View style={s.daysRow}>
              {weeklyTrack.map((item, idx) => (
                <View key={idx} style={s.dayCol}>
                  <View
                    style={[
                      s.dayCircle,
                      item.is_active
                        ? { backgroundColor: "#F97316" }
                        : { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" },
                      item.is_today && s.todayRing,
                    ]}
                  >
                    {item.is_active ? (
                      <MaterialCommunityIcons name="check-bold" size={14} color="#FFFFFF" />
                    ) : item.is_today ? (
                      <Text style={{ fontSize: 14 }}>🔥</Text>
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
                        {item.day[0]}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      s.dayLabel,
                      {
                        color: item.is_today ? "#F97316" : colors.muted,
                        fontWeight: item.is_today ? "800" : "600",
                      },
                    ]}
                  >
                    {item.day}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* =============================================================== */}
          {/* 4. FEATURE USAGE & TIME BREAKDOWN ("কোনটায় কতক্ষণ ছিলাম")        */}
          {/* =============================================================== */}
          <View style={{ marginTop: 22 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <View>
                <Text style={[s.sectionTitle, { color: colors.text }]}>Feature Usage & Time</Text>
                <Muted style={{ fontSize: 12 }}>Time spent and participation across spaces</Muted>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                {totalHours}h total
              </Text>
            </Row>

            {isLoading ? (
              <View style={{ gap: 8 }}>
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
              </View>
            ) : isError ? (
              <ErrorState detail={(error as Error)?.message} onRetry={() => refetch()} />
            ) : (
              <View style={{ gap: 10 }}>
                {featuresUsage.map((f) => {
                  const percent = Math.min(100, Math.round((f.minutes / maxFeatureMinutes) * 100));
                  return (
                    <Card
                      key={f.key}
                      style={[
                        s.featureCard,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Row style={{ gap: 10, alignItems: "center", flex: 1 }}>
                          <View style={[s.featureIconBox, { backgroundColor: `${f.color}18` }]}>
                            <MaterialCommunityIcons name={f.icon as any} size={20} color={f.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.featureTitle, { color: colors.text }]}>{f.title}</Text>
                            <Text style={[s.featureDetail, { color: colors.muted }]}>{f.detail}</Text>
                          </View>
                        </Row>

                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[s.featureMinutes, { color: f.color }]}>
                            {f.minutes >= 60 ? `${Math.round((f.minutes / 60) * 10) / 10}h` : `${f.minutes}m`}
                          </Text>
                        </View>
                      </Row>

                      {/* Progress Bar */}
                      <View style={[s.progressTrack, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                        <View style={[s.progressBar, { width: `${Math.max(6, percent)}%`, backgroundColor: f.color }]} />
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          {/* =============================================================== */}
          {/* 5. VERIFIED RECENT ACTIVITIES TIMELINE                          */}
          {/* =============================================================== */}
          <View style={{ marginTop: 26 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <View>
                <Text style={[s.sectionTitle, { color: colors.text }]}>Recent Learning Timeline</Text>
                <Muted style={{ fontSize: 12 }}>Real-time database verified events</Muted>
              </View>
            </Row>

            {isLoading ? (
              <Skeleton height={140} />
            ) : recentActivities.length === 0 ? (
              <Empty
                title="No Activities Logged Yet"
                detail="Join a study room or take a quiz to record your first activity event."
                actionTitle="Explore Rooms"
                onAction={() => router.push("/rooms" as any)}
              />
            ) : (
              <Card style={[s.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {recentActivities.map((act, idx) => {
                  const isLast = idx === recentActivities.length - 1;
                  return (
                    <View key={act.id || idx}>
                      <Row style={{ alignItems: "center", gap: 12, paddingVertical: 10 }}>
                        <View style={[s.activityDot, { backgroundColor: colors.primarySoft }]}>
                          <MaterialCommunityIcons
                            name={getActivityIcon(act.event_type) as any}
                            size={16}
                            color={colors.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.activityTitle, { color: colors.text }]} numberOfLines={1}>
                            {act.event_title || "Learning Activity"}
                          </Text>
                          <Text style={[s.activityDate, { color: colors.muted }]}>
                            {formatRelativeTime(act.created_at)}
                          </Text>
                        </View>
                      </Row>
                      {!isLast && <View style={[s.divider, { backgroundColor: colors.divider }]} />}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  bannerContainer: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  glassBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  topNavTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  heroContent: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  flameBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(249, 115, 22, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F97316",
    marginBottom: 8,
  },
  heroStreakNumber: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 280,
  },
  contentSection: {
    paddingHorizontal: 16,
    marginTop: -8,
  },
  statsRow: {
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
  },
  statLbl: {
    fontSize: 11,
    fontWeight: "600",
  },
  weekCard: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayCol: {
    alignItems: "center",
    gap: 6,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: {
    borderWidth: 2,
    borderColor: "#F97316",
  },
  dayLabel: {
    fontSize: 11,
  },
  featureCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  featureDetail: {
    fontSize: 11,
    marginTop: 1,
  },
  featureMinutes: {
    fontSize: 15,
    fontWeight: "800",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  timelineCard: {
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  activityDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  activityDate: {
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});
