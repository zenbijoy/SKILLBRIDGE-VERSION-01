import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";
import type { Room } from "@/types";

export interface CampusStats {
  reputation?: number;
  connections?: number;
  sessionsTaught?: number;
  sessionsAttended?: number;
  streakDays?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAMPUS STREAK & WEEKLY ACTIVITY WIDGET
// ─────────────────────────────────────────────────────────────────────────────
export function StreakActivityWidget({ streakDays = 5 }: { streakDays?: number }) {
  const { colors, isDark } = useTheme();
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  // Mock current day index (0 = Monday, 4 = Friday)
  const activeDayIndex = (new Date().getDay() + 6) % 7;

  return (
    <View
      style={[
        styles.widgetCard,
        {
          backgroundColor: isDark ? "#131926" : "#FFFFFF",
          borderColor: isDark ? "#1F293D" : "#E2E8F0",
        },
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.badgeLabelRow}>
          <View style={[styles.miniFlameBox, { backgroundColor: "rgba(249, 115, 22, 0.15)" }]}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
          </View>
          <View>
            <Text style={[styles.widgetHeading, { color: colors.text }]}>{streakDays} Days Streak</Text>
            <Text style={[styles.widgetSub, { color: colors.muted }]}>Keep learning today to stay on fire!</Text>
          </View>
        </View>

        <View style={[styles.xpPill, { backgroundColor: isDark ? "#1E293B" : "#FEF3C7" }]}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#D97706" }}>+50 XP</Text>
        </View>
      </View>

      {/* 7-Day Visual Progress Track */}
      <View style={styles.daysRow}>
        {days.map((day, idx) => {
          const isDone = idx <= activeDayIndex;
          const isToday = idx === activeDayIndex;
          return (
            <View key={idx} style={styles.dayCol}>
              <View
                style={[
                  styles.dayCircle,
                  isDone
                    ? { backgroundColor: "#F97316" }
                    : { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" },
                  isToday && styles.todayRing,
                ]}
              >
                {isDone ? (
                  <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted }}>{day}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? "#F97316" : colors.muted, fontWeight: isToday ? "800" : "600" },
                ]}
              >
                {day}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOMENTUM METRICS 2x2 INTERACTIVE WIDGET GRID
// ─────────────────────────────────────────────────────────────────────────────
interface MomentumWidgetProps {
  stats?: CampusStats;
}

export function MomentumWidget({ stats }: MomentumWidgetProps) {
  const { colors, isDark } = useTheme();
  const { t, language } = useI18n();
  const isBn = language === "bn";

  const metrics = [
    {
      title: t("home.reputation") || "Reputation",
      value: `${(stats?.reputation ?? 1250).toLocaleString()} XP`,
      badge: isBn ? "শীর্ষ ৫%" : "Top 5%",
      icon: "lightning-bolt",
      iconColor: "#F59E0B",
      bgGradient: isDark ? ["#251A0A", "#16130B"] : ["#FFFBEB", "#FEF3C7"],
      route: "/leaderboard",
    },
    {
      title: t("home.connections") || "Connections",
      value: isBn ? `${stats?.connections ?? 14} সহপাঠী` : `${stats?.connections ?? 14} Peers`,
      badge: isBn ? "৩ অনলাইন" : "3 Online",
      icon: "account-multiple",
      iconColor: "#3B82F6",
      bgGradient: isDark ? ["#0D1C34", "#091424"] : ["#EFF6FF", "#DBEAFE"],
      route: "/connections",
    },
    {
      title: t("home.taught") || "Taught",
      value: isBn ? `${stats?.sessionsTaught ?? 6} সেশন` : `${stats?.sessionsTaught ?? 6} Sessions`,
      badge: isBn ? "মেন্টর" : "Mentor",
      icon: "school",
      iconColor: "#10B981",
      bgGradient: isDark ? ["#062319", "#041610"] : ["#ECFDF5", "#D1FAE5"],
      route: "/schedule",
    },
    {
      title: t("home.learned") || "Learned",
      value: isBn ? `${stats?.sessionsAttended ?? 18} ক্লাস` : `${stats?.sessionsAttended ?? 18} Classes`,
      badge: isBn ? "লেভেল ১০" : "Level 10",
      icon: "book-open-page-variant",
      iconColor: "#8B5CF6",
      bgGradient: isDark ? ["#1F1338", "#140C24"] : ["#F5F3FF", "#EDE9FE"],
      route: "/rooms",
    },
  ];

  const rows = [
    [metrics[0], metrics[1]],
    [metrics[2], metrics[3]],
  ];

  return (
    <View style={styles.metricsContainer}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.metricsRow}>
          {row.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => {
                triggerHaptic();
                router.push(item.route as any);
              }}
              style={({ pressed }) => [
                styles.metricCard,
                {
                  backgroundColor: isDark ? "#131926" : "#FFFFFF",
                  borderColor: isDark ? "#1F293D" : "#E2E8F0",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.metricTopRow}>
                <View style={[styles.metricIconWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#FFF" }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={18} color={item.iconColor} />
                </View>
                <View style={[styles.metricBadge, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}>
                  <Text style={[styles.metricBadgeText, { color: item.iconColor }]}>{item.badge}</Text>
                </View>
              </View>

              <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>{item.value}</Text>
              <Text style={[styles.metricTitle, { color: colors.muted }]} numberOfLines={1}>{item.title}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. VISUAL FEATURE DOCK / QUICK ACTION PILLS
// ─────────────────────────────────────────────────────────────────────────────
export function CampusFeatureDock() {
  const { colors, isDark } = useTheme();

  const dockItems = [
    {
      label: "Live Rooms",
      tag: "LIVE",
      tagColor: "#EF4444",
      icon: "videocam",
      color: "#3B82F6",
      route: "/rooms",
    },
    {
      label: "Notes Vault",
      tag: "PDFs",
      tagColor: "#10B981",
      icon: "document-text",
      color: "#10B981",
      route: "/discover",
    },
    {
      label: "Ask Doubts",
      tag: "Q&A",
      tagColor: "#F59E0B",
      icon: "help-buoy",
      color: "#F59E0B",
      route: "/help/questions",
    },
    {
      label: "Rankings",
      tag: "XP",
      tagColor: "#8B5CF6",
      icon: "trophy",
      color: "#8B5CF6",
      route: "/leaderboard",
    },
  ];

  return (
    <View style={styles.dockRow}>
      {dockItems.map((item, idx) => (
        <Pressable
          key={idx}
          onPress={() => {
            triggerHaptic();
            router.push(item.route as any);
          }}
          style={({ pressed }) => [
            styles.dockItem,
            {
              backgroundColor: isDark ? "#131926" : "#FFFFFF",
              borderColor: isDark ? "#1F293D" : "#E2E8F0",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <View style={[styles.dockIconCircle, { backgroundColor: item.color }]}>
            <Ionicons name={item.icon as any} size={18} color="#FFFFFF" />
          </View>

          <Text style={[styles.dockLabel, { color: colors.text }]} numberOfLines={1}>
            {item.label}
          </Text>

          <View style={[styles.dockTag, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9" }]}>
            <Text style={[styles.dockTagText, { color: item.tagColor }]}>{item.tag}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIVE CLASS SPOTLIGHT BROADCAST CARD
// ─────────────────────────────────────────────────────────────────────────────
export function LiveClassSpotlightWidget({ room }: { room?: Room }) {
  const { colors, isDark } = useTheme();

  if (!room) return null;

  return (
    <Pressable
      onPress={() => {
        triggerHaptic();
        router.push(`/live/${room.id}` as any);
      }}
      style={({ pressed }) => [
        styles.spotlightCard,
        {
          backgroundColor: isDark ? "#131926" : "#FFFFFF",
          borderColor: isDark ? "#2563EB" : "#3B82F6",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.spotlightHeader}>
        <View style={styles.livePulseTag}>
          <View style={styles.redPulseDot} />
          <Text style={styles.livePulseText}>LIVE CLASS NOW</Text>
        </View>

        <View style={[styles.subjectTag, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.2)" : "#EEF2FF" }]}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#3B82F6" }}>
            {room.topic || "ACADEMIC SESSION"}
          </Text>
        </View>
      </View>

      <Text style={[styles.spotlightTitle, { color: colors.text }]} numberOfLines={2}>
        {room.title}
      </Text>

      <View style={styles.spotlightFooter}>
        <View style={styles.participantsCluster}>
          <Ionicons name="people" size={14} color={colors.muted} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
            {(room as any).participants_count ?? room.member_count ?? 12} students online
          </Text>
        </View>

        <View style={styles.joinClassBtn}>
          <Ionicons name="videocam" size={13} color="#FFFFFF" />
          <Text style={styles.joinClassBtnText}>Join Class</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  widgetCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  badgeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniFlameBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  widgetHeading: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  widgetSub: {
    fontSize: 12,
    marginTop: 1,
  },
  xpPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  dayCol: {
    alignItems: "center",
    gap: 6,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  metricsContainer: {
    gap: 10,
    marginVertical: 6,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  metricTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metricBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  dockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  dockItem: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  dockIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dockLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  dockTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dockTagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  spotlightCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    marginVertical: 6,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  spotlightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  livePulseTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  redPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  livePulseText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#EF4444",
    letterSpacing: 0.4,
  },
  subjectTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  spotlightTitle: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    marginBottom: 12,
  },
  spotlightFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  participantsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  joinClassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
  },
  joinClassBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
