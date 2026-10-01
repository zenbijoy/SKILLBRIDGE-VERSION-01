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
  isCurrentlyActive,
  minutesFromMidnight,
  getCurrentTimeMinutes,
} from "../utils/dateUtils";
import { EVENT_TYPE_CONFIG, TIME_SLOTS_HOURLY } from "../constants";
import { triggerHaptic } from "@/components/ui";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onAddEventForDate: (iso: string) => void;
}

const HOUR_HEIGHT = 76;
const START_HOUR = 8;
const TOTAL_HOURS = 10;

export function DayView({
  currentDate,
  events,
  onEventPress,
  onAddEventForDate,
}: DayViewProps) {
  const { colors, isDark } = useTheme();
  const dateIso = formatDateIso(currentDate);
  const isToday = dateIso === formatDateIso(new Date());

  const dayEvents = useMemo(() => {
    return events
      .filter((ev) => ev.date === dateIso)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events, dateIso]);

  // Current time position
  const currentMinutes = getCurrentTimeMinutes();
  const showCurrentTime =
    isToday &&
    currentMinutes >= START_HOUR * 60 &&
    currentMinutes <= (START_HOUR + TOTAL_HOURS) * 60;
  const currentTimeTop =
    ((currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Day Overview Banner */}
      <View
        style={[
          styles.overviewBanner,
          {
            backgroundColor: isDark ? colors.surface : "#FFFFFF",
            borderColor: isDark ? colors.border : "#E2E8F0",
          },
        ]}
      >
        <View>
          <Text style={[styles.dayName, { color: colors.text }]}>
            {currentDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
          <Text style={[styles.eventCountText, { color: colors.muted }]}>
            {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}{" "}
            scheduled
          </Text>
        </View>

        <Pressable
          onPress={() => onAddEventForDate(dateIso)}
          style={({ pressed }) => [
            styles.addSlotBtn,
            {
              backgroundColor: colors.primarySoft,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
          <Text style={[styles.addSlotText, { color: colors.primary }]}>
            Add Event
          </Text>
        </Pressable>
      </View>

      {/* Vertical Timeline Body */}
      <View
        style={[
          styles.timelineContainer,
          {
            height: TOTAL_HOURS * HOUR_HEIGHT,
            backgroundColor: isDark ? colors.bg : "#FAFAFA",
            borderColor: isDark ? colors.border : "#E2E8F0",
          },
        ]}
      >
        {/* Hour Guide Lines */}
        {TIME_SLOTS_HOURLY.map((slot, index) => (
          <View
            key={slot}
            style={[
              styles.hourGuideRow,
              {
                top: index * HOUR_HEIGHT,
                borderTopColor: isDark ? colors.border : "#F1F5F9",
              },
            ]}
          >
            <View style={styles.timeLabelBox}>
              <Text style={[styles.timeLabel, { color: colors.muted }]}>
                {formatTime12h(slot)}
              </Text>
            </View>
            <View
              style={[
                styles.guideLine,
                { backgroundColor: isDark ? colors.border : "#F1F5F9" },
              ]}
            />
          </View>
        ))}

        {/* Live Red Current Time Line */}
        {showCurrentTime ? (
          <View
            style={[
              styles.currentTimeLineWrap,
              { top: currentTimeTop },
            ]}
          >
            <View style={styles.nowBadge}>
              <Text style={styles.nowBadgeText}>NOW</Text>
            </View>
            <View style={styles.nowLine} />
          </View>
        ) : null}

        {/* Events Overlay */}
        <View style={styles.eventsOverlay}>
          {dayEvents.map((ev) => {
            const startMin = minutesFromMidnight(ev.start_time);
            const endMin = ev.end_time
              ? minutesFromMidnight(ev.end_time)
              : startMin + 50;

            const top = Math.max(
              0,
              ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT
            );
            const duration = Math.max(35, endMin - startMin);
            const height = Math.max(48, (duration / 60) * HOUR_HEIGHT - 6);

            const active = isCurrentlyActive(
              ev.start_time,
              ev.end_time ?? ev.start_time,
              ev.date
            );

            const cfg =
              EVENT_TYPE_CONFIG[ev.event_type] ?? EVENT_TYPE_CONFIG.OTHER;
            const accent = isDark ? cfg.darkColor : cfg.lightColor;
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
                    top,
                    height,
                    backgroundColor: isDark ? colors.surface : "#FFFFFF",
                    borderColor: active
                      ? colors.primary
                      : isDark
                      ? colors.border
                      : "#E2E8F0",
                    borderLeftColor: active ? "#DC2626" : accent,
                    borderLeftWidth: active ? 5 : 4,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleWrap}>
                    <View
                      style={[
                        styles.typeBadge,
                        { backgroundColor: bgTone },
                      ]}
                    >
                      <Text style={[styles.typeText, { color: accent }]}>
                        {cfg.label}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.cardTitle,
                        {
                          color: colors.text,
                          textDecorationLine: ev.is_cancelled
                            ? "line-through"
                            : "none",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {ev.course_code ? `${ev.course_code} • ` : ""}
                      {ev.title}
                    </Text>
                  </View>

                  {active ? (
                    <View style={styles.cardNowBadge}>
                      <View style={styles.pulseDot} />
                      <Text style={styles.cardNowText}>ACTIVE NOW</Text>
                    </View>
                  ) : (
                    <Text style={[styles.cardTimeRange, { color: colors.muted }]}>
                      {formatTime12h(ev.start_time)} -{" "}
                      {formatTime12h(ev.end_time)}
                    </Text>
                  )}
                </View>

                <View style={styles.cardMetaRow}>
                  {ev.location ? (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons
                        name="door"
                        size={13}
                        color={colors.muted}
                      />
                      <Text style={[styles.metaText, { color: colors.muted }]}>
                        Room {ev.location}
                      </Text>
                    </View>
                  ) : null}

                  {ev.instructor ? (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={13}
                        color={colors.muted}
                      />
                      <Text
                        style={[styles.metaText, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {ev.instructor}
                      </Text>
                    </View>
                  ) : null}

                  {ev.priority ? (
                    <View
                      style={[
                        styles.priorityPill,
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
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: 20,
  },
  overviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  dayName: {
    fontSize: 16,
    fontWeight: "800",
  },
  eventCountText: {
    fontSize: 12,
    marginTop: 2,
  },
  addSlotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  addSlotText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timelineContainer: {
    position: "relative",
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  hourGuideRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timeLabelBox: {
    width: 65,
    paddingRight: 8,
    alignItems: "flex-end",
    transform: [{ translateY: -7 }],
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  guideLine: {
    flex: 1,
    height: 0.8,
  },
  currentTimeLineWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  nowBadge: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 15,
  },
  nowBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  nowLine: {
    flex: 1,
    height: 1.8,
    backgroundColor: "#DC2626",
  },
  eventsOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 70,
    right: 8,
  },
  eventCard: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 8,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  cardNowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#DC2626",
  },
  cardNowText: {
    color: "#DC2626",
    fontSize: 9,
    fontWeight: "800",
  },
  cardTimeRange: {
    fontSize: 10,
    fontWeight: "600",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
  priorityPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: "800",
  },
});
