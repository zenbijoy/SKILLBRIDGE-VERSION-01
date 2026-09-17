import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, Layout } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { EventItem, Room, Session } from "@/types";
import {
  Button,
  Card,
  Empty,
  Field,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { SessionReplayModal } from "@/components/SessionReplayModal";

export type RoutineSlot = {
  id: string;
  courseName: string;
  dayOfWeek: string;
  timeSlot: string;
  roomOrBuilding: string;
};

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ROUTINE_STORAGE_KEY = "@skillbridge_my_routine";

const DEFAULT_ROUTINE: RoutineSlot[] = [
  {
    id: "slot-1",
    courseName: "CSE220: Data Structures & Algorithms",
    dayOfWeek: "Sunday",
    timeSlot: "10:00 AM - 11:30 AM",
    roomOrBuilding: "Room 402, Academic Bldg 2",
  },
  {
    id: "slot-2",
    courseName: "MAT120: Integral Calculus & Differential Eq.",
    dayOfWeek: "Tuesday",
    timeSlot: "01:30 PM - 03:00 PM",
    roomOrBuilding: "Science Complex, Hall B",
  },
  {
    id: "slot-3",
    courseName: "PHY102: Physics Lab & Mechanics",
    dayOfWeek: "Thursday",
    timeSlot: "11:30 AM - 01:00 PM",
    roomOrBuilding: "Physics Lab 3",
  },
];

type ScheduleItem = {
  id: string;
  kind: "session" | "room" | "event";
  title: string;
  subtitle?: string;
  startsAt: string;
  locationOrUrl?: string;
  status: string;
  mode?: string;
  roomId?: string;
  recordingUrl?: string | null;
  recordingVideoId?: string | null;
  recordingDuration?: number | null;
};

const FILTERS = [
  { key: "all", label: "🗓️ All Events" },
  { key: "sessions", label: "👥 Peer Classes" },
  { key: "rooms", label: "🏫 Study Rooms" },
  { key: "events", label: "🎪 Club Seminars" },
];

export default function Schedule() {
  const { colors } = useTheme();
  const { t, language } = useI18n();

  // Active view: My Class Routine vs Live Timeline
  const [activeView, setActiveView] = useState<"routine" | "live">("routine");

  // Selected Day Filter ("all" or one of DAYS_OF_WEEK)
  const todayDayName = DAYS_OF_WEEK[new Date().getDay()];
  const [selectedDay, setSelectedDay] = useState<string>("all");

  // Personal Class Routine State
  const [routineSlots, setRoutineSlots] = useState<RoutineSlot[]>(DEFAULT_ROUTINE);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add routine slot form fields
  const [newCourseName, setNewCourseName] = useState("");
  const [newDay, setNewDay] = useState("Sunday");
  const [newTimeSlot, setNewTimeSlot] = useState("");
  const [newRoom, setNewRoom] = useState("");

  // Live schedule filter
  const [filter, setFilter] = useState("all");

  // Load routine from storage
  useEffect(() => {
    AsyncStorage.getItem(ROUTINE_STORAGE_KEY)
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRoutineSlots(parsed);
            }
          } catch {
            // Ignored
          }
        }
      })
      .catch(() => {});
  }, []);

  const saveRoutineToStorage = async (slots: RoutineSlot[]) => {
    try {
      await AsyncStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(slots));
    } catch {
      // Ignored
    }
  };

  const handleAddRoutineSlot = () => {
    if (!newCourseName.trim()) return;
    triggerHaptic();

    const newSlot: RoutineSlot = {
      id: `slot-${Date.now()}`,
      courseName: newCourseName.trim(),
      dayOfWeek: newDay,
      timeSlot: newTimeSlot.trim() || "10:00 AM - 11:30 AM",
      roomOrBuilding: newRoom.trim() || "Campus Lecture Hall",
    };

    const updated = [...routineSlots, newSlot];
    setRoutineSlots(updated);
    saveRoutineToStorage(updated);

    setNewCourseName("");
    setNewTimeSlot("");
    setNewRoom("");
    setIsAddModalOpen(false);
  };

  const handleDeleteSlot = (id: string) => {
    triggerHaptic();
    Alert.alert(
      language === "bn" ? "ক্লাস মুছে ফেলতে চান?" : "Delete Class?",
      language === "bn" ? "এই ক্লাসটি আপনার রুটিন থেকে সরানো হবে।" : "This class will be removed from your routine.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("schedule.deleteSlot", "Remove"),
          style: "destructive",
          onPress: () => {
            const updated = routineSlots.filter((s) => s.id !== id);
            setRoutineSlots(updated);
            saveRoutineToStorage(updated);
          },
        },
      ]
    );
  };

  // Queries for real-time rooms & sessions
  const sessionsQuery = useQuery({
    queryKey: ["sessions-mine"],
    queryFn: () => api<{ sessions: Session[] }>("/sessions/mine"),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms-schedule"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms?limit=30"),
  });

  const eventsQuery = useQuery({
    queryKey: ["events-schedule"],
    queryFn: () => api<{ events: EventItem[] }>("/events"),
  });

  const isLoading = sessionsQuery.isLoading || roomsQuery.isLoading || eventsQuery.isLoading;

  // Merge live items
  const liveItems: ScheduleItem[] = [];

  for (const s of sessionsQuery.data?.sessions ?? []) {
    liveItems.push({
      id: `session-${s.id}`,
      kind: "session",
      title: `Peer Session: ${s.mode.toUpperCase()}`,
      subtitle: s.campus_location || s.meeting_url || "Online room",
      startsAt: s.starts_at,
      locationOrUrl: s.meeting_url || s.campus_location || undefined,
      status: s.status,
      mode: s.mode,
      roomId: s.room_id,
      recordingUrl: s.recording_url,
      recordingVideoId: s.recording_video_id,
      recordingDuration: s.recording_duration_seconds,
    });
  }

  for (const r of roomsQuery.data?.rooms ?? []) {
    if (r.scheduled_at) {
      liveItems.push({
        id: `room-${r.id}`,
        kind: "room",
        title: `Room: ${r.title}`,
        subtitle: `Topic: ${r.topic} · ${r.member_count} members`,
        startsAt: r.scheduled_at,
        locationOrUrl: r.campus_location || "LiveKit Classroom",
        status: r.status,
        mode: r.mode,
        roomId: r.id,
      });
    }
  }

  for (const e of eventsQuery.data?.events ?? []) {
    liveItems.push({
      id: `event-${e.id}`,
      kind: "event",
      title: `Seminar: ${e.title}`,
      subtitle: e.description,
      startsAt: e.starts_at,
      locationOrUrl: e.location || "Campus Auditorium",
      status: e.status,
      mode: e.location ? "offline" : "online",
    });
  }

  liveItems.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const filteredLiveItems = liveItems.filter((item) => {
    if (filter === "sessions") return item.kind === "session";
    if (filter === "rooms") return item.kind === "room";
    if (filter === "events") return item.kind === "event";
    return true;
  });

  const filteredRoutineSlots = useMemo(() => {
    if (selectedDay === "all") return routineSlots;
    return routineSlots.filter((slot) => slot.dayOfWeek === selectedDay);
  }, [routineSlots, selectedDay]);

  const [activeReplay, setActiveReplay] = useState<{
    visible: boolean;
    title: string;
    videoId?: string | null;
    recordingUrl?: string | null;
    durationSeconds?: number | null;
  }>({ visible: false, title: "" });

  return (
    <Screen>
      <H1>{t("schedule.title", "Campus Calendar & Routine 📅")}</H1>
      <Muted>
        {t("schedule.subtitle", "Personal class routine & real-time study sessions")}
      </Muted>

      {/* Main View Segmented Toggle */}
      <View style={[s.viewToggleContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            setActiveView("routine");
          }}
          style={[
            s.viewTab,
            activeView === "routine" && [s.activeViewTab, { backgroundColor: colors.primary }],
          ]}
        >
          <MaterialCommunityIcons
            name="calendar-account"
            size={16}
            color={activeView === "routine" ? "#FFFFFF" : colors.muted}
          />
          <Text
            style={[
              s.viewTabText,
              { color: activeView === "routine" ? "#FFFFFF" : colors.muted },
              activeView === "routine" && s.activeViewTabText,
            ]}
          >
            {t("schedule.myRoutine", "My Class Timetable")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            setActiveView("live");
          }}
          style={[
            s.viewTab,
            activeView === "live" && [s.activeViewTab, { backgroundColor: colors.primary }],
          ]}
        >
          <MaterialCommunityIcons
            name="broadcast"
            size={16}
            color={activeView === "live" ? "#FFFFFF" : colors.muted}
          />
          <Text
            style={[
              s.viewTabText,
              { color: activeView === "live" ? "#FFFFFF" : colors.muted },
              activeView === "live" && s.activeViewTabText,
            ]}
          >
            {t("schedule.liveSchedule", "Live Rooms & Events")}
          </Text>
        </Pressable>
      </View>

      {/* Day of Week Calendar Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.dayStripContainer}
      >
        <Pressable
          onPress={() => {
            triggerHaptic();
            setSelectedDay("all");
          }}
          style={[
            s.dayChip,
            {
              backgroundColor: selectedDay === "all" ? colors.primary : colors.surface,
              borderColor: selectedDay === "all" ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              s.dayChipText,
              { color: selectedDay === "all" ? "#FFFFFF" : colors.text, fontWeight: selectedDay === "all" ? "800" : "600" },
            ]}
          >
            {language === "bn" ? "সকল দিন" : "All Days"}
          </Text>
        </Pressable>

        {DAYS_OF_WEEK.map((day) => {
          const isSelected = selectedDay === day;
          const isToday = day === todayDayName;
          const dayShort = language === "bn" ? day.slice(0, 3) : day.slice(0, 3);

          return (
            <Pressable
              key={day}
              onPress={() => {
                triggerHaptic();
                setSelectedDay(day);
              }}
              style={[
                s.dayChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : isToday ? colors.primary : colors.border,
                  borderWidth: isToday ? 2 : 1,
                },
              ]}
            >
              <Text
                style={[
                  s.dayChipText,
                  { color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text, fontWeight: isSelected || isToday ? "800" : "600" },
                ]}
              >
                {dayShort}
                {isToday && !isSelected ? " •" : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* VIEW 1: MY CLASS ROUTINE TIMETABLE */}
      {activeView === "routine" && (
        <View style={{ gap: 12 }}>
          {/* Header Row with Add Class Button */}
          <Row style={s.sectionActionRow}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="book-clock-outline" size={20} color={colors.primary} />
              <Text style={[s.sectionHeading, { color: colors.text }]}>
                {selectedDay === "all"
                  ? t("schedule.myRoutine", "My Class Timetable")
                  : `${selectedDay} Classes`}
              </Text>
            </Row>

            <Pressable
              onPress={() => {
                triggerHaptic();
                setIsAddModalOpen(true);
              }}
              style={[s.addClassBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              <Text style={s.addClassBtnText}>{t("schedule.addRoutine", "Add Class")}</Text>
            </Pressable>
          </Row>

          {filteredRoutineSlots.map((slot, idx) => (
            <Animated.View
              key={slot.id}
              entering={FadeInUp.delay(idx * 60).springify()}
              layout={Layout.springify()}
            >
              <Card tone="soft" style={s.routineCard}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row style={{ alignItems: "center", gap: 6 }}>
                      <Pill tone="primary">{slot.dayOfWeek}</Pill>
                    </Row>
                    <Text style={[s.courseTitle, { color: colors.text }]}>
                      {slot.courseName}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleDeleteSlot(slot.id)}
                    hitSlop={8}
                    style={s.deleteSlotBtn}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.muted} />
                  </Pressable>
                </Row>

                <Row style={{ alignItems: "center", gap: 14, marginTop: 8 }}>
                  <View style={s.timeRow}>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={15} color={colors.primary} />
                    <Text style={[s.slotMetaText, { color: colors.text }]}>{slot.timeSlot}</Text>
                  </View>

                  <View style={s.timeRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.muted} />
                    <Text style={[s.slotMetaText, { color: colors.muted }]}>{slot.roomOrBuilding}</Text>
                  </View>
                </Row>
              </Card>
            </Animated.View>
          ))}

          {filteredRoutineSlots.length === 0 && (
            <Empty
              icon="calendar-plus"
              title={language === "bn" ? "কোনো ক্লাস নেই" : "No Classes Added"}
              detail={t("schedule.noRoutineYet", "No classes added yet. Tap 'Add Class' to set up your routine!")}
              actionTitle={t("schedule.addRoutine", "Add Class")}
              onAction={() => setIsAddModalOpen(true)}
            />
          )}
        </View>
      )}

      {/* VIEW 2: LIVE SCHEDULE (PEER CLASSES, ROOMS, EVENTS) */}
      {activeView === "live" && (
        <View style={{ gap: 12 }}>
          {/* Filter Tabs */}
          <View style={s.filterBar}>
            {FILTERS.map((f) => {
              const selected = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    triggerHaptic();
                    setFilter(f.key);
                  }}
                  style={[
                    s.filterTab,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface2,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? "#FFFFFF" : colors.text,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {isLoading ? (
            <>
              <Skeleton height={110} />
              <Skeleton height={110} />
            </>
          ) : null}

          {filteredLiveItems.map((item, idx) => {
            const isLive = item.status === "live";
            const isCompleted = item.status === "completed";
            const hasRecording = Boolean(item.recordingVideoId || item.recordingUrl);
            const dateStr = new Date(item.startsAt).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const timeStr = new Date(item.startsAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <Animated.View key={item.id} entering={FadeInUp.delay(idx * 60).springify()}>
                <Card tone={isLive ? "glow" : "soft"}>
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row>
                      <Pill tone={isLive ? "danger" : isCompleted ? "success" : item.kind === "event" ? "accent" : "primary"}>
                        {isLive ? "● LIVE NOW" : item.status ? item.status.toUpperCase() : item.kind.toUpperCase()}
                      </Pill>
                      {item.mode ? <Pill>{item.mode}</Pill> : null}
                    </Row>
                    <Text style={[s.dateTag, { color: colors.primary }]}>{dateStr}</Text>
                  </Row>

                  <View style={{ gap: 4, marginTop: 4 }}>
                    <Text style={[s.itemTitle, { color: colors.text }]}>{item.title}</Text>
                    {item.subtitle ? <Muted numberOfLines={2}>{item.subtitle}</Muted> : null}
                  </View>

                  <Row style={{ alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <View style={s.timeRow}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={colors.muted} />
                      <Text style={[s.timeText, { color: colors.text }]}>{timeStr}</Text>
                    </View>

                    <Row style={{ gap: 8 }}>
                      {hasRecording ? (
                        <Button
                          title="▶ Watch Recording"
                          compact
                          variant="primary"
                          onPress={() => {
                            triggerHaptic();
                            setActiveReplay({
                              visible: true,
                              title: item.title,
                              videoId: item.recordingVideoId,
                              recordingUrl: item.recordingUrl,
                              durationSeconds: item.recordingDuration,
                            });
                          }}
                        />
                      ) : null}

                      {item.roomId && !isCompleted ? (
                        <Button
                          title={isLive ? "Join Live Class →" : "View Room →"}
                          compact
                          variant={isLive ? "primary" : "secondary"}
                          onPress={() => {
                            triggerHaptic();
                            if (isLive) {
                              router.push(`/live/${item.roomId}` as any);
                            } else {
                              router.push(`/room/${item.roomId}` as any);
                            }
                          }}
                        />
                      ) : item.locationOrUrl?.startsWith("http") ? (
                        <Button
                          title="Open Link ↗"
                          compact
                          variant="secondary"
                          onPress={() => {
                            Linking.openURL(item.locationOrUrl!).catch(() => undefined);
                          }}
                        />
                      ) : null}
                    </Row>
                  </Row>
                </Card>
              </Animated.View>
            );
          })}

          {filteredLiveItems.length === 0 && !isLoading ? (
            <Empty
              icon="calendar-clock"
              title="No upcoming events"
              detail="No scheduled classes, rooms, or seminars match this filter."
            />
          ) : null}
        </View>
      )}

      {/* Add Class Routine Modal */}
      <Modal
        visible={isAddModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsAddModalOpen(false)} />
          <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="calendar-plus" size={22} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text }]}>
                  {t("schedule.addRoutine", "Add Class Routine")}
                </Text>
              </Row>
              <Pressable onPress={() => setIsAddModalOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Field
              label={t("schedule.courseName", "Course / Subject Name")}
              placeholder={t("schedule.coursePlaceholder", "e.g. Data Structures & Algorithms")}
              value={newCourseName}
              onChangeText={setNewCourseName}
            />

            {/* Day Selector Chips */}
            <View style={{ marginVertical: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 6 }}>
                {t("schedule.dayOfWeek", "Day of Week")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {DAYS_OF_WEEK.map((d) => {
                  const isSel = newDay === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setNewDay(d)}
                      style={[
                        s.daySelectChip,
                        {
                          backgroundColor: isSel ? colors.primary : colors.surface2,
                          borderColor: isSel ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: isSel ? "#FFFFFF" : colors.text, fontSize: 12, fontWeight: "700" }}>
                        {d.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Field
              label={t("schedule.timeSlot", "Time Slot")}
              placeholder={t("schedule.timePlaceholder", "e.g. 10:00 AM - 11:30 AM")}
              value={newTimeSlot}
              onChangeText={setNewTimeSlot}
            />

            <Field
              label={t("schedule.roomOrBuilding", "Classroom / Building")}
              placeholder={t("schedule.roomPlaceholder", "e.g. Room 302, Science Complex")}
              value={newRoom}
              onChangeText={setNewRoom}
            />

            <Row style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button
                title={t("common.cancel")}
                variant="ghost"
                onPress={() => setIsAddModalOpen(false)}
              />
              <Button
                title={t("schedule.saveRoutine", "Save to Routine")}
                variant="primary"
                disabled={!newCourseName.trim()}
                onPress={handleAddRoutineSlot}
              />
            </Row>
          </View>
        </View>
      </Modal>

      <SessionReplayModal
        visible={activeReplay.visible}
        title={activeReplay.title}
        videoId={activeReplay.videoId}
        recordingUrl={activeReplay.recordingUrl}
        durationSeconds={activeReplay.durationSeconds}
        onClose={() => setActiveReplay((prev) => ({ ...prev, visible: false }))}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  viewToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    marginVertical: 8,
  },
  viewTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  activeViewTab: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  viewTabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  activeViewTabText: {
    fontWeight: "900",
  },
  dayStripContainer: {
    gap: 6,
    paddingVertical: 4,
    marginBottom: 10,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dayChipText: {
    fontSize: 12,
  },
  sectionActionRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "800",
  },
  addClassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  addClassBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  routineCard: {
    padding: 12,
    gap: 6,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  deleteSlotBtn: {
    padding: 4,
  },
  slotMetaText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  dateTag: {
    fontSize: 12,
    fontWeight: "900",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  daySelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
