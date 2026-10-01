import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
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
  /** In-calendar month navigation, wired to the parent so every view stays in sync. */
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onGoToday?: () => void;
}

const WEEK_HEADERS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_HEADERS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthView({
  currentDate,
  selectedDateIso,
  onSelectDate,
  events,
  onEventPress,
  onAddEventForDate,
  onPrevMonth,
  onNextMonth,
  onGoToday,
}: MonthViewProps) {
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // Short weekday letters on narrow phones so the grid never wraps or stretches.
  const weekHeaders = windowWidth < 380 ? WEEK_HEADERS_SHORT : WEEK_HEADERS_FULL;

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

  const todayIso = formatDateIso(new Date());
  const now = new Date();
  const isViewingCurrentMonth =
    currentDate.getFullYear() === now.getFullYear() &&
    currentDate.getMonth() === now.getMonth();
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const monthLabel = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Events that belong to the visible month only (padding days excluded).
  const visibleMonthEventCount = useMemo(
    () =>
      gridCells.reduce(
        (sum, cell) =>
          cell.isCurrentMonth ? sum + (eventsByDate.get(cell.iso)?.length ?? 0) : sum,
        0,
      ),
    [gridCells, eventsByDate],
  );

  const selectedDayLabel = useMemo(() => {
    if (selectedDateIso === todayIso) return "Today";
    return new Date(
      Number(selectedDateIso.slice(0, 4)),
      Number(selectedDateIso.slice(5, 7)) - 1,
      Number(selectedDateIso.slice(8, 10)),
    ).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [selectedDateIso, todayIso]);

  const navBtn = (dir: "prev" | "next") => (
    <Pressable
      onPress={() => {
        triggerHaptic();
        if (dir === "prev") onPrevMonth?.();
        else onNextMonth?.();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={dir === "prev" ? "Previous month" : "Next month"}
      style={({ pressed }) => [
        styles.navBtn,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border,
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={dir === "prev" ? "chevron-left" : "chevron-right"}
        size={18}
        color={colors.text}
      />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Compact in-calendar month navigator (keeps the grid small + interactive) */}
      <View style={styles.navRow}>
        {navBtn("prev")}

        <Pressable
          onPress={() => {
            if (isViewingCurrentMonth) return;
            triggerHaptic();
            onGoToday?.();
          }}
          disabled={isViewingCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Jump to current month"
          style={styles.monthLabelWrap}
        >
          <Text style={[styles.monthLabel, { color: colors.text }]} numberOfLines={1}>
            {monthLabel}
          </Text>
          <Text style={[styles.monthSubLabel, { color: colors.muted }]}>
            {visibleMonthEventCount > 0
              ? `${visibleMonthEventCount} event${visibleMonthEventCount === 1 ? "" : "s"}`
              : "No events"}
            {!isViewingCurrentMonth ? " · tap for today" : ""}
          </Text>
        </Pressable>

        {navBtn("next")}
      </View>

      {/* Weekday Header */}
      <View style={styles.weekdayHeaderRow}>
        {weekHeaders.map((name, i) => (
          <View key={`${name}-${i}`} style={styles.weekdayHeaderCell}>
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

      {/* 7x5 or 7x6 Calendar Grid — re-animates whenever the month changes */}
      <Animated.View
        key={monthKey}
        entering={FadeIn.duration(180)}
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
              onLongPress={() => {
                if (!hasEvents) return;
                triggerHaptic();
                onAddEventForDate(cell.iso);
              }}
              delayLongPress={350}
              android_ripple={{ color: isDark ? colors.border : "#DBEAFE" }}
              accessibilityRole="button"
              accessibilityLabel={`${cell.iso}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
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

              {/* Event indicators: up to 2 dots, then a compact count badge */}
              <View style={styles.eventsIndicatorWrap}>
                {dayEvents.slice(0, 2).map((ev, idx) => {
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
                {dayEvents.length > 2 ? (
                  <Text style={[styles.overflowCount, { color: colors.muted }]}>
                    +{dayEvents.length - 2}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* Selected Day Agenda Drawer Below Grid */}
      <View style={styles.dayDetailsSection}>
        <View style={styles.dayDetailsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dayDetailsTitle, { color: colors.text }]}>
              {selectedDayLabel}
            </Text>
            <Text style={[styles.dayDetailsSub, { color: colors.muted }]}>
              {selectedDayEvents.length === 0
                ? "Nothing scheduled"
                : `${selectedDayEvents.length} item${
                    selectedDayEvents.length === 1 ? "" : "s"
                  } planned`}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onAddEventForDate(selectedDateIso);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add task for the selected day"
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
          // keyed on the selected day so switching dates replays the entry animation
          <Animated.View key={selectedDateIso} entering={FadeInUp.duration(200)} style={styles.eventList}>
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
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabelWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  monthSubLabel: {
    fontSize: 11,
    marginTop: 1,
  },
  dayDetailsSub: {
    fontSize: 12,
    marginTop: 2,
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
