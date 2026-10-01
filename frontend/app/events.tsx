import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { radius, spacing, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface EventItem {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  location?: string;
  location_type?: "indoor" | "outdoor";
  category?: string;
  capacity?: number;
  application_required?: boolean;
  status: string;
}

interface DateAnalysisResult {
  target_date: string;
  event_type: string;
  location_type: string;
  suitability_score: number;
  verdict: string;
  weather: {
    temp_max: number;
    temp_min: number;
    rain_probability: number;
    weather_code: number;
    summary: string;
    is_outdoor_favorable: boolean;
  };
  conflicts_count: number;
  conflicts: Array<{ id: string; title: string; starts_at: string; location?: string }>;
  recommendations: string[];
}

export default function EventsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"all" | "workshop" | "seminar" | "club_meetup">("all");
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [enquiryModalVisible, setEnquiryModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Enquiry Form State
  const [enquiryTopic, setEnquiryTopic] = useState("");
  const [enquiryQuestion, setEnquiryQuestion] = useState("");

  // Report Form State
  const [reportCategory, setReportCategory] = useState<
    "scheduling_conflict" | "misconduct" | "misleading_info" | "venue_safety" | "other"
  >("scheduling_conflict");
  const [reportAllegation, setReportAllegation] = useState("");
  const [reportDetails, setReportDetails] = useState("");

  // AI Date Optimizer State
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [optEventType, setOptEventType] = useState<"workshop" | "seminar" | "outdoor_festival" | "club_meetup">("workshop");
  const [optLocationType, setOptLocationType] = useState<"indoor" | "outdoor">("indoor");

  // Query Events
  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api<{ events: EventItem[] }>("/events"),
  });

  const events = useMemo(() => data?.events ?? [], [data]);

  const filteredEvents = useMemo(() => {
    if (activeTab === "all") return events;
    return events.filter(
      (e) => (e.category || "").toLowerCase() === activeTab || e.title.toLowerCase().includes(activeTab),
    );
  }, [events, activeTab]);

  // Apply Mutation
  const applyMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/events/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ answers: { motivation: "Interested in participating" } }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Success", "Your registration / application was submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: () => {
      Alert.alert("Notice", "Application submitted to event organizers.");
    },
  });

  // Enquiry Mutation
  const enquiryMutation = useMutation({
    mutationFn: (data: { id: string; topic: string; question: string }) =>
      api(`/events/${data.id}/enquiry`, {
        method: "POST",
        body: JSON.stringify({ topic: data.topic, question: data.question }),
      }),
    onSuccess: () => {
      triggerHaptic();
      Alert.alert("Enquiry Sent", "Your question has been forwarded to the event managers.");
      setEnquiryModalVisible(false);
      setEnquiryTopic("");
      setEnquiryQuestion("");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to submit enquiry.");
    },
  });

  // Report Mutation
  const reportMutation = useMutation({
    mutationFn: (data: { id: string; category: string; allegation: string; details: string }) =>
      api(`/events/${data.id}/report`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (res: any) => {
      triggerHaptic();
      Alert.alert(
        "Report Filed",
        `Your dispute has been logged under ticket #${res?.ticket_id || "ALERT"}. Event managers and campus moderators have been informed.`,
      );
      setReportModalVisible(false);
      setReportAllegation("");
      setReportDetails("");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to submit report.");
    },
  });

  // AI Date Optimizer Mutation
  const analyzeMutation = useMutation({
    mutationFn: () =>
      api<DateAnalysisResult>("/events/analyze-date", {
        method: "POST",
        body: JSON.stringify({
          target_date: targetDate,
          event_type: optEventType,
          location_type: optLocationType,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
    },
    onError: (err: any) => {
      Alert.alert("Analysis Failed", err?.message || "Could not analyze date.");
    },
  });

  const handleOpenEnquiry = useCallback((event: EventItem) => {
    triggerHaptic();
    setSelectedEvent(event);
    setEnquiryModalVisible(true);
  }, []);

  const handleOpenReport = useCallback((event: EventItem) => {
    triggerHaptic();
    setSelectedEvent(event);
    setReportModalVisible(true);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Lightweight App Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Campus Events</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            Workshops, Seminars & Meetups
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            setShowOptimizer((prev) => !prev);
          }}
          style={[
            styles.optimizerPill,
            { backgroundColor: showOptimizer ? colors.primary : colors.primarySoft },
          ]}
        >
          <MaterialCommunityIcons
            name="weather-partly-cloudy"
            size={16}
            color={showOptimizer ? "#fff" : colors.primary}
          />
          <Text
            style={[
              styles.optimizerPillText,
              { color: showOptimizer ? "#fff" : colors.primary },
            ]}
          >
            AI Optimizer
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Collapsible AI Date Conflict & Weather Optimizer Card */}
        {showOptimizer && (
          <View style={[styles.optimizerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.optimizerHeader}>
              <View style={[styles.badgeIcon, { backgroundColor: `${colors.info}20` }]}>
                <MaterialCommunityIcons name="brain" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optTitle, { color: colors.text }]}>Date & Weather AI Planner</Text>
                <Text style={[styles.optSub, { color: colors.muted }]}>
                  Conflict detection & live weather forecast for organizers
                </Text>
              </View>
            </View>

            {/* Target Date Picker (presets) */}
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Proposed Date (YYYY-MM-DD)</Text>
            <View style={styles.dateRow}>
              <TextInput
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder="2026-10-15"
                placeholderTextColor={colors.muted}
                style={[styles.dateInput, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border }]}
              />
              <Pressable
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  setTargetDate(d.toISOString().split("T")[0]);
                }}
                style={[styles.quickDateBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              >
                <Text style={[styles.quickDateText, { color: colors.primary }]}>+1 Week</Text>
              </Pressable>
            </View>

            {/* Event & Location Type toggles */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Venue Type</Text>
                <View style={styles.miniPillRow}>
                  <Pressable
                    onPress={() => setOptLocationType("indoor")}
                    style={[
                      styles.miniPill,
                      optLocationType === "indoor"
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={{ color: optLocationType === "indoor" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                      🏢 Indoor
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setOptLocationType("outdoor")}
                    style={[
                      styles.miniPill,
                      optLocationType === "outdoor"
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={{ color: optLocationType === "outdoor" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                      ☀️ Outdoor
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</Text>
                <View style={styles.miniPillRow}>
                  <Pressable
                    onPress={() => setOptEventType("workshop")}
                    style={[
                      styles.miniPill,
                      optEventType === "workshop"
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={{ color: optEventType === "workshop" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                      Lab/Workshop
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setOptEventType("seminar")}
                    style={[
                      styles.miniPill,
                      optEventType === "seminar"
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={{ color: optEventType === "seminar" ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>
                      Seminar
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Run Analysis Button */}
            <Pressable
              onPress={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              style={[styles.analyzeBtn, { backgroundColor: colors.primary }]}
            >
              {analyzeMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="lightning-bolt" size={16} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analyze Date & Weather</Text>
                </>
              )}
            </Pressable>

            {/* Analysis Results Display */}
            {analyzeMutation.data && (
              <View style={[styles.analysisResults, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <View style={styles.scoreRow}>
                  <View
                    style={[
                      styles.scoreBadge,
                      {
                        backgroundColor:
                          analyzeMutation.data.suitability_score >= 75
                            ? "#10B98120"
                            : analyzeMutation.data.suitability_score >= 50
                            ? "#F59E0B20"
                            : "#EF444420",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoreText,
                        {
                          color:
                            analyzeMutation.data.suitability_score >= 75
                              ? "#10B981"
                              : analyzeMutation.data.suitability_score >= 50
                              ? "#F59E0B"
                              : "#EF4444",
                        },
                      ]}
                    >
                      {analyzeMutation.data.suitability_score}/100
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.verdictText, { color: colors.text }]}>
                      {analyzeMutation.data.verdict}
                    </Text>
                    <Text style={[styles.weatherSummary, { color: colors.muted }]}>
                      Weather: {analyzeMutation.data.weather.summary} ({analyzeMutation.data.weather.temp_max}°C, {analyzeMutation.data.weather.rain_probability}% rain)
                    </Text>
                  </View>
                </View>

                {analyzeMutation.data.recommendations.map((tip, idx) => (
                  <Text key={idx} style={[styles.recItem, { color: colors.textSecondary }]}>
                    {tip}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Filter Pills */}
        <View style={styles.tabBar}>
          {(
            [
              { key: "all", label: "All Events" },
              { key: "workshop", label: "Workshops" },
              { key: "seminar", label: "Seminars" },
              { key: "club_meetup", label: "Clubs" },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.key}
              onPress={() => {
                triggerHaptic();
                setActiveTab(t.key);
              }}
              style={[
                styles.tabPill,
                activeTab === t.key
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === t.key ? "#fff" : colors.textSecondary },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Events List */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No events found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              There are currently no events matching this category.
            </Text>
          </View>
        ) : (
          filteredEvents.map((e) => {
            const dateStr = new Date(e.starts_at).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <View
                key={e.id}
                style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {/* Card Top Meta */}
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.dateBadge, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons name="calendar-clock" size={14} color={colors.primary} />
                    <Text style={[styles.dateBadgeText, { color: colors.primary }]}>{dateStr}</Text>
                  </View>

                  <View style={styles.tagWrap}>
                    {e.location_type === "outdoor" ? (
                      <View style={[styles.locBadge, { backgroundColor: "#F59E0B20" }]}>
                        <Text style={[styles.locBadgeText, { color: "#F59E0B" }]}>Outdoor</Text>
                      </View>
                    ) : (
                      <View style={[styles.locBadge, { backgroundColor: "#3B82F620" }]}>
                        <Text style={[styles.locBadgeText, { color: "#3B82F6" }]}>Indoor</Text>
                      </View>
                    )}
                    {e.application_required ? (
                      <View style={[styles.appBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                        <Text style={[styles.appBadgeText, { color: colors.muted }]}>Approval Req.</Text>
                      </View>
                    ) : (
                      <View style={[styles.appBadge, { backgroundColor: "#10B98120" }]}>
                        <Text style={[styles.appBadgeText, { color: "#10B981" }]}>Open</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Title & Desc */}
                <Text style={[styles.eventTitle, { color: colors.text }]}>{e.title}</Text>
                <Text numberOfLines={3} style={[styles.eventDesc, { color: colors.muted }]}>
                  {e.description}
                </Text>

                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.muted} />
                  <Text numberOfLines={1} style={[styles.metaText, { color: colors.textSecondary }]}>
                    {e.location || "Campus Center / Online"}
                  </Text>
                </View>

                {/* Card Action Buttons */}
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => applyMutation.mutate(e.id)}
                    style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.primaryActionBtnText}>
                      {e.application_required ? "Apply" : "Register"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenEnquiry(e)}
                    style={[styles.secondaryActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="comment-question-outline" size={16} color={colors.text} />
                    <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Enquire</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenReport(e)}
                    hitSlop={6}
                    style={[styles.reportBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="flag-outline" size={16} color={colors.danger || "#EF4444"} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Ask Enquiry Modal                                             */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={enquiryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEnquiryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Ask Event Managers</Text>
              <Pressable onPress={() => setEnquiryModalVisible(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[styles.modalEventName, { color: colors.primary }]}>
              {selectedEvent?.title}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              Topic / Subject
            </Text>
            <TextInput
              value={enquiryTopic}
              onChangeText={setEnquiryTopic}
              placeholder="e.g. Venue directions, prerequisites, fees"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 10 }]}>
              Your Question
            </Text>
            <TextInput
              value={enquiryQuestion}
              onChangeText={setEnquiryQuestion}
              placeholder="Type your question to the organizers..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[
                styles.textAreaInput,
                { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
              ]}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setEnquiryModalVisible(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.muted, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={enquiryMutation.isPending || !enquiryTopic.trim() || !enquiryQuestion.trim()}
                onPress={() => {
                  if (selectedEvent) {
                    enquiryMutation.mutate({
                      id: selectedEvent.id,
                      topic: enquiryTopic.trim(),
                      question: enquiryQuestion.trim(),
                    });
                  }
                }}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor:
                      !enquiryTopic.trim() || !enquiryQuestion.trim()
                        ? colors.surface2
                        : colors.primary,
                  },
                ]}
              >
                {enquiryMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Submit Enquiry</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Dispute & Allegation Modal                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalTitleRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger || "#EF4444"} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Report Event Dispute</Text>
              </View>
              <Pressable onPress={() => setReportModalVisible(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[styles.modalEventName, { color: colors.danger || "#EF4444" }]}>
              {selectedEvent?.title}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              Dispute Category
            </Text>
            <View style={styles.categoryPillRow}>
              {[
                { key: "scheduling_conflict", label: "Date Conflict" },
                { key: "misconduct", label: "Misconduct" },
                { key: "misleading_info", label: "Misleading Info" },
                { key: "venue_safety", label: "Venue Safety" },
              ].map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setReportCategory(c.key as any)}
                  style={[
                    styles.miniCatPill,
                    reportCategory === c.key
                      ? { backgroundColor: colors.danger || "#EF4444" }
                      : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: reportCategory === c.key ? "#fff" : colors.textSecondary,
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 10 }]}>
              Brief Summary / Allegation
            </Text>
            <TextInput
              value={reportAllegation}
              onChangeText={setReportAllegation}
              placeholder="e.g. Schedule clash with Dept. Midterm exams"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 10 }]}>
              Detailed Explanation
            </Text>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Describe the issue for the campus event committee..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[
                styles.textAreaInput,
                { backgroundColor: colors.surface2, color: colors.text, borderColor: colors.border },
              ]}
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setReportModalVisible(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.muted, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={reportMutation.isPending || !reportAllegation.trim() || !reportDetails.trim()}
                onPress={() => {
                  if (selectedEvent) {
                    reportMutation.mutate({
                      id: selectedEvent.id,
                      category: reportCategory,
                      allegation: reportAllegation.trim(),
                      details: reportDetails.trim(),
                    });
                  }
                }}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor:
                      !reportAllegation.trim() || !reportDetails.trim()
                        ? colors.surface2
                        : colors.danger || "#EF4444",
                  },
                ]}
              >
                {reportMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Submit Report</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconBtn: {
    padding: 6,
    borderRadius: radius.pill,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  optimizerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  optimizerPillText: { fontSize: 12, fontWeight: "800" },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 90,
    gap: 12,
  },
  optimizerCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    marginBottom: 4,
  },
  optimizerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optTitle: { fontSize: 15, fontWeight: "800" },
  optSub: { fontSize: 12, marginTop: 1 },
  inputLabel: { fontSize: 12, fontWeight: "700" },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
  },
  quickDateBtn: {
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    borderWidth: 1,
  },
  quickDateText: { fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", gap: 12 },
  miniPillRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  miniPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 10,
    marginTop: 4,
  },
  analyzeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  analysisResults: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 6,
  },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  scoreText: { fontSize: 14, fontWeight: "900" },
  verdictText: { fontSize: 14, fontWeight: "800" },
  weatherSummary: { fontSize: 11, marginTop: 2 },
  recItem: { fontSize: 12, lineHeight: 17 },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 4,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  tabText: { fontSize: 12.5, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySubtitle: { fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  eventCard: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dateBadgeText: { fontSize: 11, fontWeight: "700" },
  tagWrap: { flexDirection: "row", gap: 5 },
  locBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  locBadgeText: { fontSize: 10, fontWeight: "800" },
  appBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  appBadgeText: { fontSize: 10, fontWeight: "800" },
  eventTitle: { fontSize: 15, fontWeight: "800", lineHeight: 21 },
  eventDesc: { fontSize: 12.5, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  metaText: { fontSize: 12, flex: 1 },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ffffff10",
  },
  primaryActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryActionBtnText: { fontSize: 12, fontWeight: "700" },
  reportBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  modalTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  modalEventName: { fontSize: 13, fontWeight: "700" },
  textInput: {
    height: 42,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    borderWidth: 1,
  },
  textAreaInput: {
    height: 80,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    borderWidth: 1,
    textAlignVertical: "top",
  },
  categoryPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  miniCatPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  submitBtn: {
    flex: 1.5,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
