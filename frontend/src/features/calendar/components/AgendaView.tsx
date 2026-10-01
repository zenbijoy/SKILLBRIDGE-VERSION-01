import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CalendarEvent } from "../types";
import { useTheme, radius } from "@/theme";
import {
  formatDateIso,
  formatTime12h,
  getRelativeDayLabel,
} from "../utils/dateUtils";
import { EVENT_TYPE_CONFIG } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface AgendaViewProps {
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onToggleTaskComplete?: (event: CalendarEvent) => void;
  onAddEvent?: () => void;
}

export function AgendaView({
  events,
  onEventPress,
  onToggleTaskComplete,
  onAddEvent,
}: AgendaViewProps) {
  const { colors, isDark } = useTheme();

  // Group events by date in chronological order
  const groupedEvents = useMemo(() => {
    // Sort all events by date then start_time
    const sorted = [...events].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.start_time.localeCompare(b.start_time);
    });

    const groups: { dateIso: string; label: string; items: CalendarEvent[] }[] =
      [];
    const map = new Map<string, CalendarEvent[]>();

    for (const ev of sorted) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }

    for (const [dateIso, items] of map.entries()) {
      groups.push({
        dateIso,
        label: getRelativeDayLabel(dateIso),
        items,
      });
    }

    return groups;
  }, [events]);

  if (groupedEvents.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="calendar-check-outline"
          size={48}
          color={colors.muted}
        />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          You're all clear!
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
          No classes, assignments, or academic tasks coming up.
        </Text>
        {onAddEvent ? (
          <Pressable
            onPress={onAddEvent}
            style={({ pressed }) => [
              styles.emptyAddBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.emptyAddBtnText}>Add Academic Task</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {groupedEvents.map((group) => {
        const isToday = group.dateIso === formatDateIso(new Date());

        return (
          <View key={group.dateIso} style={styles.groupSection}>
            {/* Group Header (Today, Tomorrow, Date) */}
            <View style={styles.groupHeaderRow}>
              <View
                style={[
                  styles.groupBadge,
                  {
                    backgroundColor: isToday
                      ? colors.primary
                      : isDark
                      ? colors.surface2
                      : "#F1F5F9",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.groupBadgeText,
                    { color: isToday ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {group.label}
                </Text>
              </View>
              <Text style={[styles.groupDateText, { color: colors.muted }]}>
                {group.dateIso}
              </Text>
            </View>

            {/* List of items for this date */}
            <View style={styles.groupItemsList}>
              {group.items.map((ev) => {
                const cfg =
                  EVENT_TYPE_CONFIG[ev.event_type] ?? EVENT_TYPE_CONFIG.OTHER;
                const accent = isDark ? cfg.darkColor : cfg.lightColor;
                const bgTone = isDark ? cfg.bgDark : cfg.bgLight;
                const isTask =
                  ev.event_type === "ASSIGNMENT" ||
                  ev.event_type === "QUIZ" ||
                  ev.event_type === "PROJECT" ||
                  ev.event_type === "DEADLINE" ||
                  ev.event_type === "PERSONAL_TASK";

                return (
                  <Pressable
                    key={ev.id}
                    onPress={() => {
                      triggerHaptic();
                      onEventPress(ev);
                    }}
                    style={({ pressed }) => [
                      styles.agendaCard,
                      {
                        backgroundColor: isDark ? colors.surface : "#FFFFFF",
                        borderColor: isDark ? colors.border : "#E2E8F0",
                        borderLeftColor: accent,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    {/* Time Column */}
                    <View style={styles.timeCol}>
                      <Text
                        style={[styles.timeText, { color: colors.text }]}
                      >
                        {formatTime12h(ev.start_time)}
                      </Text>
                      {ev.end_time ? (
                        <Text
                          style={[styles.endTimeText, { color: colors.muted }]}
                        >
                          {formatTime12h(ev.end_time)}
                        </Text>
                      ) : null}
                    </View>

                    {/* Divider line */}
                    <View
                      style={[
                        styles.cardDivider,
                        {
                          backgroundColor: isDark ? colors.border : "#F1F5F9",
                        },
                      ]}
                    />

                    {/* Content Column */}
                    <View style={styles.contentCol}>
                      <View style={styles.tagRow}>
                        <View
                          style={[
                            styles.typePill,
                            { backgroundColor: bgTone },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={cfg.icon as any}
                            size={11}
                            color={accent}
                          />
                          <Text
                            style={[styles.typePillText, { color: accent }]}
                          >
                            {cfg.label}
                          </Text>
                        </View>

                        {ev.course_code ? (
                          <Text
                            style={[
                              styles.courseCodeBadge,
                              { color: colors.primary },
                            ]}
                          >
                            {ev.course_code}
                          </Text>
                        ) : null}

                        {ev.priority ? (
                          <View
                            style={[
                              styles.priorityBadge,
                              {
                                backgroundColor:
                                  ev.priority === "high"
                                    ? "#FEE2E2"
                                    : ev.priority === "medium"
                                    ? "#FEF3C7"
                                    : "#F3F4F6",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.priorityText,
                                {
                                  color:
                                    ev.priority === "high"
                                      ? "#DC2626"
                                      : ev.priority === "medium"
                                      ? "#D97706"
                                      : "#4B5563",
                                },
                              ]}
                            >
                              {ev.priority.toUpperCase()}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.cardTitle,
                          {
                            color: colors.text,
                            textDecorationLine:
                              ev.is_completed || ev.is_cancelled
                                ? "line-through"
                                : "none",
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {ev.title}
                      </Text>

                      <View style={styles.metaRow}>
                        {ev.location ? (
                          <View style={styles.metaItem}>
                            <MaterialCommunityIcons
                              name="door"
                              size={12}
                              color={colors.muted}
                            />
                            <Text
                              style={[
                                styles.metaText,
                                { color: colors.muted },
                              ]}
                            >
                              Room {ev.location}
                            </Text>
                          </View>
                        ) : null}

                        {ev.instructor ? (
                          <View style={styles.metaItem}>
                            <MaterialCommunityIcons
                              name="account-outline"
                              size={12}
                              color={colors.muted}
                            />
                            <Text
                              style={[
                                styles.metaText,
                                { color: colors.muted },
                              ]}
                              numberOfLines={1}
                            >
                              {ev.instructor}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Optional Task Checkbox Action */}
                    {isTask && onToggleTaskComplete ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          triggerHaptic();
                          onToggleTaskComplete(ev);
                        }}
                        style={styles.checkboxTouch}
                      >
                        <MaterialCommunityIcons
                          name={
                            ev.is_completed
                              ? "checkbox-marked-circle"
                              : "checkbox-blank-circle-outline"
                          }
                          size={22}
                          color={ev.is_completed ? "#10B981" : colors.muted}
                        />
                      </Pressable>
                    ) : (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={colors.muted}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: 20,
  },
  groupSection: {
    marginBottom: 16,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  groupDateText: {
    fontSize: 11,
    fontWeight: "500",
  },
  groupItemsList: {
    gap: 8,
  },
  agendaCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  timeCol: {
    width: 65,
    alignItems: "flex-start",
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  endTimeText: {
    fontSize: 10,
    marginTop: 2,
  },
  cardDivider: {
    width: 1,
    height: "100%",
    marginHorizontal: 10,
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  courseCodeBadge: {
    fontSize: 11,
    fontWeight: "800",
  },
  priorityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 11,
  },
  checkboxTouch: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    maxWidth: 260,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 10,
  },
  emptyAddBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
