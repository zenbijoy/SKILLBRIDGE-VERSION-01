import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubEvent, ClubRole } from "../types";
import { isClubOfficer } from "../constants";
import { clubErrorMessage } from "../lib/apiErrors";
import { useI18n } from "../../../i18n";
import { ClashDetectorModal } from "../ClashDetectorModal";
import api from "../../../services/api";

interface ClubEventsTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  events: ClubEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ClubEventsTab: React.FC<ClubEventsTabProps> = ({
  clubId,
  myRole,
  events,
  isLoading,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isLeader = isClubOfficer(myRole);

  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"upcoming" | "past">("upcoming");

  // Fetch full list of events for the club
  const {
    data: fetchedEvents = [],
    isLoading: isEventsLoading,
    refetch: refetchEvents,
  } = useQuery<ClubEvent[]>({
    queryKey: ["club-events", clubId],
    queryFn: async () => {
      const res = await api.get<{ events?: ClubEvent[] } | ClubEvent[]>(`/clubs/${clubId}/events`);
      if (Array.isArray(res.data)) return res.data;
      return res.data?.events || [];
    },
    initialData: events,
  });

  // Create Event Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showClashModal, setShowClashModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [venueType, setVenueType] = useState<"offline" | "online" | "hybrid">("offline");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // QR / Attendance Checkin Modal state
  const [checkinEvent, setCheckinEvent] = useState<ClubEvent | null>(null);
  const [attendanceCodeInput, setAttendanceCodeInput] = useState("");
  const [organizerCode, setOrganizerCode] = useState<string | null>(null);
  const [loadingOrganizerCode, setLoadingOrganizerCode] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Filter events
  const now = new Date();
  const allEvents = fetchedEvents.length > 0 ? fetchedEvents : events;
  const upcomingEvents = allEvents.filter(
    (e) => !e.starts_at || new Date(e.starts_at) >= now
  );
  const pastEvents = allEvents.filter(
    (e) => e.starts_at && new Date(e.starts_at) < now
  );
  const displayedEvents = activeFilter === "upcoming" ? upcomingEvents : pastEvents;

  const handleRegister = async (eventId: string, currentStatus?: boolean) => {
    try {
      setRegisteringId(eventId);
      const res = await api.post(`/clubs/events/${eventId}/register`);
      Alert.alert(
        res.data?.registered ? "Registered! 🎉" : "Registration Updated",
        res.data?.registered
          ? "You have successfully registered. This event has also been added to your Academic Calendar schedule!"
          : "You have cancelled your registration."
      );
      queryClient.invalidateQueries({ queryKey: ["club-events", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onRefresh();
      refetchEvents();
    } catch (err: unknown) {
      Alert.alert(
        "Registration Failed",
        clubErrorMessage(err, t)
      );
    } finally {
      setRegisteringId(null);
    }
  };

  const handleOpenAttendanceModal = async (item: ClubEvent) => {
    setCheckinEvent(item);
    setAttendanceCodeInput("");
    if (isLeader) {
      setLoadingOrganizerCode(true);
      try {
        const res = await api.get<{ attendance_code: string }>(
          `/clubs/${clubId}/events/${item.id}/attendance-code`
        );
        setOrganizerCode(res.data?.attendance_code || "AUTO-GEN");
      } catch (err: unknown) {
        setOrganizerCode(item.attendance_code || "UNAVAILABLE");
      } finally {
        setLoadingOrganizerCode(false);
      }
    }
  };

  const handleCheckin = async () => {
    if (!checkinEvent || !attendanceCodeInput.trim()) return;
    try {
      setCheckingIn(true);
      await api.post(`/clubs/events/${checkinEvent.id}/checkin`, {
        code: attendanceCodeInput.trim(),
      });
      Alert.alert("Verified! ✅", "Your attendance has been confirmed and recorded.");
      setCheckinEvent(null);
      setAttendanceCodeInput("");
      queryClient.invalidateQueries({ queryKey: ["club-events", clubId] });
      onRefresh();
      refetchEvents();
    } catch (err: unknown) {
      Alert.alert(
        "Check-in Failed",
        clubErrorMessage(err, t)
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const normalizeDateInput = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return "";
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return trimmed;
  };

  const handleCreateEvent = async () => {
    if (!title.trim() || !startsAt.trim()) {
      Alert.alert("Required Fields", "Please provide at least a title and start date/time.");
      return;
    }
    try {
      setSubmitting(true);
      const normalizedStart = normalizeDateInput(startsAt);
      const normalizedEnd = endsAt.trim() ? normalizeDateInput(endsAt) : undefined;

      await api.post(`/clubs/${clubId}/events`, {
        title: title.trim(),
        description: description.trim(),
        starts_at: normalizedStart,
        ends_at: normalizedEnd,
        location: location.trim() || undefined,
        venue_type: venueType,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
      });
      Alert.alert("Success", "Club event created successfully!");
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setLocation("");
      setStartsAt("");
      setEndsAt("");
      setCapacity("");
      queryClient.invalidateQueries({ queryKey: ["club-events", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onRefresh();
      refetchEvents();
    } catch (err: unknown) {
      Alert.alert(
        "Failed to create",
        clubErrorMessage(err, t)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Filter Bar + Leader Action */}
      <View style={styles.topBar}>
        <View style={styles.filterPills}>
          <TouchableOpacity
            style={[
              styles.filterPill,
              activeFilter === "upcoming" && {
                backgroundColor: colors.primary,
              },
            ]}
            onPress={() => setActiveFilter("upcoming")}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === "upcoming" ? "#fff" : colors.textSecondary },
              ]}
            >
              Upcoming ({upcomingEvents.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              activeFilter === "past" && {
                backgroundColor: colors.primary,
              },
            ]}
            onPress={() => setActiveFilter("past")}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === "past" ? "#fff" : colors.textSecondary },
              ]}
            >
              Past ({pastEvents.length})
            </Text>
          </TouchableOpacity>
        </View>

        {isLeader && (
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>New Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Events List */}
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading club events...
          </Text>
        </View>
      ) : displayedEvents.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {activeFilter === "upcoming" ? "No Upcoming Events" : "No Past Events"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {activeFilter === "upcoming"
              ? "Stay tuned! The club leadership hasn't scheduled any new workshops or meets yet."
              : "Past club events and webinars will appear here for reference."}
          </Text>
          {isLeader && activeFilter === "upcoming" && (
            <TouchableOpacity
              style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.emptyCreateBtnText}>Schedule First Event</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={displayedEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => {
            const isReg = !!item.is_registered;
            const isRegLoading = registeringId === item.id;

            return (
              <View
                style={[
                  styles.eventCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Header Date Badge & Venue */}
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.venueBadge,
                      {
                        backgroundColor:
                          item.venue_type === "online"
                            ? "rgba(59, 130, 246, 0.12)"
                            : "rgba(16, 185, 129, 0.12)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.venue_type === "online"
                          ? "videocam-outline"
                          : item.venue_type === "hybrid"
                          ? "globe-outline"
                          : "location-outline"
                      }
                      size={14}
                      color={item.venue_type === "online" ? "#3b82f6" : "#10b981"}
                    />
                    <Text
                      style={[
                        styles.venueBadgeText,
                        {
                          color:
                            item.venue_type === "online" ? "#3b82f6" : "#10b981",
                        },
                      ]}
                    >
                      {item.venue_type
                        ? item.venue_type.toUpperCase()
                        : "OFFLINE"}
                    </Text>
                  </View>

                  {item.capacity && (
                    <Text style={[styles.capacityText, { color: colors.textSecondary }]}>
                      Max {item.capacity} attendees
                    </Text>
                  )}
                </View>

                {/* Title & Description */}
                <Text style={[styles.eventTitle, { color: colors.text }]}>
                  {item.title}
                </Text>

                {item.description ? (
                  <Text
                    style={[styles.eventDesc, { color: colors.textSecondary }]}
                    numberOfLines={3}
                  >
                    {item.description}
                  </Text>
                ) : null}

                {/* Details list */}
                <View style={styles.detailsList}>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                    <Text style={[styles.detailText, { color: colors.text }]}>
                      {formatDate(item.starts_at)}
                      {item.ends_at ? ` - ${formatDate(item.ends_at)}` : ""}
                    </Text>
                  </View>

                  {item.location && (
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text
                        style={[styles.detailText, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {item.location}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={[styles.actionsBar, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.registerBtn,
                      isReg
                        ? {
                            backgroundColor: "rgba(16, 185, 129, 0.12)",
                            borderColor: "#10b981",
                            borderWidth: 1,
                          }
                        : { backgroundColor: colors.primary },
                    ]}
                    onPress={() => handleRegister(item.id, isReg)}
                    disabled={isRegLoading}
                  >
                    {isRegLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={isReg ? "#10b981" : "#fff"}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name={isReg ? "checkmark-circle" : "calendar"}
                          size={16}
                          color={isReg ? "#10b981" : "#fff"}
                        />
                        <Text
                          style={[
                            styles.registerBtnText,
                            { color: isReg ? "#10b981" : "#fff" },
                          ]}
                        >
                          {isReg ? "Registered (Calendar Synced)" : "Register & Sync"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Attendance Check-in for attendees or Leaders viewing attendance */}
                  <TouchableOpacity
                    style={[
                      styles.checkinBtn,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}
                    onPress={() => handleOpenAttendanceModal(item)}
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={16}
                      color={colors.text}
                    />
                    <Text style={[styles.checkinBtnText, { color: colors.text }]}>
                      {isLeader ? "Code/QR" : "Check-in"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Attendance Check-in / QR modal */}
      <Modal
        visible={!!checkinEvent}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckinEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isLeader ? "Event Attendance Code" : "Verify Attendance"}
              </Text>
              <TouchableOpacity onPress={() => setCheckinEvent(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              {checkinEvent?.title}
            </Text>

            {isLeader ? (
              <View style={styles.leaderCodeBox}>
                <Text style={[styles.leaderCodeLabel, { color: colors.textSecondary }]}>
                  Share this 6-character code or QR with attendees at the venue:
                </Text>
                <View
                  style={[
                    styles.codePill,
                    { backgroundColor: "rgba(59, 130, 246, 0.1)" },
                  ]}
                >
                  {loadingOrganizerCode ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.codePillText, { color: colors.primary }]}>
                      {organizerCode || "AUTO-GEN"}
                    </Text>
                  )}
                </View>
                <Text style={[styles.leaderNote, { color: colors.textSecondary }]}>
                  Attendees can enter this code in their SkillBridge app to earn verified
                  attendance certificates and credits!
                </Text>
              </View>
            ) : (
              <View style={styles.attendeeCheckinBox}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Enter the 6-character code announced by organizers:
                </Text>
                <TextInput
                  style={[
                    styles.codeInput,
                    {
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.background,
                    },
                  ]}
                  placeholder="e.g. EVT789"
                  placeholderTextColor={colors.textSecondary}
                  value={attendanceCodeInput}
                  onChangeText={setAttendanceCodeInput}
                  autoCapitalize="characters"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={[
                    styles.submitCheckinBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handleCheckin}
                  disabled={checkingIn || !attendanceCodeInput.trim()}
                >
                  {checkingIn ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitCheckinBtnText}>Confirm Attendance</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Clash Detector Modal */}
      <ClashDetectorModal
        clubId={clubId}
        startsAt={startsAt.trim()}
        endsAt={endsAt.trim() || startsAt.trim()}
        location={location.trim()}
        visible={showClashModal}
        onClose={() => setShowClashModal(false)}
        onProceedAnyway={() => {
          setShowClashModal(false);
          handleCreateEvent();
        }}
      />

      {/* Schedule / Create Event Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.createModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Schedule Club Event
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Event Title *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. Intro to Autonomous Robotics Workshop"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Description
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="What will attendees learn, required prerequisites, agenda..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Start Date & Time (ISO format) *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="YYYY-MM-DDTHH:MM (e.g. 2026-10-15T15:00)"
                placeholderTextColor={colors.textSecondary}
                value={startsAt}
                onChangeText={setStartsAt}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                End Date & Time (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="YYYY-MM-DDTHH:MM (e.g. 2026-10-15T17:30)"
                placeholderTextColor={colors.textSecondary}
                value={endsAt}
                onChangeText={setEndsAt}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Venue Type
              </Text>
              <View style={styles.venueSelectRow}>
                {(["offline", "online", "hybrid"] as const).map((vt) => (
                  <TouchableOpacity
                    key={vt}
                    style={[
                      styles.venueOption,
                      venueType === vt && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => setVenueType(vt)}
                  >
                    <Text
                      style={[
                        styles.venueOptionText,
                        { color: venueType === vt ? "#fff" : colors.text },
                      ]}
                    >
                      {vt.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Location / Room / Meet Link
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. ECE Building Room 302 or Google Meet URL"
                placeholderTextColor={colors.textSecondary}
                value={location}
                onChangeText={setLocation}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Max Capacity (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. 80"
                placeholderTextColor={colors.textSecondary}
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="numeric"
              />

              {/* Clash Detection Button */}
              {startsAt.trim() ? (
                <TouchableOpacity
                  style={[
                    styles.clashCheckBtn,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                  onPress={() => setShowClashModal(true)}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  <Text style={[styles.clashCheckBtnText, { color: colors.primary }]}>
                    Check Calendar Clashes
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.submitCreateBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCreateEvent}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitCreateBtnText}>Publish Event</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(150, 150, 150, 0.12)",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyCreateBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  eventCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  venueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  venueBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  capacityText: {
    fontSize: 12,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  eventDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  detailsList: {
    gap: 6,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  registerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  registerBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  checkinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkinBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  createModalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalSub: {
    fontSize: 14,
    marginBottom: 16,
  },
  leaderCodeBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  leaderCodeLabel: {
    fontSize: 13,
    textAlign: "center",
  },
  codePill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  codePillText: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 4,
  },
  leaderNote: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  attendeeCheckinBox: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 2,
  },
  submitCheckinBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  submitCheckinBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  formScroll: {
    paddingBottom: 20,
    gap: 8,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 70,
    textAlignVertical: "top",
  },
  venueSelectRow: {
    flexDirection: "row",
    gap: 8,
  },
  venueOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  venueOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  clashCheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  clashCheckBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  submitCreateBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitCreateBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
