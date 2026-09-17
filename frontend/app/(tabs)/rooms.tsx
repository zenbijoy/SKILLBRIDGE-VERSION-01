import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp, ZoomIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Room, RoomMode } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { useAppStore } from "@/state/useAppStore";
import { nextGenAnimations, nextGenAnimationsV2 } from "@/assets/nextgen";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { useI18n } from "@/i18n";
import { radius, spacing, useTheme } from "@/theme";

type RoomFilter = "all" | "live" | "online" | "campus" | "scheduled";
type Visibility = Room["visibility"];

const POPULAR_TOPICS = [
  "Algorithms",
  "Web Dev",
  "Python",
  "Calculus",
  "AI & ML",
  "Exam Prep",
  "Database",
  "System Design",
];

const CAPACITIES = [15, 30, 50, 100];

export default function RoomsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  // Filter & Search state
  const { mode: userRoleMode, setMode: setUserRoleMode } = useAppStore();
  const [showTeachRequestModal, setShowTeachRequestModal] = useState(false);
  const [requestTopicText, setRequestTopicText] = useState("");
  const [requestDetailText, setRequestDetailText] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Room Creator Drawer state
  const [showCreator, setShowCreator] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [mode, setMode] = useState<RoomMode>("online");
  const [campusLocation, setCampusLocation] = useState("");
  const [capacity, setCapacity] = useState(30);

  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[]; total: number }>("/rooms"),
  });

  const allRooms = roomsQuery.data?.rooms ?? [];

  // Metrics summary
  const metrics = useMemo(() => {
    const total = allRooms.length;
    const live = allRooms.filter((r) => r.status === "live").length;
    const online = allRooms.filter((r) => r.mode === "online").length;
    const campus = allRooms.filter((r) => r.mode === "offline" || r.mode === "hybrid").length;
    return { total, live, online, campus };
  }, [allRooms]);

  // Create Room Mutation
  const create = useMutation({
    mutationFn: () =>
      api<Room>("/rooms", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim(),
          description: description.trim() || `Peer learning room for ${topic.trim()}`,
          visibility,
          mode,
          capacity,
          campus_location: mode !== "online" ? campusLocation.trim() : null,
          tags: topic.trim() ? [topic.trim().toLowerCase()] : [],
        }),
      }),
    onSuccess: (newRoom) => {
      triggerHaptic();
      setTitle("");
      setTopic("");
      setDescription("");
      setVisibility("public");
      setMode("online");
      setCampusLocation("");
      setCapacity(30);
      setShowCreator(false);
      qc.invalidateQueries({ queryKey: ["rooms"] });
      Alert.alert("🎉 Room Created!", `"${newRoom.title}" is live and ready for members.`);
    },
    onError: (error) => {
      Alert.alert("Could not create room", error.message);
    },
  });

  // Filter & Search computation
  const filteredRooms = useMemo(() => {
    return allRooms.filter((room) => {
      // 1. Filter Chip
      if (filter === "live" && room.status !== "live") return false;
      if (filter === "scheduled" && room.status !== "scheduled") return false;
      if (filter === "online" && room.mode !== "online") return false;
      if (filter === "campus" && room.mode !== "offline" && room.mode !== "hybrid") return false;

      // 2. Topic Filter
      if (selectedTopic && !room.topic.toLowerCase().includes(selectedTopic.toLowerCase())) {
        const matchesTag = room.tags?.some((t) => t.toLowerCase() === selectedTopic.toLowerCase());
        if (!matchesTag) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = room.title.toLowerCase().includes(q);
        const matchesTopic = room.topic.toLowerCase().includes(q);
        const matchesDesc = room.description?.toLowerCase().includes(q);
        const matchesLocation = room.campus_location?.toLowerCase().includes(q);
        const matchesTag = room.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesTopic && !matchesDesc && !matchesLocation && !matchesTag) {
          return false;
        }
      }

      return true;
    });
  }, [allRooms, filter, selectedTopic, searchQuery]);

  // Validation checks for button state
  const isTitleValid = title.trim().length >= 3;
  const isTopicValid = topic.trim().length >= 2;
  const isLocationValid = mode === "online" || campusLocation.trim().length > 0;
  const canSubmit = isTitleValid && isTopicValid && isLocationValid && !create.isPending;

  return (
    <Screen
      header={
        <AppHeader
          title={t("rooms.title")}
          searchPlaceholder={t("rooms.searchPlaceholder")}
          actionIcon={showCreator ? "close" : "plus"}
          actionLabel={showCreator ? t("rooms.closeCreator") : t("rooms.create")}
          onAction={() => {
            triggerHaptic();
            setShowCreator((prev) => !prev);
          }}
        />
      }
      onRefresh={async () => {
        await roomsQuery.refetch();
      }}
      refreshing={roomsQuery.isRefetching}
    >
      {/* Hero Stats & Quick Action */}
      <View style={s.heroSection}>

        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="door-open" size={18} color={colors.primary} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.total}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.totalRooms")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <Image
                source={nextGenAnimations.livePulse}
                style={{ width: 14, height: 14 }}
                resizeMode="contain"
              />
              <Text style={[s.statValue, { color: colors.danger }]}>{metrics.live}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.liveNow")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="video-outline" size={18} color={colors.info} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.online}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.online")}</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={colors.accent} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.campus}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>{t("rooms.campus")}</Text>
          </View>
        </View>

        {/* Role Toggle: Learn vs Teach Mode */}
        <View style={s.roleSwitcherContainer}>
          <View style={[s.roleToggleWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("rooms.roleLearn", "Learn")}
              onPress={() => {
                if (userRoleMode !== "learn") {
                  triggerHaptic();
                  setUserRoleMode("learn");
                }
              }}
              style={[
                s.roleTab,
                userRoleMode === "learn" && [s.activeRoleTab, { backgroundColor: colors.primary }],
              ]}
            >
              <MaterialCommunityIcons
                name="school-outline"
                size={16}
                color={userRoleMode === "learn" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  s.roleTabText,
                  { color: userRoleMode === "learn" ? "#FFFFFF" : colors.muted },
                  userRoleMode === "learn" && s.activeRoleTabText,
                ]}
              >
                {t("rooms.roleLearn", "Learn")}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("rooms.roleTeach", "Teach")}
              onPress={() => {
                if (userRoleMode !== "teach") {
                  triggerHaptic();
                  setUserRoleMode("teach");
                }
              }}
              style={[
                s.roleTab,
                userRoleMode === "teach" && [s.activeRoleTab, { backgroundColor: colors.primary }],
              ]}
            >
              <MaterialCommunityIcons
                name="human-male-board"
                size={16}
                color={userRoleMode === "teach" ? "#FFFFFF" : colors.muted}
              />
              <Text
                style={[
                  s.roleTabText,
                  { color: userRoleMode === "teach" ? "#FFFFFF" : colors.muted },
                  userRoleMode === "teach" && s.activeRoleTabText,
                ]}
              >
                {t("rooms.roleTeach", "Teach")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Dynamic Context Banner based on Learn / Teach role */}
        {!showCreator && (
          userRoleMode === "learn" ? (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setShowTeachRequestModal(true);
              }}
              style={({ pressed }) => [
                s.launchBanner,
                { backgroundColor: `${colors.info}14`, borderColor: `${colors.info}40`, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
                <View style={[s.launchIconBox, { backgroundColor: colors.info }]}>
                  <MaterialCommunityIcons name="comment-question-outline" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.launchTitle, { color: colors.text }]}>{t("rooms.requestTopicBtn", "Request Teaching")}</Text>
                  <Text style={[s.launchSubtitle, { color: colors.muted }]}>
                    {t("rooms.roleLearnBanner", "Need help with a topic? Request a peer to teach you!")}
                  </Text>
                </View>
              </Row>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.info} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setShowCreator(true);
              }}
              style={({ pressed }) => [
                s.launchBanner,
                { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}40`, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Row style={{ alignItems: "center", gap: 12, flex: 1 }}>
                <View style={[s.launchIconBox, { backgroundColor: colors.primary }]}>
                  <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.launchTitle, { color: colors.text }]}>{t("rooms.hostSessionTitle")}</Text>
                  <Text style={[s.launchSubtitle, { color: colors.muted }]}>
                    {t("rooms.roleTeachBanner", "Share your expertise & mentor your campus peers!")}
                  </Text>
                </View>
              </Row>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
            </Pressable>
          )
        )}
      </View>

      {/* Room Creator Sheet / Card */}
      {showCreator ? (
        <Animated.View entering={FadeInUp.springify().damping(16)}>
          <Card tone="glow" style={s.creatorCard}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <View style={[s.creatorIconBox, { backgroundColor: `${colors.primary}20` }]}>
                  <MaterialCommunityIcons name="laptop" size={20} color={colors.primary} />
                </View>
                <H2 style={{ fontSize: 18 }}>{t("rooms.launchTitle")}</H2>
              </Row>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowCreator(false);
                }}
                hitSlop={12}
                style={{ padding: 4 }}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Muted style={{ fontSize: 13, marginTop: 2 }}>
              {t("rooms.launchSubtitle")}
            </Muted>

            {/* Title Field */}
            <View style={s.inputBlock}>
              <Field
                label={t("rooms.titleField")}
                placeholder={t("rooms.titlePlaceholder")}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
                error={title.trim().length > 0 && title.trim().length < 3 ? "Title must have at least 3 characters" : undefined}
              />
            </View>

            {/* Topic Field & Suggestions */}
            <View style={s.inputBlock}>
              <Field
                label={t("rooms.topicField")}
                placeholder={t("rooms.topicPlaceholder")}
                value={topic}
                onChangeText={setTopic}
                maxLength={60}
                error={topic.trim().length > 0 && topic.trim().length < 2 ? "Topic must have at least 2 characters" : undefined}
              />

              {/* Quick Topic Chips */}
              <View style={s.topicSuggestions}>
                <Text style={[s.sectionLabel, { color: colors.muted }]}>{t("rooms.quickSuggestions")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.suggestionScroll}>
                  {POPULAR_TOPICS.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        triggerHaptic();
                        setTopic(item);
                      }}
                      style={[
                        s.suggestionChip,
                        {
                          backgroundColor: topic.toLowerCase() === item.toLowerCase() ? `${colors.primary}24` : colors.surface,
                          borderColor: topic.toLowerCase() === item.toLowerCase() ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.suggestionChipText,
                          { color: topic.toLowerCase() === item.toLowerCase() ? colors.primary : colors.text },
                        ]}
                      >
                        #{item}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Description Field */}
            <View style={s.inputBlock}>
              <Field
                label={t("rooms.descField")}
                placeholder={t("rooms.descPlaceholder")}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                maxLength={400}
              />
            </View>

            {/* Delivery Mode Selection */}
            <View style={s.inputBlock}>
              <Text style={[s.sectionLabel, { color: colors.text }]}>{t("rooms.deliveryMode")}</Text>
              <Row style={{ gap: 8 }}>
                {(["online", "offline", "hybrid"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      triggerHaptic();
                      setMode(m);
                    }}
                    style={[
                      s.modeTile,
                      {
                        backgroundColor: mode === m ? `${colors.primary}16` : colors.surface,
                        borderColor: mode === m ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={m === "online" ? "video" : m === "offline" ? "map-marker" : "transit-connection-variant"}
                      size={18}
                      color={mode === m ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        s.modeTileText,
                        { color: mode === m ? colors.primary : colors.text, fontWeight: mode === m ? "800" : "600" },
                      ]}
                    >
                      {m === "online" ? t("rooms.modeOnline") : m === "offline" ? t("rooms.modeCampus") : t("rooms.modeHybrid")}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Conditional Campus Location Field */}
            {(mode === "offline" || mode === "hybrid") && (
              <Animated.View entering={FadeInUp.duration(200)} style={s.inputBlock}>
                <Field
                  label={t("rooms.campusLocation")}
                  placeholder={t("rooms.campusLocationPlaceholder")}
                  value={campusLocation}
                  onChangeText={setCampusLocation}
                  leftIcon="map-marker-outline"
                  maxLength={120}
                  error={!campusLocation.trim() ? "Campus location is required for in-person rooms" : undefined}
                />
              </Animated.View>
            )}

            {/* Visibility & Capacity Rows */}
            <Row style={{ justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[s.sectionLabel, { color: colors.text }]}>{t("rooms.access")}</Text>
                <Row style={{ gap: 6 }}>
                  {(["public", "private", "invite_only"] as const).map((item) => (
                    <Pill
                      key={item}
                      tone={visibility === item ? "primary" : "default"}
                      onPress={() => {
                        triggerHaptic();
                        setVisibility(item);
                      }}
                    >
                      {item === "invite_only" ? "Invite" : item.charAt(0).toUpperCase() + item.slice(1)}
                    </Pill>
                  ))}
                </Row>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[s.sectionLabel, { color: colors.text }]}>{t("rooms.seats")}</Text>
                <Row style={{ gap: 6 }}>
                  {CAPACITIES.map((cap) => (
                    <Pill
                      key={cap}
                      tone={capacity === cap ? "accent" : "default"}
                      onPress={() => {
                        triggerHaptic();
                        setCapacity(cap);
                      }}
                    >
                      {cap}
                    </Pill>
                  ))}
                </Row>
              </View>
            </Row>

            {/* Modal Actions */}
            <View style={s.creatorActions}>
              <Button
                title={t("common.cancel")}
                variant="ghost"
                onPress={() => {
                  triggerHaptic();
                  setShowCreator(false);
                }}
              />
              <Button
                title={create.isPending ? t("rooms.creatingRoom") : t("rooms.launchRoomBtn")}
                disabled={!canSubmit}
                loading={create.isPending}
                icon="rocket-launch-outline"
                onPress={() => create.mutate()}
              />
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {/* In-Page Real-time Search */}
      <View style={s.searchContainer}>
        <Field
          placeholder={t("rooms.searchInPage")}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="magnify"
          clearable={true}
          onClear={() => setSearchQuery("")}
        />
      </View>

      {/* Filter Chips Bar */}
      <View style={s.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersScroll}>
          {(
            [
              { key: "all", label: t("rooms.filterAll"), icon: "view-grid-outline" },
              { key: "live", label: t("rooms.filterLive"), icon: "broadcast" },
              { key: "online", label: t("rooms.filterOnline"), icon: "video-outline" },
              { key: "campus", label: t("rooms.filterCampus"), icon: "map-marker-outline" },
              { key: "scheduled", label: t("rooms.filterUpcoming"), icon: "calendar-clock" },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                triggerHaptic();
                setFilter(item.key);
              }}
              style={[
                s.filterChip,
                {
                  backgroundColor: filter === item.key ? colors.primary : colors.surface,
                  borderColor: filter === item.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  s.filterChipText,
                  { color: filter === item.key ? "#FFFFFF" : colors.text, fontWeight: filter === item.key ? "800" : "600" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}

          {/* Topic filter pill reset if active */}
          {selectedTopic && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setSelectedTopic(null);
              }}
              style={[s.filterChip, { backgroundColor: `${colors.accent}24`, borderColor: colors.accent }]}
            >
              <Text style={[s.filterChipText, { color: colors.accent, fontWeight: "700" }]}>
                #{selectedTopic} ✕
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Loading Skeletons */}
      {roomsQuery.isLoading ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
          <Skeleton height={140} radiusValue={radius.lg} />
        </View>
      ) : null}

      {/* Error State */}
      {roomsQuery.isError ? (
        <ErrorState
          title={t("common.error")}
          detail={(roomsQuery.error as Error).message}
          onRetry={() => roomsQuery.refetch()}
        />
      ) : null}

      {/* Empty State */}
      {roomsQuery.isSuccess && filteredRooms.length === 0 ? (
        <Empty
          icon="google-classroom"
          title={searchQuery.trim() || filter !== "all" ? t("rooms.noMatch") : t("rooms.empty")}
          detail={
            searchQuery.trim() || filter !== "all"
              ? t("rooms.noMatchDetail")
              : t("rooms.emptyDetail")
          }
          actionTitle={searchQuery.trim() || filter !== "all" ? t("rooms.clearFilters") : t("rooms.create")}
          onAction={() => {
            if (searchQuery.trim() || filter !== "all" || selectedTopic) {
              setSearchQuery("");
              setFilter("all");
              setSelectedTopic(null);
            } else {
              setShowCreator(true);
            }
          }}
        />
      ) : null}

      {/* Room Cards List */}
      <View style={s.roomList}>
        {filteredRooms.map((room, idx) => (
          <Animated.View key={room.id} entering={ZoomIn.delay(Math.min(idx * 40, 400)).springify()}>
            <RoomCard room={room} />
          </Animated.View>
        ))}
      </View>

      {/* Peer Teaching Request Modal */}
      <Modal
        visible={showTeachRequestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTeachRequestModal(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTeachRequestModal(false)} />
          <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="school" size={22} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.text }]}>
                  {t("rooms.requestTopicModalTitle", "Request Peer Teaching")}
                </Text>
              </Row>
              <Pressable onPress={() => setShowTeachRequestModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>
              {t("rooms.roleLearnBanner")}
            </Text>

            <Field
              label={t("rooms.topicField")}
              placeholder={t("rooms.requestTopicPlaceholder")}
              value={requestTopicText}
              onChangeText={setRequestTopicText}
            />

            <Field
              label="Additional Notes / Questions"
              placeholder="e.g. Preparing for midterms, need guidance on question 4..."
              value={requestDetailText}
              onChangeText={setRequestDetailText}
              multiline
              numberOfLines={3}
            />

            <Row style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button
                title={t("common.cancel")}
                variant="ghost"
                onPress={() => setShowTeachRequestModal(false)}
              />
              <Button
                title={t("rooms.requestTopicBtn")}
                variant="primary"
                disabled={!requestTopicText.trim()}
                onPress={() => {
                  triggerHaptic();
                  setShowTeachRequestModal(false);
                  setRequestTopicText("");
                  setRequestDetailText("");
                  Alert.alert(
                    t("rooms.requestSent", "Teaching Request Posted!"),
                    t("rooms.requestSentDetail", "Peers in this room will be notified to guide you.")
                  );
                }}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  roleSwitcherContainer: {
    alignItems: "center",
    marginBottom: 6,
  },
  roleToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
  },
  roleTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  activeRoleTab: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  activeRoleTabText: {
    fontWeight: "800",
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
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  heroSection: {
    gap: 12,
    marginVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  launchBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  launchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  launchTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  launchSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  creatorCard: {
    padding: 16,
    gap: 14,
    marginVertical: 6,
  },
  creatorIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBlock: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  topicSuggestions: {
    marginTop: 4,
    gap: 4,
  },
  suggestionScroll: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modeTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeTileText: {
    fontSize: 12,
  },
  creatorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  searchContainer: {
    marginTop: 4,
  },
  filtersContainer: {
    marginVertical: 2,
  },
  filtersScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
  },
  roomList: {
    gap: 8,
    marginTop: 4,
  },
});
