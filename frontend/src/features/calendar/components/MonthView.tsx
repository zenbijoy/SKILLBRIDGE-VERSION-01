import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CalendarEvent } from "../types";
import { useTheme, radius } from "@/theme";
import {
  getMonthGrid,
  formatDateIso,
  formatTime12h,
} from "../utils/dateUtils";
import { EVENT_TYPE_CONFIG } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface MonthViewProps {
  currentDate: Date;
  selectedDateIso: string;
  onSelectDate: (iso: string) => void;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onAddEventForDate: (iso: string) => void;
}

const WEEK_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  currentDate,
  selectedDateIso,
  onSelectDate,
  events,
  onEventPress,
  onAddEventForDate,
}: MonthViewProps) {
  const { colors, isDark } = useTheme();

  const gridCells = useMemo(() => {
    return getMonthGrid(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  // Group events by date (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const existing = map.get(ev.date) ?? [];
      existing.push(ev);
      map.set(ev.date, existing);
    }
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    const list = eventsByDate.get(selectedDateIso) ?? [];
    return [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [eventsByDate, selectedDateIso]);

  return (
    <View style={styles.container}>
      {/* Weekday Header */}
      <View style={styles.weekdayHeaderRow}>
        {WEEK_HEADERS.map((name, i) => (
          <View key={name} style={styles.weekdayHeaderCell}>
            <Text
              style={[
                styles.weekdayHeaderText,
                {
                  color: i === 0 || i === 6 ? colors.primary : colors.muted,
                },
              ]}
            >
              {name}
            </Text>
          </View>
        ))}
      </View>

      {/* 7x5 or 7x6 Calendar Grid */}
      <View
        style={[
          styles.gridContainer,
          {
            borderColor: isDark ? colors.border : "#E2E8F0",
            backgroundColor: isDark ? colors.surface : "#FFFFFF",
          },
        ]}
      >
        {gridCells.map((cell, index) => {
          const isSelected = cell.iso === selectedDateIso;
          const dayEvents = eventsByDate.get(cell.iso) ?? [];
          const hasEvents = dayEvents.length > 0;

          return (
            <Pressable
              key={`${cell.iso}-${index}`}
              onPress={() => {
                triggerHaptic();
                onSelectDate(cell.iso);
              }}
              style={({ pressed }) => [
                styles.dayCell,
                {
                  borderRightColor: isDark ? colors.border : "#F1F5F9",
                  borderBottomColor: isDark ? colors.border : "#F1F5F9",
                  backgroundColor: isSelected
                    ? isDark
                      ? colors.primarySoft
                      : "#EFF6FF"
                    : pressed
                    ? isDark
                      ? colors.surface2
                      : "#F8FAFC"
                    : "transparent",
                },
              ]}
            >
              {/* Day Number */}
              <View
                style={[
                  styles.dayNumberCircle,
                  cell.isToday && {
                    backgroundColor: colors.primary,
                  },
                  isSelected &&
                    !cell.isToday && {
                      borderColor: colors.primary,
                      borderWidth: 1.5,
                    },
                ]}
              >
                <Text
                  style={[
                    styles.dayNumberText,
                    {
                      color: cell.isToday
                        ? "#FFFFFF"
                        : isSelected
                        ? colors.primary
                        : cell.isCurrentMonth
                        ? colors.text
                        : colors.muted,
                      fontWeight:
                        cell.isToday || isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {cell.dayNumber}
                </Text>
              </View>

              {/* Event indicators */}
              <View style={styles.eventsIndicatorWrap}>
                {dayEvents.slice(0, 3).map((ev, idx) => {
                  const cfg =
                    EVENT_TYPE_CONFIG[ev.event_type] ?? EVENT_TYPE_CONFIG.OTHER;
                  const dotColor = isDark ? cfg.darkColor : cfg.lightColor;
                  return (
                    <View
                      key={ev.id ?? idx}
                      style={[
                        styles.eventDot,
                        {
                          backgroundColor: ev.is_cancelled
                            ? colors.muted
                            : dotColor,
                        },
                      ]}
                    />
                  );
                })}
                {dayEvents.length > 3 ? (
                  <Text style={[styles.overflowCount, { color: colors.muted }]}>
                    +{dayEvents.length - 3}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Day Agenda Drawer Below Grid */}
      <View style={styles.dayDetailsSection}>
        <View style={styles.dayDetailsHeader}>
          <Text style={[styles.dayDetailsTitle, { color: colors.text }]}>
            {selectedDateIso === formatDateIso(new Date())
              ? "Today's Schedule"
              : `Events for ${selectedDateIso}`}
          </Text>
          <Pressable
            onPress={() => onAddEventForDate(selectedDateIso)}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.primarySoft,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="plus"
              size={15}
              color={colors.primary}
            />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>
              Add Task
            </Text>
          </Pressable>
        </View>

        {selectedDayEvents.length === 0 ? (
          <View style={styles.noEventsBox}>
            <MaterialCommunityIcons
              name="calendar-blank-outline"
              size={28}
              color={colors.muted}
            />
            <Text style={[styles.noEventsText, { color: colors.muted }]}>
              No classes or tasks on this day.
            </Text>
          </View>
        ) : (
          <View style={styles.eventList}>
            {selectedDayEvents.map((ev) => {
              const cfg =
                EVENT_TYPE_CONFIG[ev.event_type] ?? EVENT_TYPE_CONFIG.OTHER;
              const accentColor = isDark ? cfg.darkColor : cfg.lightColor;
              const bgTone = isDark ? cfg.bgDark : cfg.bgLight;

              return (
                <Pressable
                  key={ev.id}
                  onPress={() => {
                    triggerHaptic();
                    onEventPress(ev);
                  }}
                  style={({ pressed }) => [
                    styles.eventCard,
                    {
                      backgroundColor: isDark ? colors.surface : "#FFFFFF",
                      borderColor: isDark ? colors.border : "#E2E8F0",
                      borderLeftColor: accentColor,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View style={styles.eventCardLeft}>
                    <View
                      style={[
                        styles.eventTypePill,
                        { backgroundColor: bgTone },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={cfg.icon as any}
                        size={12}
                        color={accentColor}
                      />
                      <Text
                        style={[
                          styles.eventTypeText,
                          { color: accentColor },
                        ]}
                      >
                        {cfg.label}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.eventTitle,
                        {
                          color: colors.text,
                          textDecorationLine: ev.is_cancelled
                            ? "line-through"
                            : "none",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {ev.course_code ? `${ev.course_code}: ` : ""}
                      {ev.title}
                    </Text>

                    <View style={styles.eventMetaRow}>
                      <Text
                        style={[styles.eventTimeText, { color: colors.muted }]}
                      >
                        {formatTime12h(ev.start_time)}
                        {ev.end_time ? ` - ${formatTime12h(ev.end_time)}` : ""}
                      </Text>

                      {ev.location ? (
                        <Text
                          style={[
                            styles.eventLocationText,
                            { color: colors.muted },
                          ]}
                        >
                          • Room {ev.location}
                        </Text>
                      ) : null}

                      {ev.instructor ? (
                        <Text
                          style={[
                            styles.eventLocationText,
                            { color: colors.muted },
                          ]}
                          numberOfLines={1}
                        >
                          • {ev.instructor}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  weekdayHeaderRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
  },
  weekdayHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  weekdayHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    marginTop: 6,
  },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    padding: 3,
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayNumberCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberText: {
    fontSize: 11,
  },
  eventsIndicatorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 6,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  overflowCount: {
    fontSize: 8,
    fontWeight: "700",
  },
  dayDetailsSection: {
    marginTop: 16,
  },
  dayDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  dayDetailsTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  noEventsBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 6,
  },
  noEventsText: {
    fontSize: 12,
  },
  eventList: {
    gap: 8,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  eventCardLeft: {
    flex: 1,
    gap: 3,
  },
  eventTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventTypeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  eventTimeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  eventLocationText: {
    fontSize: 11,
  },
});
