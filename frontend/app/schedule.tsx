import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import {
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  UpcomingWidget,
  ImportRoutineModal,
  RoutineVerificationModal,
  ManualClassModal,
  CreateTaskModal,
  EventDetailsModal,
  PublicRoutineDiscoveryModal,
  AcademicProfileModal,
  PreferencesModal,
  formatDateIso,
  parseIsoDate,
  type CalendarEvent,
  type AcademicProfile,
  type AcademicRoutine,
  type UpcomingSummary,
  type RoutineEntry,
} from "@/features/calendar";
import { triggerHaptic } from "@/components/ui";

type CalendarViewMode = "month" | "week" | "day" | "agenda";

const FILTER_OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: "ALL", label: "All", icon: "view-grid-outline" },
  { key: "CLASSES", label: "Classes & Labs", icon: "book-open-outline" },
  { key: "ASSIGNMENT", label: "Assignments", icon: "clipboard-text-outline" },
  { key: "QUIZ", label: "Quizzes", icon: "help-circle-outline" },
  { key: "EXAM", label: "Exams", icon: "alert-decagram-outline" },
  { key: "PERSONAL_TASK", label: "Tasks", icon: "checkbox-marked-circle-outline" },
];

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  // Active view: Month | Week | Day | Agenda
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");

  // Current focal date
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    formatDateIso(new Date())
  );

  // Filter and search
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [verificationRoutine, setVerificationRoutine] =
    useState<AcademicRoutine | null>(null);
  const [isManualClassModalOpen, setIsManualClassModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [createTaskDateIso, setCreateTaskDateIso] = useState<string | undefined>(
    undefined
  );
  const [selectedEventDetails, setSelectedEventDetails] =
    useState<CalendarEvent | null>(null);
  const [editingTask, setEditingTask] = useState<CalendarEvent | null>(null);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);

  // 1. Fetch Academic Profile
  const profileQuery = useQuery({
    queryKey: ["calendar-academic-profile"],
    queryFn: () =>
      api<{ profile: AcademicProfile }>("/calendar/academic-profile"),
    staleTime: 60_000,
  });
  const profile = profileQuery.data?.profile ?? null;

  // 2. Fetch Upcoming Summary for "What's Next?" widget
  const upcomingQuery = useQuery({
    queryKey: ["calendar-upcoming"],
    queryFn: () => api<UpcomingSummary>("/calendar/upcoming"),
    refetchInterval: 30_000,
  });
  const upcomingSummary = upcomingQuery.data ?? null;

  // 3. Compute date range for active view
  const { startDateIso, endDateIso } = useMemo(() => {
    const today = new Date(currentDate);

    if (viewMode === "month") {
      // Month range with padding
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      first.setDate(first.getDate() - 7);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      last.setDate(last.getDate() + 7);
      return {
        startDateIso: formatDateIso(first),
        endDateIso: formatDateIso(last),
      };
    } else if (viewMode === "week") {
      const sun = new Date(today);
      sun.setDate(today.getDate() - today.getDay());
      const sat = new Date(sun);
      sat.setDate(sun.getDate() + 6);
      return {
        startDateIso: formatDateIso(sun),
        endDateIso: formatDateIso(sat),
      };
    } else if (viewMode === "day") {
      return {
        startDateIso: selectedDateIso,
        endDateIso: selectedDateIso,
      };
    } else {
      // Agenda: 30 days from today
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setDate(now.getDate() + 35);
      return {
        startDateIso: formatDateIso(now),
        endDateIso: formatDateIso(nextMonth),
      };
    }
  }, [currentDate, viewMode, selectedDateIso]);

  // 4. Fetch Calendar Events
  const eventsQuery = useQuery({
    queryKey: [
      "calendar-events",
      startDateIso,
      endDateIso,
      selectedFilter,
      searchQuery,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append("startDate", startDateIso);
      params.append("endDate", endDateIso);
      if (selectedFilter !== "ALL") {
        params.append("type", selectedFilter);
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }
      return api<{ events: CalendarEvent[] }>(
        `/calendar/events?${params.toString()}`
      );
    },
  });
  const events = eventsQuery.data?.events ?? [];

  // 5. Fetch Active Routines to check if user has any routine configured
  const routinesQuery = useQuery({
    queryKey: ["calendar-routines"],
    queryFn: () => api<{ routines: AcademicRoutine[] }>("/calendar/routines"),
  });
  const hasActiveRoutine = (routinesQuery.data?.routines ?? []).some(
    (r) => r.is_active
  );

  // Date Navigation Handlers
  const handlePrevDate = () => {
    triggerHaptic();
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
      setSelectedDateIso(formatDateIso(next));
    }
    setCurrentDate(next);
  };

  const handleNextDate = () => {
    triggerHaptic();
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
      setSelectedDateIso(formatDateIso(next));
    }
    setCurrentDate(next);
  };

  const handleGoToday = () => {
    triggerHaptic();
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateIso(formatDateIso(now));
  };

  // Header Title text based on active view
  const headerDateText = useMemo(() => {
    if (viewMode === "month") {
      return currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } else if (viewMode === "week") {
      const sun = new Date(currentDate);
      sun.setDate(currentDate.getDate() - currentDate.getDay());
      const sat = new Date(sun);
      sat.setDate(sun.getDate() + 6);
      return `${sun.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${sat.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
    } else if (viewMode === "day") {
      return parseIsoDate(selectedDateIso).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } else {
      return "Upcoming Agenda";
    }
  }, [currentDate, viewMode, selectedDateIso]);

  // Event Action Handlers
  const handleToggleTaskComplete = async (event: CalendarEvent) => {
    try {
      await api(`/calendar/events/${event.id}/toggle`, { method: "PATCH" });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update task.");
    }
  };

  const handleSaveTask = async (taskData: Partial<CalendarEvent>) => {
    try {
      if (taskData.id) {
        await api(`/calendar/events/${taskData.id}`, {
          method: "PUT",
          body: JSON.stringify(taskData),
        });
      } else {
        await api("/calendar/events", {
          method: "POST",
          body: JSON.stringify(taskData),
        });
      }
      setIsCreateTaskModalOpen(false);
      setEditingTask(null);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save task.");
    }
  };

  const handleDeleteTask = async (eventId: string) => {
    try {
      await api(`/calendar/events/${eventId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not delete task.");
    }
  };

  const handleClassException = async (
    event: CalendarEvent,
    exceptionType: "cancelled" | "rescheduled" | "makeup",
    notes?: string
  ) => {
    if (!event.routine_entry_id) {
      Alert.alert("Exception only applies to recurring routine classes.");
      return;
    }
    try {
      await api("/calendar/events/exception", {
        method: "POST",
        body: JSON.stringify({
          routineEntryId: event.routine_entry_id,
          date: event.date,
          exceptionType,
          notes,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not apply exception.");
    }
  };

  const handlePersonalOverride = async (
    event: CalendarEvent,
    customRoom?: string,
    customNotes?: string
  ) => {
    if (!event.routine_entry_id) return;
    try {
      // Find routine ID from routinesQuery
      const activeRt = (routinesQuery.data?.routines ?? []).find(
        (r) => r.is_active
      );
      if (!activeRt) return;

      await api(`/calendar/routines/${activeRt.id}/overrides`, {
        method: "POST",
        body: JSON.stringify({
          routineEntryId: event.routine_entry_id,
          customRoom: customRoom || null,
          customNotes: customNotes || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
      Alert.alert("Personal Override Saved", "Custom details applied.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not save override.");
    }
  };

  const handleManualClassSave = async (classData: RoutineEntry) => {
    try {
      // Create or update manual routine
      await api("/calendar/routines", {
        method: "POST",
        body: JSON.stringify({
          title: `${profile?.academic_group ?? "My Class"} Routine`,
          entries: [classData],
          sourceType: "manual",
        }),
      });
      setIsManualClassModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["calendar-routines"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
      Alert.alert("Class Added", "Your routine timetable has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not add class.");
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: isDark ? colors.bg : "#F8FAFC" },
      ]}
    >
      {/* 1. Top Navigation Bar */}
      <View
        style={[
          styles.topNavBar,
          {
            paddingTop: Math.max(insets.top, 24) + 14,
            paddingBottom: 14,
            backgroundColor: isDark ? colors.surface : "#FFFFFF",
            borderBottomColor: isDark ? colors.border : "#E2E8F0",
          },
        ]}
      >
        <View style={styles.navLeft}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.navBackBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={22}
              color={colors.text}
            />
          </Pressable>

          <View>
            <Text style={[styles.screenTitle, { color: colors.text }]}>
              Academic Calendar
            </Text>
            <Pressable
              onPress={() => setIsProfileModalOpen(true)}
              style={styles.academicGroupChip}
            >
              <Text
                style={[
                  styles.academicGroupChipText,
                  { color: colors.primary },
                ]}
              >
                {profile?.academic_group ?? "Configure Academic Group"}
              </Text>
              <MaterialCommunityIcons
                name="menu-down"
                size={16}
                color={colors.primary}
              />
            </Pressable>
          </View>
        </View>

        {/* Top Action Icons */}
        <View style={styles.navActionsRow}>
          <Pressable
            onPress={() => setIsSearchVisible(!isSearchVisible)}
            style={styles.navActionIcon}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={20}
              color={colors.text}
            />
          </Pressable>

          <Pressable
            onPress={() => setIsDiscoveryOpen(true)}
            style={styles.navActionIcon}
          >
            <MaterialCommunityIcons
              name="account-group-outline"
              size={20}
              color={colors.text}
            />
          </Pressable>

          <Pressable
            onPress={() => setIsPreferencesModalOpen(true)}
            style={styles.navActionIcon}
          >
            <MaterialCommunityIcons
              name="bell-badge-outline"
              size={20}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>

      {/* 2. Optional Collapsible Search Bar */}
      {isSearchVisible ? (
        <View
          style={[
            styles.searchBarWrap,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderBottomColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={18}
            color={colors.muted}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search classes, assignments, exams (e.g. CSE 2103)..."
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={16}
                color={colors.muted}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 24) + 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 3. Reusable "What's Next?" / Upcoming Academic Widget */}
        <UpcomingWidget
          summary={upcomingSummary}
          isLoading={upcomingQuery.isLoading}
          onPress={() => setViewMode("agenda")}
        />

        {/* 4. Date Control & View Segmented Switcher */}
        <View
          style={[
            styles.viewControlsCard,
            {
              backgroundColor: isDark ? colors.surface : "#FFFFFF",
              borderColor: isDark ? colors.border : "#E2E8F0",
            },
          ]}
        >
          {/* Date Selector Row */}
          <View style={styles.dateSelectorRow}>
            <View style={styles.dateNavArrows}>
              <Pressable onPress={handlePrevDate} style={styles.arrowBtn}>
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={24}
                  color={colors.text}
                />
              </Pressable>
              <Text style={[styles.headerDateLabel, { color: colors.text }]}>
                {headerDateText}
              </Text>
              <Pressable onPress={handleNextDate} style={styles.arrowBtn}>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={colors.text}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={handleGoToday}
              style={[
                styles.todayBtn,
                { backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={[styles.todayBtnText, { color: colors.primary }]}>
                Today
              </Text>
            </Pressable>
          </View>

          {/* Segmented Control: Month | Week | Day | Agenda */}
          <View
            style={[
              styles.segmentedControl,
              {
                backgroundColor: isDark ? colors.surface2 : "#F1F5F9",
              },
            ]}
          >
            {(["agenda", "day", "week", "month"] as CalendarViewMode[]).map(
              (m) => {
                const isSelected = viewMode === m;
                const label =
                  m === "agenda"
                    ? "Agenda"
                    : m === "day"
                    ? "Day"
                    : m === "week"
                    ? "Week"
                    : "Month";

                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      triggerHaptic();
                      setViewMode(m);
                    }}
                    style={[
                      styles.segmentBtn,
                      isSelected && {
                        backgroundColor: isDark ? colors.surface : "#FFFFFF",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
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
              }
            )}
          </View>
        </View>

        {/* 5. Filter Strip (All, Classes, Assignments, Quizzes, Exams, Tasks) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterStrip}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
        >
          {FILTER_OPTIONS.map((f) => {
            const isSelected = selectedFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  triggerHaptic();
                  setSelectedFilter(f.key);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDark
                      ? colors.surface
                      : "#FFFFFF",
                    borderColor: isSelected
                      ? colors.primary
                      : isDark
                      ? colors.border
                      : "#E2E8F0",
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={f.icon as any}
                  size={14}
                  color={isSelected ? "#FFFFFF" : colors.muted}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? "#FFFFFF" : colors.text,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 6. Empty Routine Callout if no active routine */}
        {!hasActiveRoutine && (
          <View
            style={[
              styles.noRoutineBanner,
              {
                backgroundColor: isDark ? colors.surface : "#FFFFFF",
                borderColor: isDark ? colors.border : "#E2E8F0",
              },
            ]}
          >
            <View style={styles.noRoutineHeader}>
              <View
                style={[
                  styles.noRoutineIcon,
                  { backgroundColor: colors.primarySoft },
                ]}
              >
                <MaterialCommunityIcons
                  name="calendar-clock"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noRoutineTitle, { color: colors.text }]}>
                  Your Academic Schedule Starts Here
                </Text>
                <Text style={[styles.noRoutineSub, { color: colors.muted }]}>
                  Upload your semester PDF routine or discover schedules shared
                  by your classmates.
                </Text>
              </View>
            </View>

            <View style={styles.noRoutineBtnRow}>
              <Pressable
                onPress={() => setIsImportModalOpen(true)}
                style={[
                  styles.importPdfBtn,
                  { backgroundColor: colors.primary },
                ]}
              >
                <MaterialCommunityIcons
                  name="file-pdf-box"
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.importPdfBtnText}>Import Routine PDF</Text>
              </Pressable>

              <Pressable
                onPress={() => setIsDiscoveryOpen(true)}
                style={[
                  styles.browseClassBtn,
                  { backgroundColor: colors.primarySoft },
                ]}
              >
                <MaterialCommunityIcons
                  name="account-group"
                  size={16}
                  color={colors.primary}
                />
                <Text
                  style={[
                    styles.browseClassBtnText,
                    { color: colors.primary },
                  ]}
                >
                  Browse Class
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* 7. Active Calendar View Rendering */}
        {eventsQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingBoxText, { color: colors.muted }]}>
              Loading academic schedule...
            </Text>
          </View>
        ) : viewMode === "month" ? (
          <MonthView
            currentDate={currentDate}
            selectedDateIso={selectedDateIso}
            onSelectDate={(iso) => setSelectedDateIso(iso)}
            events={events}
            onEventPress={(ev) => setSelectedEventDetails(ev)}
            onAddEventForDate={(iso) => {
              setCreateTaskDateIso(iso);
              setIsCreateTaskModalOpen(true);
            }}
          />
        ) : viewMode === "week" ? (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventPress={(ev) => setSelectedEventDetails(ev)}
            onAddEventForDate={(iso) => {
              setCreateTaskDateIso(iso);
              setIsCreateTaskModalOpen(true);
            }}
          />
        ) : viewMode === "day" ? (
          <DayView
            currentDate={parseIsoDate(selectedDateIso)}
            events={events}
            onEventPress={(ev) => setSelectedEventDetails(ev)}
            onAddEventForDate={(iso) => {
              setCreateTaskDateIso(iso);
              setIsCreateTaskModalOpen(true);
            }}
          />
        ) : (
          <AgendaView
            events={events}
            onEventPress={(ev) => setSelectedEventDetails(ev)}
            onToggleTaskComplete={handleToggleTaskComplete}
            onAddEvent={() => setIsCreateTaskModalOpen(true)}
          />
        )}
      </ScrollView>

      {/* 8. Floating Action Cluster (Add Task, Add Class, Import) */}
      <View
        style={[
          styles.fabCluster,
          { bottom: Math.max(insets.bottom, 24) + 48 },
        ]}
      >
        <Pressable
          onPress={() => setIsImportModalOpen(true)}
          style={[styles.miniFab, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons
            name="file-upload-outline"
            size={18}
            color={colors.primary}
          />
        </Pressable>

        <Pressable
          onPress={() => setIsManualClassModalOpen(true)}
          style={[styles.miniFab, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons
            name="book-plus-outline"
            size={18}
            color={colors.primary}
          />
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            setCreateTaskDateIso(selectedDateIso);
            setIsCreateTaskModalOpen(true);
          }}
          style={[styles.mainFab, { backgroundColor: colors.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* 9. Interactive Modals */}

      {/* Modal 1: PDF Routine Import */}
      {isImportModalOpen ? (
        <ImportRoutineModal
          visible={isImportModalOpen}
          profile={profile}
          onClose={() => setIsImportModalOpen(false)}
          onExtractionSuccess={(draft) => {
            setIsImportModalOpen(false);
            setVerificationRoutine(draft);
          }}
        />
      ) : null}

      {/* Modal 2: Routine Verification & Activation */}
      {verificationRoutine ? (
        <RoutineVerificationModal
          visible={!!verificationRoutine}
          routine={verificationRoutine}
          onClose={() => setVerificationRoutine(null)}
          onActivated={() => {
            setVerificationRoutine(null);
            queryClient.invalidateQueries({ queryKey: ["calendar-routines"] });
            queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
            queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
          }}
        />
      ) : null}

      {/* Modal 3: Manual Class Entry */}
      {isManualClassModalOpen ? (
        <ManualClassModal
          visible={isManualClassModalOpen}
          onClose={() => setIsManualClassModalOpen(false)}
          onSave={handleManualClassSave}
        />
      ) : null}

      {/* Modal 4: Create / Edit Academic Task */}
      {isCreateTaskModalOpen ? (
        <CreateTaskModal
          visible={isCreateTaskModalOpen}
          initialDateIso={createTaskDateIso}
          initialData={editingTask}
          onClose={() => {
            setIsCreateTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTask}
        />
      ) : null}

      {/* Modal 5: Event Details View */}
      {selectedEventDetails ? (
        <EventDetailsModal
          visible={!!selectedEventDetails}
          event={selectedEventDetails}
          onClose={() => setSelectedEventDetails(null)}
          onEditTask={(task) => {
            setEditingTask(task);
            setIsCreateTaskModalOpen(true);
          }}
          onDeleteTask={handleDeleteTask}
          onToggleComplete={handleToggleTaskComplete}
          onClassException={handleClassException}
          onPersonalOverride={handlePersonalOverride}
        />
      ) : null}

      {/* Modal 6: Class Routines Discovery */}
      {isDiscoveryOpen ? (
        <PublicRoutineDiscoveryModal
          visible={isDiscoveryOpen}
          profile={profile}
          onClose={() => setIsDiscoveryOpen(false)}
          onCopySuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["calendar-routines"] });
            queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
            queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
          }}
        />
      ) : null}

      {/* Modal 7: Academic Profile Config */}
      {isProfileModalOpen ? (
        <AcademicProfileModal
          visible={isProfileModalOpen}
          profile={profile}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdated={() => {
            queryClient.invalidateQueries({
              queryKey: ["calendar-academic-profile"],
            });
            queryClient.invalidateQueries({ queryKey: ["calendar-routines"] });
          }}
        />
      ) : null}

      {/* Modal 8: Notification Preferences */}
      {isPreferencesModalOpen ? (
        <PreferencesModal
          visible={isPreferencesModalOpen}
          onClose={() => setIsPreferencesModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["calendar-preferences"],
            });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  navBackBtn: {
    padding: 4,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  academicGroupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 1,
  },
  academicGroupChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  navActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  viewControlsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    gap: 10,
  },
  dateSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateNavArrows: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  arrowBtn: {
    padding: 2,
  },
  headerDateLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  todayBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  segmentedControl: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnText: {
    fontSize: 12,
  },
  filterStrip: {
    marginVertical: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  noRoutineBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginVertical: 8,
    gap: 12,
  },
  noRoutineHeader: {
    flexDirection: "row",
    gap: 12,
  },
  noRoutineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  noRoutineTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  noRoutineSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  noRoutineBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  importPdfBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  importPdfBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  browseClassBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  browseClassBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  loadingBoxText: {
    fontSize: 13,
  },
  fabCluster: {
    position: "absolute",
    bottom: 24,
    right: 20,
    alignItems: "center",
    gap: 10,
  },
  miniFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  mainFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
});
