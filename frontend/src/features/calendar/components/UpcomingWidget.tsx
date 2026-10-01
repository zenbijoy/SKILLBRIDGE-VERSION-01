import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { UpcomingSummary } from "../types";
import { useTheme, radius } from "@/theme";
import { formatTime12h } from "../utils/dateUtils";
import { triggerHaptic } from "@/components/ui";

interface UpcomingWidgetProps {
  summary?: UpcomingSummary | null;
  isLoading?: boolean;
  onPress?: () => void;
  style?: any;
}

export function UpcomingWidget({
  summary,
  isLoading,
  onPress,
  style,
}: UpcomingWidgetProps) {
  const { colors, isDark } = useTheme();

  const handlePress = () => {
    triggerHaptic();
    if (onPress) {
      onPress();
    } else {
      router.push("/schedule" as any);
    }
  };

  const activeClass = summary?.activeClass;
  const nextClass = summary?.nextClass;
  const counts = summary?.counts ?? {
    assignments: 0,
    quizzes: 0,
    exams: 0,
    todayClassesCount: 0,
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : "#FFFFFF",
          borderColor: isDark ? colors.border : "#E2E8F0",
          opacity: pressed ? 0.92 : 1,
        },
        style,
      ]}
    >
      {/* Header Bar */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: activeClass
                  ? colors.primary
                  : colors.primarySoft,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={activeClass ? "record-circle-outline" : "calendar-clock"}
              size={16}
              color={activeClass ? "#FFFFFF" : colors.primary}
            />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {activeClass
              ? "CURRENTLY IN CLASS"
              : nextClass
              ? "NEXT ACADEMIC EVENT"
              : "ACADEMIC TIMETABLE"}
          </Text>
        </View>

        {activeClass ? (
          <View style={[styles.liveBadge, { backgroundColor: "#DC2626" }]}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveBadgeText}>NOW</Text>
          </View>
        ) : (
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={colors.muted}
          />
        )}
      </View>

      {/* Main Focus Area: Active class or Next class */}
      {activeClass ? (
        <View style={styles.mainFocus}>
          <Text style={[styles.courseCode, { color: colors.primary }]}>
            {activeClass.courseCode}
            <Text style={[styles.classType, { color: colors.muted }]}>
              {" "}
              • {activeClass.type}
            </Text>
          </Text>
          <Text
            style={[styles.courseTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {activeClass.courseTitle}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={colors.muted}
              />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {formatTime12h(activeClass.startTime)} -{" "}
                {formatTime12h(activeClass.endTime)} ({activeClass.minutesLeft}m
                left)
              </Text>
            </View>
            {activeClass.room ? (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="door"
                  size={14}
                  color={colors.muted}
                />
                <Text style={[styles.metaText, { color: colors.muted }]}>
                  Room {activeClass.room}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : nextClass ? (
        <View style={styles.mainFocus}>
          <View style={styles.nextCountdownRow}>
            <Text style={[styles.courseCode, { color: colors.primary }]}>
              {nextClass.courseCode}
            </Text>
            <View
              style={[
                styles.countdownPill,
                { backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={[styles.countdownText, { color: colors.primary }]}>
                {nextClass.countdown}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.courseTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {nextClass.courseTitle}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={14}
                color={colors.muted}
              />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {nextClass.dayLabel} • {formatTime12h(nextClass.startTime)}
              </Text>
            </View>
            {nextClass.room ? (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons
                  name="door"
                  size={14}
                  color={colors.muted}
                />
                <Text style={[styles.metaText, { color: colors.muted }]}>
                  Room {nextClass.room}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.emptyFocus}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No classes scheduled today
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Tap to view full academic calendar & upcoming tasks
          </Text>
        </View>
      )}

      {/* Footer Pill Counters */}
      <View
        style={[
          styles.footerPillRow,
          {
            borderTopColor: isDark ? colors.border : "#F1F5F9",
          },
        ]}
      >
        <View style={styles.counterItem}>
          <View
            style={[styles.counterDot, { backgroundColor: colors.primary }]}
          />
          <Text style={[styles.counterLabel, { color: colors.muted }]}>
            Today:{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              {counts.todayClassesCount} classes
            </Text>
          </Text>
        </View>

        {counts.assignments > 0 ? (
          <View style={styles.counterItem}>
            <View style={[styles.counterDot, { backgroundColor: "#059669" }]} />
            <Text style={[styles.counterLabel, { color: colors.muted }]}>
              <Text style={{ fontWeight: "700", color: colors.text }}>
                {counts.assignments}
              </Text>{" "}
              assignments
            </Text>
          </View>
        ) : null}

        {counts.quizzes > 0 ? (
          <View style={styles.counterItem}>
            <View style={[styles.counterDot, { backgroundColor: "#EA580C" }]} />
            <Text style={[styles.counterLabel, { color: colors.muted }]}>
              <Text style={{ fontWeight: "700", color: colors.text }}>
                {counts.quizzes}
              </Text>{" "}
              quiz
            </Text>
          </View>
        ) : null}

        {counts.exams > 0 ? (
          <View style={styles.counterItem}>
            <View style={[styles.counterDot, { backgroundColor: "#DC2626" }]} />
            <Text style={[styles.counterLabel, { color: colors.muted }]}>
              <Text style={{ fontWeight: "700", color: colors.text }}>
                {counts.exams}
              </Text>{" "}
              exam
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mainFocus: {
    marginBottom: 10,
  },
  nextCountdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  courseCode: {
    fontSize: 15,
    fontWeight: "800",
  },
  classType: {
    fontSize: 12,
    fontWeight: "500",
  },
  countdownPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: "700",
  },
  courseTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 11,
  },
  emptyFocus: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptySubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  footerPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
  counterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  counterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  counterLabel: {
    fontSize: 11,
  },
});
