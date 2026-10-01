import React, { useMemo, useRef } from "react";
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
  getWeekDays,
  formatTime12h,
  minutesFromMidnight,
  getCurrentTimeMinutes,
} from "../utils/dateUtils";
import { EVENT_TYPE_CONFIG, TIME_SLOTS_HOURLY } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onAddEventForDate: (iso: string) => void;
}

const HOUR_HEIGHT = 64;
const START_HOUR = 8; // 08:00
const TOTAL_HOURS = 10; // 08:00 to 18:00
const DAY_COLUMN_WIDTH = 100;
const TIME_GUTTER_WIDTH = 50;

export function WeekView({
  currentDate,
  events,
  onEventPress,
  onAddEventForDate,
}: WeekViewProps) {
  const { colors, isDark } = useTheme();
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Map events by date (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const existing = map.get(ev.date) ?? [];
      existing.push(ev);
      map.set(ev.date, existing);
    }
    return map;
  }, [events]);

  // Current time line calculation
  const currentMinutes = getCurrentTimeMinutes();
  const showCurrentTime =
    currentMinutes >= START_HOUR * 60 &&
    currentMinutes <= (START_HOUR + TOTAL_HOURS) * 60;
  const currentTimeTop =
    ((currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  return (
    <View style={styles.container}>
      {/* Horizontal Scroll for the Week Columns */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: "100%" }}
      >
        <View>
          {/* Weekday Column Headers */}
          <View
            style={[
              styles.headerRow,
              {
                borderBottomColor: isDark ? colors.border : "#E2E8F0",
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
              },
            ]}
          >
            {/* Corner spacer for time gutter */}
            <View style={{ width: TIME_GUTTER_WIDTH }} />

            {weekDays.map((wd) => (
              <Pressable
                key={wd.iso}
                onPress={() => onAddEventForDate(wd.iso)}
                style={[
                  styles.dayHeaderCell,
                  { width: DAY_COLUMN_WIDTH },
                  wd.isToday && {
                    backgroundColor: isDark
                      ? colors.primarySoft
                      : "#EFF6FF",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayHeaderShort,
                    {
                      color: wd.isToday ? colors.primary : colors.muted,
                      fontWeight: wd.isToday ? "700" : "600",
                    },
                  ]}
                >
                  {wd.dayShort}
                </Text>
                <View
                  style={[
                    styles.dayHeaderNumWrap,
                    wd.isToday && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayHeaderNum,
                      {
                        color: wd.isToday ? "#FFFFFF" : colors.text,
                        fontWeight: wd.isToday ? "800" : "600",
                      },
                    ]}
                  >
                    {wd.dayNumber}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Timetable Body (Time rows + Events per day column) */}
          <ScrollView
            style={styles.timelineScrollView}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.gridBody,
                {
                  height: TOTAL_HOURS * HOUR_HEIGHT,
                  backgroundColor: isDark ? colors.bg : "#FAFAFA",
                },
              ]}
            >
              {/* Horizontal Hour Lines & Time Labels */}
              {TIME_SLOTS_HOURLY.map((slot, index) => (
                <View
                  key={slot}
                  style={[
                    styles.hourRow,
                    {
                      top: index * HOUR_HEIGHT,
                      borderTopColor: isDark ? colors.border : "#F1F5F9",
                    },
                  ]}
                >
                  <View style={[styles.timeLabelWrap, { width: TIME_GUTTER_WIDTH }]}>
                    <Text style={[styles.timeLabelText, { color: colors.muted }]}>
                      {formatTime12h(slot)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.hourLine,
                      {
                        backgroundColor: isDark ? colors.border : "#F1F5F9",
                        width: DAY_COLUMN_WIDTH * 7,
                      },
                    ]}
                  />
                </View>
              ))}

              {/* Day Vertical Columns & Events */}
              <View style={styles.columnsOverlay}>
                <View style={{ width: TIME_GUTTER_WIDTH }} />

                {weekDays.map((wd) => {
                  const dayEvents = eventsByDate.get(wd.iso) ?? [];

                  return (
                    <View
                      key={wd.iso}
                      style={[
                        styles.dayColumn,
                        {
                          width: DAY_COLUMN_WIDTH,
                          borderRightColor: isDark
                            ? colors.border
                            : "#F1F5F9",
                        },
                      ]}
                    >
                      {/* Render event blocks */}
                      {dayEvents.map((ev) => {
                        const startMin = minutesFromMidnight(ev.start_time);
                        const endMin = ev.end_time
                          ? minutesFromMidnight(ev.end_time)
                          : startMin + 50;

                        // Calculate offset and height relative to START_HOUR
                        const top = Math.max(
                          0,
                          ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT
                        );
                        const durationMinutes = Math.max(30, endMin - startMin);
                        const height = Math.max(
                          34,
                          (durationMinutes / 60) * HOUR_HEIGHT - 4
                        );

                        const cfg =
                          EVENT_TYPE_CONFIG[ev.event_type] ??
                          EVENT_TYPE_CONFIG.OTHER;
                        const bgTone = isDark ? cfg.bgDark : cfg.bgLight;
                        const accent = isDark ? cfg.darkColor : cfg.lightColor;

                        return (
                          <Pressable
                            key={ev.id}
                            onPress={() => {
                              triggerHaptic();
                              onEventPress(ev);
                            }}
                            style={({ pressed }) => [
                              styles.eventBlock,
                              {
                                top,
                                height,
                                backgroundColor: bgTone,
                                borderLeftColor: accent,
                                opacity: pressed ? 0.8 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.blockTitle,
                                {
                                  color: accent,
                                  textDecorationLine: ev.is_cancelled
                                    ? "line-through"
                                    : "none",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {ev.course_code ?? ev.title}
                            </Text>
                            <Text
                              style={[
                                styles.blockTime,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {formatTime12h(ev.start_time)}
                            </Text>
                            {ev.location ? (
                              <Text
                                style={[
                                  styles.blockRoom,
                                  { color: colors.muted },
                                ]}
                                numberOfLines={1}
                              >
                                R: {ev.location}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {/* Red "NOW" Line if today */}
                      {wd.isToday && showCurrentTime ? (
                        <View
                          style={[
                            styles.currentTimeIndicator,
                            { top: currentTimeTop },
                          ]}
                        >
                          <View style={styles.currentTimeDot} />
                          <View style={styles.currentTimeLine} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  dayHeaderCell: {
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  dayHeaderShort: {
    fontSize: 11,
    textTransform: "uppercase",
  },
  dayHeaderNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dayHeaderNum: {
    fontSize: 13,
  },
  timelineScrollView: {
    maxHeight: 460,
  },
  gridBody: {
    position: "relative",
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timeLabelWrap: {
    paddingRight: 6,
    alignItems: "flex-end",
    transform: [{ translateY: -7 }],
  },
  timeLabelText: {
    fontSize: 10,
    fontWeight: "600",
  },
  hourLine: {
    height: 0.8,
  },
  columnsOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  dayColumn: {
    height: "100%",
    borderRightWidth: 0.8,
    position: "relative",
    paddingHorizontal: 2,
  },
  eventBlock: {
    position: "absolute",
    left: 3,
    right: 3,
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: "800",
  },
  blockTime: {
    fontSize: 9,
    fontWeight: "600",
  },
  blockRoom: {
    fontSize: 9,
  },
  currentTimeIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
    marginLeft: -4,
  },
  currentTimeLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: "#DC2626",
  },
});
