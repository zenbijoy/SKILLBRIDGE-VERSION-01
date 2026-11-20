import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Pressable,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { api } from "@/lib/api";
import { Button, Card, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { fetchMyBookings, type SessionBooking } from "@/features/growth/growthApi";

type MainTab = "tutors" | "my_bookings";

const SUBJECT_FILTERS = [
  "All",
  "Computer Science",
  "Mathematics",
  "Engineering",
  "Business",
  "Physics",
  "Biology",
];

export default function BookingsListScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [mainTab, setMainTab] = useState<MainTab>("tutors");
  const [tutors, setTutors] = useState<any[]>([]);
  const [bookings, setBookings] = useState<SessionBooking[]>([]);
  const [role, setRole] = useState<"all" | "learner" | "tutor">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("All");

  const loadData = useCallback(async () => {
    try {
      const queryParams: Record<string, string> = {};
      if (searchQuery.trim()) queryParams.q = searchQuery.trim();
      if (selectedSubject !== "All") queryParams.q = selectedSubject;

      const queryString = new URLSearchParams(queryParams).toString();
      const tutorsUrl = `/bookings/tutors${queryString ? `?${queryString}` : ""}`;

      const [bookingsData, tutorsData] = await Promise.all([
        fetchMyBookings(role).catch(() => []),
        api<{ tutors: any[] }>(tutorsUrl).catch(() => ({ tutors: [] })),
      ]);
      setBookings(bookingsData);
      setTutors(tutorsData.tutors || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, searchQuery, selectedSubject]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "completed":
        return "#10B981";
      case "accepted":
        return "#3B82F6";
      case "requested":
        return "#F59E0B";
      case "declined":
      case "cancelled":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  return (
    <Screen scroll={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Row style={{ alignItems: "center", gap: 10 }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Tutor Marketplace</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>1:1 Peer Learning & Academic Mentorship</Text>
            </View>
          </Row>
          <TouchableOpacity
            style={[styles.settingsBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => router.push("/settings/availability" as any)}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Main Mode Segment: Find Tutors vs My Sessions */}
        <View style={[styles.modeRow, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setMainTab("tutors");
            }}
            style={[
              styles.modeBtn,
              mainTab === "tutors" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons
                name="school-outline"
                size={18}
                color={mainTab === "tutors" ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  { color: mainTab === "tutors" ? colors.primary : colors.text, fontWeight: mainTab === "tutors" ? "800" : "500" },
                ]}
              >
                Find Tutors ({tutors.length})
              </Text>
            </Row>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setMainTab("my_bookings");
            }}
            style={[
              styles.modeBtn,
              mainTab === "my_bookings" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons
                name="calendar-check-outline"
                size={18}
                color={mainTab === "my_bookings" ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  { color: mainTab === "my_bookings" ? colors.primary : colors.text, fontWeight: mainTab === "my_bookings" ? "800" : "500" },
                ]}
              >
                My Sessions ({bookings.length})
              </Text>
            </Row>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : mainTab === "tutors" ? (
          // Find Tutors Marketplace
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {/* Search Input Bar */}
            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search by name, course (e.g. CS101), or skill..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Subject Filters Carousel */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              {SUBJECT_FILTERS.map((subj) => (
                <TouchableOpacity
                  key={subj}
                  style={[
                    styles.subjectChip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    selectedSubject === subj && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => {
                    triggerHaptic();
                    setSelectedSubject(subj);
                  }}
                >
                  <Text
                    style={[
                      styles.subjectChipText,
                      { color: selectedSubject === subj ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {subj}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {tutors.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="account-search-outline" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Tutors Found</Text>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
                  Try adjusting your search terms or clearing subject filters.
                </Text>
                <Button
                  title="Clear Filters"
                  variant="secondary"
                  compact
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedSubject("All");
                  }}
                />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {tutors.map((tutor) => (
                  <Card
                    key={tutor.id}
                    style={[styles.tutorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Row style={{ alignItems: "flex-start", gap: 12 }}>
                      <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                        {tutor.avatar_url ? (
                          <Image source={{ uri: tutor.avatar_url }} style={styles.avatarImg} />
                        ) : (
                          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>
                            {tutor.full_name?.[0] || "T"}
                          </Text>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }} numberOfLines={1}>
                            {tutor.full_name}
                          </Text>
                          <Row style={{ alignItems: "center", gap: 3 }}>
                            <Ionicons name="star" size={14} color="#F59E0B" />
                            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text }}>
                              {tutor.rating ? tutor.rating.toFixed(1) : "5.0"}
                            </Text>
                            {tutor.reviewsCount > 0 && (
                              <Text style={{ fontSize: 11, color: colors.muted }}>
                                ({tutor.reviewsCount})
                              </Text>
                            )}
                          </Row>
                        </Row>

                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                          {[tutor.department, tutor.university].filter(Boolean).join(" • ") || "Campus Peer Tutor"}
                        </Text>

                        {tutor.headline ? (
                          <Text style={{ fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 16 }} numberOfLines={2}>
                            {tutor.headline}
                          </Text>
                        ) : null}

                        {/* Tutor Skills Badges */}
                        {tutor.skills && tutor.skills.length > 0 && (
                          <Row style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            {tutor.skills.slice(0, 3).map((s: any) => (
                              <Pill key={s.id} tone="accent">
                                {s.name}
                              </Pill>
                            ))}
                          </Row>
                        )}

                        <Row style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <Pill tone="primary">Peer Tutor</Pill>
                          <Pill tone="default">{tutor.reputation || 25} Rep</Pill>
                        </Row>
                      </View>
                    </Row>

                    <Row style={{ justifyContent: "flex-end", gap: 8, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }}>
                      <Button
                        title="View Profile"
                        variant="ghost"
                        compact
                        onPress={() => router.push(`/user/${tutor.id}` as any)}
                      />
                      <Button
                        title="Book Session"
                        compact
                        onPress={() => {
                          triggerHaptic();
                          router.push(`/booking/${tutor.id}` as any);
                        }}
                      />
                    </Row>
                  </Card>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          // My Bookings
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {/* Role Filter Chips */}
            <View style={styles.tabRow}>
              {(
                [
                  { key: "all", label: "All Sessions" },
                  { key: "learner", label: "As Learner" },
                  { key: "tutor", label: "As Tutor" },
                ] as const
              ).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabBtn,
                    role === tab.key && {
                      backgroundColor: colors.primarySoft,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setRole(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: role === tab.key ? colors.primary : colors.muted },
                      role === tab.key && { fontWeight: "700" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {bookings.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Sessions Yet</Text>
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 4 }}>
                  Switch to &ldquo;Find Tutors&rdquo; above to book your first 1:1 study session.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {bookings.map((b) => {
                  const isAccepted = b.status === "accepted" || b.status === "confirmed";

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push(`/bookings/${b.id}` as any)}
                    >
                      <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>
                          {b.skill?.name || "1:1 Study Session"}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(b.status) + "22" }]}>
                          <Text style={[styles.statusText, { color: getStatusColor(b.status) }]}>
                            {b.status.toUpperCase()}
                          </Text>
                        </View>
                      </Row>

                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {new Date(b.start_time).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>

                      {b.learner_note ? (
                        <Text style={{ fontSize: 12, color: colors.text, marginTop: 4 }} numberOfLines={1}>
                          &ldquo;{b.learner_note}&rdquo;
                        </Text>
                      ) : null}

                      {/* Quick Action Button for Accepted Sessions */}
                      {isAccepted && (
                        <Row style={{ marginTop: 10, justifyContent: "flex-end" }}>
                          <Button
                            title="Join Call / Room 🚀"
                            variant="primary"
                            compact
                            onPress={() => router.push(`/bookings/${b.id}` as any)}
                          />
                        </Row>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  settingsBtn: {
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  modeRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  modeBtnText: {
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  filterScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  subjectChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centerContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
  tutorCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  bookingCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
