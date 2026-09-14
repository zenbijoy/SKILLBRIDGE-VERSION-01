import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
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
import { spotIllustrations } from "@/assets/illustrations";
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
      onRefresh={async () => {
        await roomsQuery.refetch();
      }}
      refreshing={roomsQuery.isRefetching}
    >
      {/* Universal Header */}
      <AppHeader
        title={t("rooms.title")}
        searchPlaceholder="Search learning rooms & topics..."
        actionIcon={showCreator ? "close" : "plus"}
        actionLabel={showCreator ? "Close room creator" : "Create room"}
        onAction={() => {
          triggerHaptic();
          setShowCreator((prev) => !prev);
        }}
      />

      {/* Hero Stats & Quick Action */}
      <View style={s.heroSection}>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="door-open" size={18} color={colors.primary} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.total}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>Total Rooms</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <View style={[s.pulseDot, { backgroundColor: colors.danger }]} />
              <Text style={[s.statValue, { color: colors.danger }]}>{metrics.live}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>Live Now</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="video-outline" size={18} color={colors.info} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.online}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>Online</Text>
          </View>

          <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.statHeader}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={colors.accent} />
              <Text style={[s.statValue, { color: colors.text }]}>{metrics.campus}</Text>
            </View>
            <Text style={[s.statLabel, { color: colors.muted }]}>Campus</Text>
          </View>
        </View>

        {/* Quick Launch CTA Banner */}
        {!showCreator && (
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
                <Text style={[s.launchTitle, { color: colors.text }]}>Host a Study Session</Text>
                <Text style={[s.launchSubtitle, { color: colors.muted }]}>
                  Launch an online video room or campus study hall in seconds.
                </Text>
              </View>
            </Row>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
          </Pressable>
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
                <H2 style={{ fontSize: 18 }}>Launch a Learning Room</H2>
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
              Create a focused peer space. Others can join instantly for discussion and live study.
            </Muted>

            {/* Title Field */}
            <View style={s.inputBlock}>
              <Field
                label="Room Title *"
                placeholder="e.g. Distributed Systems Working Group"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
                error={title.trim().length > 0 && title.trim().length < 3 ? "Title must have at least 3 characters" : undefined}
              />
            </View>

            {/* Topic Field & Suggestions */}
            <View style={s.inputBlock}>
              <Field
                label="Subject or Topic *"
                placeholder="e.g. Computer Science, Algorithms, Calculus"
                value={topic}
                onChangeText={setTopic}
                maxLength={60}
                error={topic.trim().length > 0 && topic.trim().length < 2 ? "Topic must have at least 2 characters" : undefined}
              />

              {/* Quick Topic Chips */}
              <View style={s.topicSuggestions}>
                <Text style={[s.sectionLabel, { color: colors.muted }]}>Quick Suggestions:</Text>
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
                label="Description (Optional)"
                placeholder="What will members work on, discuss, or learn together?"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                maxLength={400}
              />
            </View>

            {/* Delivery Mode Selection */}
            <View style={s.inputBlock}>
              <Text style={[s.sectionLabel, { color: colors.text }]}>Format & Delivery Mode</Text>
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
                      {m === "online" ? "Online LiveKit" : m === "offline" ? "On Campus" : "Hybrid"}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            {/* Conditional Campus Location Field */}
            {(mode === "offline" || mode === "hybrid") && (
              <Animated.View entering={FadeInUp.duration(200)} style={s.inputBlock}>
                <Field
                  label="Campus Location *"
                  placeholder="e.g. Science Library Room 304, Main Campus"
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
                <Text style={[s.sectionLabel, { color: colors.text }]}>Access</Text>
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
                <Text style={[s.sectionLabel, { color: colors.text }]}>Seats</Text>
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
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  triggerHaptic();
                  setShowCreator(false);
                }}
              />
              <Button
                title={create.isPending ? "Creating Room…" : "Launch Room"}
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
          placeholder="Search by title, topic, or location..."
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
              { key: "all", label: "All Rooms", icon: "view-grid-outline" },
              { key: "live", label: "● Live Now", icon: "broadcast" },
              { key: "online", label: "Online", icon: "video-outline" },
              { key: "campus", label: "Campus Hub", icon: "map-marker-outline" },
              { key: "scheduled", label: "Upcoming", icon: "calendar-clock" },
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
          title="Could not load learning rooms"
          detail={(roomsQuery.error as Error).message}
          onRetry={() => roomsQuery.refetch()}
        />
      ) : null}

      {/* Empty State */}
      {roomsQuery.isSuccess && filteredRooms.length === 0 ? (
        <Empty
          illustration={spotIllustrations.createRoom}
          title={searchQuery.trim() || filter !== "all" ? "No matching rooms" : t("rooms.empty")}
          detail={
            searchQuery.trim() || filter !== "all"
              ? "Try adjusting your search query or switching filters."
              : t("rooms.emptyDetail")
          }
          actionTitle={searchQuery.trim() || filter !== "all" ? "Clear Filters" : t("rooms.create")}
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
    </Screen>
  );
}

const s = StyleSheet.create({
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
