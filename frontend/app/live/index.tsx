import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { api } from "@/lib/api";
import { useTheme, radius, spacing } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useI18n } from "@/i18n";
import { getSocket } from "@/lib/socket";
import { YouTubePlayer } from "@/components/live/YouTubePlayer";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkshopHost {
  id: string;
  name: string;
  username?: string;
  avatar_url?: string | null;
  role?: string;
}

export interface LiveWorkshopItem {
  id: string;
  sessionId: string;
  roomId: string;
  title: string;
  description: string;
  topic: string;
  category: string;
  media: "video" | "audio";
  status: "live" | "scheduled" | "completed";
  starts_at: string;
  ends_at?: string;
  duration_minutes?: number;
  is_open_session?: boolean;
  host: WorkshopHost;
  room_name: string;
  participant_count: number;
  user_rsvp?: boolean;
  tags?: string[];
  recording_url?: string;
  recording_duration_seconds?: number;
  views?: number;
}

interface LiveWorkshopsResponse {
  success: boolean;
  stats: {
    activeBroadcastsCount: number;
    totalLiveParticipants: number;
    upcomingCount: number;
    recordedCount: number;
  };
  liveNow: LiveWorkshopItem[];
  upcoming: LiveWorkshopItem[];
  recordings: LiveWorkshopItem[];
  myWorkshops: LiveWorkshopItem[];
}

const TOPIC_CATEGORIES = [
  { id: "all", label: "All Topics", icon: "view-grid-outline" },
  { id: "coding", label: "Coding & CS", icon: "code-tags" },
  { id: "design", label: "UI/UX Design", icon: "palette-outline" },
  { id: "ai", label: "AI & ML", icon: "robot-outline" },
  { id: "exam", label: "Exam Prep", icon: "book-open-page-variant-outline" },
  { id: "career", label: "Career & Prep", icon: "briefcase-outline" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing Live Indicator Badge
// ─────────────────────────────────────────────────────────────────────────────
function PulsingBadge({ count }: { count?: number }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.85 + pulse.value * 0.25 }],
  }));

  return (
    <View style={styles.pulsingBadgeContainer}>
      <Animated.View style={[styles.pulsingDot, dotStyle]} />
      <Text style={styles.pulsingBadgeText}>
        LIVE NOW {count !== undefined && count > 0 ? `• ${count} watching` : ""}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Date Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatWorkshopSchedule(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    const timeString = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (diffMs > 0 && diffHours <= 1) {
      const diffMins = Math.max(1, Math.round(diffMs / (1000 * 60)));
      return `Starts in ${diffMins} min (${timeString})`;
    } else if (diffHours > 1 && diffHours < 24) {
      return `Today at ${timeString} (in ${diffHours}h)`;
    } else if (diffHours >= 24 && diffHours < 48) {
      return `Tomorrow at ${timeString}`;
    }

    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function extractYouTubeId(url?: string): string {
  if (!url) return "k3_tw44QsZQ";
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : "k3_tw44QsZQ";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Live Workshops Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveWorkshopsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<"all" | "live" | "upcoming" | "recordings" | "my_workshops">("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals State
  const [hostModalVisible, setHostModalVisible] = useState(false);
  const [joinCodeModalVisible, setJoinCodeModalVisible] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [replayModalItem, setReplayModalItem] = useState<LiveWorkshopItem | null>(null);

  // Host Form State
  const [hostTitle, setHostTitle] = useState("");
  const [hostDescription, setHostDescription] = useState("");
  const [hostTopic, setHostTopic] = useState("Computer Science");
  const [hostCategory, setHostCategory] = useState("coding");
  const [hostMedia, setHostMedia] = useState<"video" | "audio">("video");
  const [hostStartNow, setHostStartNow] = useState(true);
  const [hostDuration, setHostDuration] = useState(60);

  // Query Workshops
  const { data, isLoading, refetch, isRefetching } = useQuery<LiveWorkshopsResponse>({
    queryKey: ["live-workshops", searchQuery, selectedTopic],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (selectedTopic !== "all") params.set("topic", selectedTopic);
      const qs = params.toString();
      return api<LiveWorkshopsResponse>(`/live/workshops${qs ? `?${qs}` : ""}`);
    },
    staleTime: 10_000,
  });

  // Socket Live Feed Synchronization
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleLiveFeed = () => {
      queryClient.invalidateQueries({ queryKey: ["live-workshops"] });
    };
    socket.on("room:live:feed", handleLiveFeed);
    return () => {
      socket.off("room:live:feed", handleLiveFeed);
    };
  }, [queryClient]);

  // RSVP Mutation
  const rsvpMutation = useMutation({
    mutationFn: async ({ sessionId, currentRsvp }: { sessionId: string; currentRsvp: boolean }) => {
      if (currentRsvp) {
        return api(`/live/workshops/${sessionId}/rsvp`, { method: "DELETE" });
      }
      return api(`/live/workshops/${sessionId}/rsvp`, { method: "POST" });
    },
    onSuccess: () => {
      triggerHaptic();
      queryClient.invalidateQueries({ queryKey: ["live-workshops"] });
    },
    onError: (err: any) => {
      Alert.alert("Notice", err?.message || "Could not update registration.");
    },
  });

  // Host Workshop Mutation
  const hostMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api<any>("/live/workshops", { method: "POST", body: payload });
    },
    onSuccess: (res) => {
      triggerHaptic();
      setHostModalVisible(false);
      setHostTitle("");
      setHostDescription("");
      queryClient.invalidateQueries({ queryKey: ["live-workshops"] });

      if (res.isLive && res.redirectUrl) {
        router.push(res.redirectUrl as any);
      } else {
        Alert.alert("Success", "Workshop scheduled successfully! Students can now RSVP.");
      }
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to host workshop.");
    },
  });

  // Actions
  const handleJoinDirect = useCallback((targetId: string) => {
    triggerHaptic();
    router.push(`/live/${targetId}` as any);
  }, []);

  const handleQuickJoinSubmit = useCallback(() => {
    const clean = joinCodeInput.trim();
    if (!clean) return;
    triggerHaptic();
    setJoinCodeModalVisible(false);
    setJoinCodeInput("");
    router.push(`/live/${clean}` as any);
  }, [joinCodeInput]);

  const handleShareWorkshop = useCallback(async (item: LiveWorkshopItem) => {
    triggerHaptic();
    const shareMessage = `Join this campus workshop on SkillBridge: "${item.title}" with ${item.host.name}!\nSession ID: ${item.sessionId}`;
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(shareMessage);
      Alert.alert("Copied to Clipboard", "Workshop invitation details copied to clipboard!");
    } else {
      try {
        await Share.share({
          title: item.title,
          message: shareMessage,
        });
      } catch {}
    }
  }, []);

  const stats = data?.stats || {
    activeBroadcastsCount: data?.liveNow.length || 0,
    totalLiveParticipants: 41,
    upcomingCount: data?.upcoming.length || 0,
    recordedCount: data?.recordings.length || 0,
  };

  const liveList = data?.liveNow || [];
  const upcomingList = data?.upcoming || [];
  const recordingsList = data?.recordings || [];
  const myWorkshopsList = data?.myWorkshops || [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {/* ───────────────────────────────────────────────────────────────── */}
      {/* Top Navigation Bar                                                */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => {
            triggerHaptic();
            router.back();
          }}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t("liveWorkshops.title", "Live Workshops")}
            </Text>
            <View style={styles.liveIndicatorBadge}>
              <View style={styles.liveTinyDot} />
              <Text style={styles.liveIndicatorText}>HUB</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={[styles.headerSubtitle, { color: colors.muted }]}>
            {t("liveWorkshops.subtitle", "Interactive peer broadcasts & masterclasses")}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Join with Code"
            onPress={() => {
              triggerHaptic();
              setJoinCodeModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="dialpad" size={20} color={colors.primary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Host Workshop"
            onPress={() => {
              triggerHaptic();
              setHostModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.hostCtaBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.hostCtaText}>Host</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Hero Interactive Studio Banner                                   */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Image
            source={require("../../assets/nextgen-v2/hero-banners/live-class.png")}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["rgba(15, 23, 42, 0.4)", "rgba(15, 23, 42, 0.95)"]}
            style={styles.heroOverlay}
          >
            <View style={styles.heroTopBadges}>
              <View style={styles.heroTag}>
                <MaterialCommunityIcons name="broadcast" size={14} color="#EF4444" />
                <Text style={styles.heroTagText}>CAMPUS BROADCAST STAGE</Text>
              </View>
              <View style={[styles.heroTag, { backgroundColor: "rgba(56, 189, 248, 0.25)" }]}>
                <MaterialCommunityIcons name="shield-check" size={14} color="#38BDF8" />
                <Text style={[styles.heroTagText, { color: "#38BDF8" }]}>PEER CERTIFIED</Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>Master Real Skills with Campus Peers</Text>
            <Text style={styles.heroBody}>
              Join interactive hands-on coding sessions, ask questions on live audio stages, or broadcast your own workshop to the university community.
            </Text>

            {/* Live Statistics Counter Ribbon */}
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <View style={styles.heroStatValueRow}>
                  <View style={[styles.miniDot, { backgroundColor: "#EF4444" }]} />
                  <Text style={styles.heroStatValue}>{stats.activeBroadcastsCount}</Text>
                </View>
                <Text style={styles.heroStatLabel}>Live Now</Text>
              </View>

              <View style={styles.heroStatDivider} />

              <View style={styles.heroStatItem}>
                <View style={styles.heroStatValueRow}>
                  <MaterialCommunityIcons name="account-group" size={14} color="#38BDF8" />
                  <Text style={styles.heroStatValue}>{stats.totalLiveParticipants}</Text>
                </View>
                <Text style={styles.heroStatLabel}>Peers Joined</Text>
              </View>

              <View style={styles.heroStatDivider} />

              <View style={styles.heroStatItem}>
                <View style={styles.heroStatValueRow}>
                  <MaterialCommunityIcons name="calendar-clock" size={14} color="#F59E0B" />
                  <Text style={styles.heroStatValue}>{stats.upcomingCount}</Text>
                </View>
                <Text style={styles.heroStatLabel}>Scheduled</Text>
              </View>
            </View>

            {/* Quick Hero Launch Buttons */}
            <View style={styles.heroActionButtons}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setHostStartNow(true);
                  setHostModalVisible(true);
                }}
                style={({ pressed }) => [styles.heroBtnPrimary, { opacity: pressed ? 0.88 : 1 }]}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={18} color="#FFFFFF" />
                <Text style={styles.heroBtnPrimaryText}>Go Live Now</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setHostStartNow(false);
                  setHostModalVisible(true);
                }}
                style={({ pressed }) => [styles.heroBtnSecondary, { opacity: pressed ? 0.88 : 1 }]}
              >
                <MaterialCommunityIcons name="calendar-plus" size={18} color="#38BDF8" />
                <Text style={styles.heroBtnSecondaryText}>Schedule Class</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Search Bar & Code Entry Bar                                       */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("liveWorkshops.searchPlaceholder", "Search workshops, mentors, topics...")}
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Status / Section Tabs Ribbon                                      */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("all");
            }}
            style={[
              styles.tabPill,
              activeTab === "all"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="creation-outline"
              size={15}
              color={activeTab === "all" ? "#FFFFFF" : colors.muted}
            />
            <Text
              style={[
                styles.tabPillText,
                { color: activeTab === "all" ? "#FFFFFF" : colors.text },
              ]}
            >
              All Workshops
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("live");
            }}
            style={[
              styles.tabPill,
              activeTab === "live"
                ? { backgroundColor: "#EF4444" }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <View style={[styles.tinyLiveDot, { backgroundColor: activeTab === "live" ? "#FFFFFF" : "#EF4444" }]} />
            <Text
              style={[
                styles.tabPillText,
                { color: activeTab === "live" ? "#FFFFFF" : colors.text },
              ]}
            >
              Live Now ({liveList.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("upcoming");
            }}
            style={[
              styles.tabPill,
              activeTab === "upcoming"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="calendar-clock"
              size={15}
              color={activeTab === "upcoming" ? "#FFFFFF" : colors.muted}
            />
            <Text
              style={[
                styles.tabPillText,
                { color: activeTab === "upcoming" ? "#FFFFFF" : colors.text },
              ]}
            >
              Upcoming ({upcomingList.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("recordings");
            }}
            style={[
              styles.tabPill,
              activeTab === "recordings"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="play-box-multiple"
              size={15}
              color={activeTab === "recordings" ? "#FFFFFF" : colors.muted}
            />
            <Text
              style={[
                styles.tabPillText,
                { color: activeTab === "recordings" ? "#FFFFFF" : colors.text },
              ]}
            >
              Replays & Vault ({recordingsList.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("my_workshops");
            }}
            style={[
              styles.tabPill,
              activeTab === "my_workshops"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="bookmark-check"
              size={15}
              color={activeTab === "my_workshops" ? "#FFFFFF" : colors.muted}
            />
            <Text
              style={[
                styles.tabPillText,
                { color: activeTab === "my_workshops" ? "#FFFFFF" : colors.text },
              ]}
            >
              My Registered ({myWorkshopsList.length})
            </Text>
          </Pressable>
        </ScrollView>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Topic Filter Chips                                                */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicChipsRow}>
          {TOPIC_CATEGORIES.map((cat) => {
            const isSelected = selectedTopic === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  triggerHaptic();
                  setSelectedTopic(cat.id);
                }}
                style={[
                  styles.topicChip,
                  isSelected
                    ? { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={14}
                  color={isSelected ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    styles.topicChipText,
                    { color: isSelected ? colors.primary : colors.muted, fontWeight: isSelected ? "700" : "500" },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Loading Spinner */}
        {isLoading && !isRefetching && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>
              Connecting to campus live studio feeds...
            </Text>
          </View>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* SECTION 1: 🔴 LIVE NOW BROADCASTS                                */}
        {/* ───────────────────────────────────────────────────────────────── */}
        {(activeTab === "all" || activeTab === "live") && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithBadge}>
                <View style={[styles.tinyLiveDot, { backgroundColor: "#EF4444" }]} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Live Now On Air
                </Text>
                <View style={styles.counterBadge}>
                  <Text style={styles.counterBadgeText}>{liveList.length}</Text>
                </View>
              </View>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                Real-time peer masterclasses happening right now
              </Text>
            </View>

            {liveList.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Image
                  source={require("../../assets/nextgen-v2/empty-states/no-upcoming-events.png")}
                  style={styles.emptyImage}
                  resizeMode="contain"
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {t("liveWorkshops.noLiveNow", "No active broadcasts right now")}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  {t(
                    "liveWorkshops.noLiveNowSub",
                    "Start a live peer workshop to share your knowledge with fellow students!"
                  )}
                </Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setHostStartNow(true);
                    setHostModalVisible(true);
                  }}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="broadcast" size={18} color="#FFFFFF" />
                  <Text style={styles.emptyActionText}>Start Streaming Now</Text>
                </Pressable>
              </View>
            ) : (
              liveList.map((item) => (
                <View
                  key={item.id}
                  style={[styles.liveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {/* Card Header with Pulsing Live Status */}
                  <View style={styles.liveCardHeader}>
                    <PulsingBadge count={item.participant_count} />

                    <View style={styles.mediaPill}>
                      <MaterialCommunityIcons
                        name={item.media === "video" ? "video" : "microphone"}
                        size={14}
                        color={colors.primary}
                      />
                      <Text style={[styles.mediaPillText, { color: colors.primary }]}>
                        {item.media === "video" ? "HD Video" : "Audio Stage"}
                      </Text>
                    </View>
                  </View>

                  {/* Workshop Title & Room */}
                  <Text style={[styles.liveCardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.liveCardDescription, { color: colors.muted }]} numberOfLines={2}>
                    {item.description}
                  </Text>

                  {/* Host Info Row */}
                  <View style={styles.hostRow}>
                    {item.host.avatar_url ? (
                      <Image source={{ uri: item.host.avatar_url }} style={styles.hostAvatar} />
                    ) : (
                      <View style={[styles.hostAvatarFallback, { backgroundColor: `${colors.primary}30` }]}>
                        <Text style={[styles.hostAvatarInitial, { color: colors.primary }]}>
                          {item.host.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.hostMeta}>
                      <View style={styles.hostNameRow}>
                        <Text style={[styles.hostName, { color: colors.text }]}>{item.host.name}</Text>
                        <MaterialCommunityIcons name="check-decagram" size={14} color="#38BDF8" />
                      </View>
                      <Text style={[styles.hostRole, { color: colors.muted }]} numberOfLines={1}>
                        {item.host.role || "Campus Peer Mentor"} • {item.room_name}
                      </Text>
                    </View>
                  </View>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <View style={styles.tagsRow}>
                      {item.tags.map((tag, idx) => (
                        <View key={idx} style={[styles.tagBadge, { backgroundColor: `${colors.primary}12` }]}>
                          <Text style={[styles.tagBadgeText, { color: colors.primary }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Card Actions */}
                  <View style={styles.cardActionsRow}>
                    <Pressable
                      onPress={() => handleShareWorkshop(item)}
                      style={[styles.shareIconBtn, { borderColor: colors.border }]}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
                    </Pressable>

                    <Pressable
                      onPress={() => handleJoinDirect(item.sessionId || item.roomId || item.id)}
                      style={({ pressed }) => [
                        styles.joinLiveBtn,
                        { backgroundColor: "#EF4444", opacity: pressed ? 0.88 : 1 },
                      ]}
                    >
                      <MaterialCommunityIcons name="play-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.joinLiveBtnText}>Join Broadcast</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* SECTION 2: 📅 UPCOMING WORKSHOPS & MASTERCLASSES                  */}
        {/* ───────────────────────────────────────────────────────────────── */}
        {(activeTab === "all" || activeTab === "upcoming" || activeTab === "my_workshops") && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithBadge}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {activeTab === "my_workshops" ? "My Registered Workshops" : "Upcoming Scheduled Workshops"}
                </Text>
                <View style={styles.counterBadge}>
                  <Text style={styles.counterBadgeText}>
                    {activeTab === "my_workshops" ? myWorkshopsList.length : upcomingList.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                Interactive masterclasses you can register for ahead of time
              </Text>
            </View>

            {(activeTab === "my_workshops" ? myWorkshopsList : upcomingList).length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Image
                  source={require("../../assets/nextgen-v2/empty-states/no-upcoming-events.png")}
                  style={styles.emptyImage}
                  resizeMode="contain"
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {activeTab === "my_workshops"
                    ? "You haven't registered for any upcoming workshops yet"
                    : "No upcoming workshops scheduled in this category"}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  Browse the masterclass schedule and tap RSVP to secure your spot and receive live alerts!
                </Text>
              </View>
            ) : (
              (activeTab === "my_workshops" ? myWorkshopsList : upcomingList).map((item) => (
                <View
                  key={item.id}
                  style={[styles.upcomingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {/* Timing & Media Header */}
                  <View style={styles.upcomingTopRow}>
                    <View style={[styles.timeChip, { backgroundColor: `${colors.primary}18` }]}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={colors.primary} />
                      <Text style={[styles.timeChipText, { color: colors.primary }]}>
                        {formatWorkshopSchedule(item.starts_at)}
                      </Text>
                    </View>

                    <View style={styles.attendeesPill}>
                      <MaterialCommunityIcons name="account-group" size={14} color={colors.muted} />
                      <Text style={[styles.attendeesPillText, { color: colors.muted }]}>
                        {item.participant_count} registered
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.upcomingTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.upcomingDescription, { color: colors.muted }]} numberOfLines={2}>
                    {item.description}
                  </Text>

                  {/* Speaker Meta */}
                  <View style={styles.hostRow}>
                    {item.host.avatar_url ? (
                      <Image source={{ uri: item.host.avatar_url }} style={styles.hostAvatar} />
                    ) : (
                      <View style={[styles.hostAvatarFallback, { backgroundColor: `${colors.primary}30` }]}>
                        <Text style={[styles.hostAvatarInitial, { color: colors.primary }]}>
                          {item.host.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.hostMeta}>
                      <Text style={[styles.hostName, { color: colors.text }]}>{item.host.name}</Text>
                      <Text style={[styles.hostRole, { color: colors.muted }]}>
                        {item.host.role || "Peer Tutor"} • {item.room_name}
                      </Text>
                    </View>
                  </View>

                  {/* Takeaways & Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <View style={styles.tagsRow}>
                      {item.tags.map((tag, idx) => (
                        <View key={idx} style={[styles.tagBadge, { backgroundColor: `${colors.primary}12` }]}>
                          <Text style={[styles.tagBadgeText, { color: colors.primary }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Actions: RSVP Toggle & Share */}
                  <View style={styles.cardActionsRow}>
                    <Pressable
                      onPress={() => handleShareWorkshop(item)}
                      style={[styles.shareIconBtn, { borderColor: colors.border }]}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
                    </Pressable>

                    <Pressable
                      disabled={rsvpMutation.isPending}
                      onPress={() =>
                        rsvpMutation.mutate({
                          sessionId: item.sessionId || item.id,
                          currentRsvp: Boolean(item.user_rsvp),
                        })
                      }
                      style={({ pressed }) => [
                        styles.rsvpBtn,
                        item.user_rsvp
                          ? { backgroundColor: "#10B981" }
                          : { backgroundColor: colors.primary },
                        { opacity: pressed || rsvpMutation.isPending ? 0.85 : 1 },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.user_rsvp ? "check-circle" : "bell-ring-outline"}
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.rsvpBtnText}>
                        {item.user_rsvp
                          ? t("liveWorkshops.registered", "Registered ✓")
                          : t("liveWorkshops.rsvp", "RSVP Free")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* SECTION 3: 🎥 WORKSHOP REPLAYS & VAULT                           */}
        {/* ───────────────────────────────────────────────────────────────── */}
        {(activeTab === "all" || activeTab === "recordings") && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithBadge}>
                <MaterialCommunityIcons name="play-box-multiple" size={20} color="#8B5CF6" />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Recorded Workshop Vault
                </Text>
                <View style={styles.counterBadge}>
                  <Text style={styles.counterBadgeText}>{recordingsList.length}</Text>
                </View>
              </View>
              <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                Full session replays, slides, and recap code repositories
              </Text>
            </View>

            {recordingsList.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Image
                  source={require("../../assets/nextgen-v2/empty-states/no-recording-search.png")}
                  style={styles.emptyImage}
                  resizeMode="contain"
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No recorded workshops found
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  Past recorded masterclasses and workshops will automatically appear here once published!
                </Text>
              </View>
            ) : (
              recordingsList.map((item) => (
                <View
                  key={item.id}
                  style={[styles.recordingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.recordingTopRow}>
                    <View style={styles.replayPill}>
                      <MaterialCommunityIcons name="youtube" size={16} color="#EF4444" />
                      <Text style={styles.replayPillText}>FULL REPLAY</Text>
                    </View>
                    <Text style={[styles.recordingDuration, { color: colors.muted }]}>
                      {Math.round((item.recording_duration_seconds || 3600) / 60)} mins • {item.views || 450} views
                    </Text>
                  </View>

                  <Text style={[styles.recordingTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.recordingDescription, { color: colors.muted }]} numberOfLines={2}>
                    {item.description}
                  </Text>

                  {/* Speaker */}
                  <View style={styles.hostRow}>
                    {item.host.avatar_url ? (
                      <Image source={{ uri: item.host.avatar_url }} style={styles.hostAvatar} />
                    ) : (
                      <View style={[styles.hostAvatarFallback, { backgroundColor: `${colors.primary}30` }]}>
                        <Text style={[styles.hostAvatarInitial, { color: colors.primary }]}>
                          {item.host.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.hostMeta}>
                      <Text style={[styles.hostName, { color: colors.text }]}>{item.host.name}</Text>
                      <Text style={[styles.hostRole, { color: colors.muted }]}>{item.room_name}</Text>
                    </View>
                  </View>

                  {/* Play Action */}
                  <View style={styles.cardActionsRow}>
                    <Pressable
                      onPress={() => handleShareWorkshop(item)}
                      style={[styles.shareIconBtn, { borderColor: colors.border }]}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        setReplayModalItem(item);
                      }}
                      style={({ pressed }) => [
                        styles.watchReplayBtn,
                        { backgroundColor: "#8B5CF6", opacity: pressed ? 0.88 : 1 },
                      ]}
                    >
                      <MaterialCommunityIcons name="play" size={18} color="#FFFFFF" />
                      <Text style={styles.watchReplayBtnText}>Watch Replay & Slides</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: HOST A LIVE WORKSHOP CREATION WORKFLOW                    */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Modal
        visible={hostModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHostModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t("liveWorkshops.createTitle", "Host a Live Workshop")}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                  {t("liveWorkshops.createDesc", "Broadcast live video or host an audio discussion stage.")}
                </Text>
              </View>
              <Pressable onPress={() => setHostModalVisible(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              {/* Workshop Title */}
              <Text style={[styles.formLabel, { color: colors.text }]}>Workshop Title *</Text>
              <TextInput
                value={hostTitle}
                onChangeText={setHostTitle}
                placeholder="e.g. Full-Stack WebSockets & Real-time Architecture"
                placeholderTextColor={colors.muted}
                style={[styles.formInput, { color: colors.text, borderColor: colors.border }]}
              />

              {/* Description */}
              <Text style={[styles.formLabel, { color: colors.text }]}>What will students learn? *</Text>
              <TextInput
                value={hostDescription}
                onChangeText={setHostDescription}
                placeholder="Key takeaways, syllabus outline, or prerequisites..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[styles.formTextarea, { color: colors.text, borderColor: colors.border }]}
              />

              {/* Category & Topic Selector */}
              <Text style={[styles.formLabel, { color: colors.text }]}>Category & Field</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                {TOPIC_CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      triggerHaptic();
                      setHostCategory(cat.id);
                      setHostTopic(cat.label);
                    }}
                    style={[
                      styles.topicChip,
                      hostCategory === cat.id
                        ? { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }
                        : { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={15}
                      color={hostCategory === cat.id ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.topicChipText,
                        { color: hostCategory === cat.id ? colors.primary : colors.text },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Broadcast Media Format */}
              <Text style={[styles.formLabel, { color: colors.text }]}>Broadcast Media Format</Text>
              <View style={styles.mediaSelectRow}>
                <Pressable
                  onPress={() => setHostMedia("video")}
                  style={[
                    styles.mediaOptionBtn,
                    hostMedia === "video"
                      ? { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }
                      : { borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="video"
                    size={20}
                    color={hostMedia === "video" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.mediaOptionText,
                      { color: hostMedia === "video" ? colors.primary : colors.text },
                    ]}
                  >
                    HD Video & Screen Share
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setHostMedia("audio")}
                  style={[
                    styles.mediaOptionBtn,
                    hostMedia === "audio"
                      ? { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }
                      : { borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="microphone"
                    size={20}
                    color={hostMedia === "audio" ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.mediaOptionText,
                      { color: hostMedia === "audio" ? colors.primary : colors.text },
                    ]}
                  >
                    Interactive Audio Stage
                  </Text>
                </Pressable>
              </View>

              {/* Schedule Timing */}
              <Text style={[styles.formLabel, { color: colors.text }]}>When do you want to broadcast?</Text>
              <View style={styles.mediaSelectRow}>
                <Pressable
                  onPress={() => setHostStartNow(true)}
                  style={[
                    styles.mediaOptionBtn,
                    hostStartNow
                      ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "#EF4444" }
                      : { borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="lightning-bolt"
                    size={20}
                    color={hostStartNow ? "#EF4444" : colors.muted}
                  />
                  <Text
                    style={[
                      styles.mediaOptionText,
                      { color: hostStartNow ? "#EF4444" : colors.text },
                    ]}
                  >
                    Go Live Now (Instant)
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setHostStartNow(false)}
                  style={[
                    styles.mediaOptionBtn,
                    !hostStartNow
                      ? { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }
                      : { borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={20}
                    color={!hostStartNow ? colors.primary : colors.muted}
                  />
                  <Text
                    style={[
                      styles.mediaOptionText,
                      { color: !hostStartNow ? colors.primary : colors.text },
                    ]}
                  >
                    Schedule for Later
                  </Text>
                </Pressable>
              </View>

              {/* Duration */}
              <Text style={[styles.formLabel, { color: colors.text }]}>Estimated Duration (minutes)</Text>
              <View style={styles.durationRow}>
                {[30, 45, 60, 90].map((dur) => (
                  <Pressable
                    key={dur}
                    onPress={() => setHostDuration(dur)}
                    style={[
                      styles.durationChip,
                      hostDuration === dur
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        { color: hostDuration === dur ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {dur}m
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                disabled={hostMutation.isPending || !hostTitle.trim()}
                onPress={() => {
                  hostMutation.mutate({
                    title: hostTitle.trim(),
                    description: hostDescription.trim(),
                    topic: hostTopic,
                    category: hostCategory,
                    media: hostMedia,
                    startNow: hostStartNow,
                    durationMinutes: hostDuration,
                  });
                }}
                style={({ pressed }) => [
                  styles.submitHostBtn,
                  {
                    backgroundColor: hostStartNow ? "#EF4444" : colors.primary,
                    opacity: pressed || hostMutation.isPending || !hostTitle.trim() ? 0.8 : 1,
                  },
                ]}
              >
                {hostMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={hostStartNow ? "broadcast" : "calendar-check"}
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.submitHostBtnText}>
                      {hostStartNow ? "Launch Live Broadcast" : "Schedule Workshop"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: QUICK JOIN WITH WORKSHOP / ROOM CODE                      */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Modal
        visible={joinCodeModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setJoinCodeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.codeModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t("liveWorkshops.quickJoin", "Join with Code")}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                  Enter the session ID, room code, or direct invite link
                </Text>
              </View>
              <Pressable onPress={() => setJoinCodeModalVisible(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.codeModalBody}>
              <View style={[styles.codeInputWrap, { borderColor: colors.border }]}>
                <MaterialCommunityIcons name="key-variant" size={20} color={colors.primary} />
                <TextInput
                  value={joinCodeInput}
                  onChangeText={setJoinCodeInput}
                  placeholder="Paste Room ID or Session Code"
                  placeholderTextColor={colors.muted}
                  style={[styles.codeInput, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={async () => {
                    const text = await Clipboard.getStringAsync();
                    if (text) setJoinCodeInput(text.trim());
                  }}
                  style={styles.pasteBtn}
                >
                  <Text style={[styles.pasteBtnText, { color: colors.primary }]}>Paste</Text>
                </Pressable>
              </View>

              <Pressable
                disabled={!joinCodeInput.trim()}
                onPress={handleQuickJoinSubmit}
                style={({ pressed }) => [
                  styles.submitHostBtn,
                  { backgroundColor: colors.primary, opacity: pressed || !joinCodeInput.trim() ? 0.8 : 1 },
                ]}
              >
                <MaterialCommunityIcons name="arrow-right-circle" size={20} color="#FFFFFF" />
                <Text style={styles.submitHostBtnText}>Connect to Broadcast</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* MODAL 3: REPLAY VIDEO PLAYER MODAL                                */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(replayModalItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setReplayModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.replayModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text numberOfLines={1} style={[styles.modalTitle, { color: colors.text }]}>
                  {replayModalItem?.title}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                  Hosted by {replayModalItem?.host.name} • Recorded Masterclass
                </Text>
              </View>
              <Pressable onPress={() => setReplayModalItem(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.replayPlayerContainer}>
              <YouTubePlayer
                videoId={extractYouTubeId(replayModalItem?.recording_url)}
                isLive={false}
                autoplay={true}
              />
            </View>

            <ScrollView style={styles.replayModalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.replaySectionHeading, { color: colors.text }]}>Session Notes & Summary</Text>
              <Text style={[styles.replayDescription, { color: colors.muted }]}>
                {replayModalItem?.description}
              </Text>

              <View style={[styles.resourceBox, { backgroundColor: `${colors.primary}10`, borderColor: colors.primary }]}>
                <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resourceTitle, { color: colors.text }]}>
                    Lecture Slides & Code Examples
                  </Text>
                  <Text style={[styles.resourceSub, { color: colors.muted }]}>
                    Download accompanying source code and slide deck
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    Alert.alert("Resource Ready", "Materials have been added to your Saved Library (/saved).");
                  }}
                  style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  liveIndicatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  liveTinyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveIndicatorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#EF4444",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  hostCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  hostCtaText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scrollContent: {
    padding: spacing.md,
  },
  heroCard: {
    height: 240,
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
    marginBottom: spacing.md,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    padding: spacing.md,
    justifyContent: "flex-end",
  },
  heroTopBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  heroTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#EF4444",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  heroBody: {
    fontSize: 12,
    color: "#CBD5E1",
    lineHeight: 16,
    marginBottom: 10,
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  heroStatItem: {
    flex: 1,
    alignItems: "center",
  },
  heroStatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  heroStatLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 1,
  },
  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  heroActionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  heroBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  heroBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  heroBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.4)",
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  heroBtnSecondaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tinyLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  topicChipsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  topicChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  topicChipText: {
    fontSize: 12,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  sectionWrap: {
    marginTop: spacing.md,
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  counterBadge: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  counterBadgeText: {
    color: "#0284C7",
    fontSize: 11,
    fontWeight: "800",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyBox: {
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
  },
  emptyImage: {
    width: 140,
    height: 100,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginTop: 8,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  liveCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: 12,
  },
  liveCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pulsingBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  pulsingBadgeText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "800",
  },
  mediaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  mediaPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  liveCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  liveCardDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  hostAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  hostAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  hostAvatarInitial: {
    fontSize: 15,
    fontWeight: "800",
  },
  hostMeta: {
    flex: 1,
  },
  hostNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hostName: {
    fontSize: 13,
    fontWeight: "700",
  },
  hostRole: {
    fontSize: 11,
    marginTop: 1,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shareIconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  joinLiveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  joinLiveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  upcomingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: 12,
  },
  upcomingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  timeChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  attendeesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attendeesPillText: {
    fontSize: 11,
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  upcomingDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  rsvpBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  rsvpBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  recordingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: 12,
  },
  recordingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  replayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  replayPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#EF4444",
  },
  recordingDuration: {
    fontSize: 11,
  },
  recordingTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  recordingDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  watchReplayBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  watchReplayBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: "85%",
    padding: spacing.md,
  },
  codeModalCard: {
    margin: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBody: {
    maxHeight: 400,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextarea: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  mediaSelectRow: {
    flexDirection: "row",
    gap: 8,
  },
  mediaOptionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  mediaOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  durationRow: {
    flexDirection: "row",
    gap: 8,
  },
  durationChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  durationChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalFooter: {
    paddingTop: 14,
  },
  submitHostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  submitHostBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  codeModalBody: {
    gap: 14,
    paddingTop: 6,
  },
  codeInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    height: 48,
    gap: 8,
  },
  codeInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  pasteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  replayModalCard: {
    margin: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    maxHeight: "90%",
    padding: spacing.md,
  },
  replayPlayerContainer: {
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: 12,
  },
  replayModalBody: {
    maxHeight: 250,
  },
  replaySectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  replayDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  resourceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  resourceTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  resourceSub: {
    fontSize: 11,
    marginTop: 2,
  },
  downloadBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
