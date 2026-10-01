import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Screen, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme, type AppPalette } from "@/theme";
import { useI18n } from "@/i18n";
import { useOptionalAutoHideNavigation } from "@/navigation/AutoHideNavigationContext";

// ---------------------------------------------------------------------------
// Catalog model
// ---------------------------------------------------------------------------

type ToolBadge = "new" | "soon";

type ToolDef = {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  titleKey?: string;
  title: string;
  subtitleKey?: string;
  subtitle: string;
  route: string;
  /** Theme token used for the icon tint. */
  colorKey?: keyof AppPalette;
  /** Literal brand tint; takes precedence over `colorKey`. */
  color?: string;
  badge?: ToolBadge;
};

type ToolCategoryDef = {
  key: string;
  title: string;
  titleKey: string;
  tintKey: keyof AppPalette;
  tools: ToolDef[];
};

const H_PADDING = spacing.md;
const CARD_GAP = 10;
const CARD_COLUMNS_BREAKPOINT = 360;
const MANUAL_SCROLL_LOCK_MS = 700;
const SECTION_NUDGE = 6;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 20, minimumViewTime: 0 };

function toolTint(def: ToolDef, colors: AppPalette): string {
  return def.color ?? colors[def.colorKey ?? "primary"];
}

function badgePalette(badge: ToolBadge, colors: AppPalette): { bg: string; fg: string } {
  return badge === "soon"
    ? { bg: `${colors.warning}22`, fg: colors.warning }
    : { bg: colors.primarySoft, fg: colors.primary };
}

// ---------------------------------------------------------------------------
// Comprehensive Tool Catalog — All student tools with concise, lightweight text
// ---------------------------------------------------------------------------

const TOOL_CATALOG: ToolCategoryDef[] = [
  {
    key: "command-centers",
    title: "Space & Control Hubs",
    titleKey: "tools.spaceControlHubs",
    tintKey: "primary",
    tools: [
      {
        key: "club-manage",
        icon: "shield-crown",
        title: "Club Command",
        titleKey: "tools.clubManageTitle",
        subtitle: "Joined, created & member invites",
        subtitleKey: "tools.clubManageSubtitle",
        route: "/club/manage",
        color: "#F59E0B",
        badge: "new",
      },
      {
        key: "room-manage",
        icon: "door-open",
        title: "Room Controls",
        titleKey: "tools.roomManageTitle",
        subtitle: "Hosted & joined room settings",
        subtitleKey: "tools.roomManageSubtitle",
        route: "/room/manage",
        color: "#6366F1",
        badge: "new",
      },
      {
        key: "my-posts",
        icon: "post-outline",
        title: "My Posts Hub",
        titleKey: "tools.myPostsTitle",
        subtitle: "Previous posts, edit & re-upload",
        subtitleKey: "tools.myPostsSubtitle",
        route: "/posts",
        color: "#10B981",
        badge: "new",
      },
      {
        key: "student-clubs",
        icon: "account-group-outline",
        title: "Club Directory",
        subtitle: "Browse all campus societies",
        route: "/clubs",
        colorKey: "warning",
      },
    ],
  },
  {
    key: "academic",
    title: "Academic & Learning",
    titleKey: "tools.academicEngines",
    tintKey: "primary",
    tools: [
      {
        key: "ask-help",
        icon: "help-circle-outline",
        title: "Ask Help",
        subtitle: "Peer Q&A & answers",
        route: "/help/questions",
        colorKey: "primary",
      },
      {
        key: "research-hub",
        icon: "flask-outline",
        title: "Research Hub",
        subtitle: "Faculty labs & papers",
        route: "/research",
        colorKey: "info",
      },
      {
        key: "skill-quizzes",
        icon: "brain",
        title: "Skill Passport",
        subtitle: "Custom AI verification",
        route: "/quiz",
        color: "#8B5CF6",
        badge: "new",
      },
      {
        key: "tutor-bookings",
        icon: "calendar-check-outline",
        title: "Peer Tutors",
        subtitle: "Book 1-on-1 tutoring",
        route: "/bookings",
        colorKey: "success",
        badge: "new",
      },
      {
        key: "academic-schedule",
        icon: "calendar-clock",
        title: "Visual Routine",
        subtitle: "Interactive schedule",
        route: "/calendar",
        colorKey: "accent",
      },
      {
        key: "study-goals",
        icon: "target",
        title: "Study Goals",
        subtitle: "Daily habit targets",
        route: "/goals",
        color: "#EC4899",
      },
      {
        key: "semester-planner",
        icon: "notebook-outline",
        title: "Course Planner",
        subtitle: "Roadmap & syllabi",
        route: "/planner",
        color: "#3B82F6",
      },
      {
        key: "gpa-progress",
        icon: "chart-line",
        title: "Academic Progress",
        subtitle: "GPA & milestone tracking",
        route: "/progress",
        color: "#10B981",
      },
      {
        key: "achievements",
        icon: "medal-outline",
        title: "Honors & Badges",
        subtitle: "Academic awards",
        route: "/achievements",
        color: "#F59E0B",
      },
    ],
  },
  {
    key: "community",
    title: "Community & Spaces",
    titleKey: "tools.communityCampus",
    tintKey: "warning",
    tools: [
      {
        key: "network-hub",
        icon: "account-multiple-outline",
        title: "Network Hub",
        subtitle: "Connections & invites",
        route: "/connections",
        color: "#06B6D4",
        badge: "new",
      },
      {
        key: "student-clubs",
        icon: "account-group-outline",
        title: "Club Hub",
        subtitle: "Societies & executives",
        route: "/clubs",
        colorKey: "warning",
      },
      {
        key: "campus-events",
        icon: "calendar-star",
        title: "Campus Events",
        subtitle: "Weather & conflicts AI",
        route: "/events",
        colorKey: "danger",
        badge: "new",
      },
      {
        key: "study-rooms",
        icon: "door-open",
        title: "Study Rooms",
        subtitle: "Discord & Telegram spaces",
        route: "/room/create",
        color: "#6366F1",
      },
      {
        key: "campus-leaderboard",
        icon: "trophy-outline",
        title: "Leaderboard",
        subtitle: "Top student rankings",
        route: "/leaderboard",
        color: "#EAB308",
      },
      {
        key: "saved-materials",
        icon: "bookmark-multiple-outline",
        title: "Saved Items",
        subtitle: "Liked posts & research",
        route: "/saved",
        colorKey: "primary",
      },
      {
        key: "hackathons",
        icon: "code-tags",
        title: "Challenges",
        subtitle: "Campus hackathons",
        route: "/challenges",
        color: "#8B5CF6",
      },
      {
        key: "live-streaming",
        icon: "broadcast",
        title: "Live Workshops",
        subtitle: "Peer broadcast sessions",
        route: "/live",
        color: "#EF4444",
      },
      {
        key: "campus-notices",
        icon: "bell-outline",
        title: "Campus Notices",
        subtitle: "Department alerts",
        route: "/notifications",
        color: "#F59E0B",
      },
    ],
  },
  {
    key: "preferences",
    title: "Preferences & Security",
    titleKey: "tools.preferencesConfig",
    tintKey: "accent",
    tools: [
      {
        key: "customize-feed",
        icon: "tune-variant",
        title: "Customize Home",
        subtitle: "Rearrange cards & widgets",
        route: "/dashboard/customize",
        colorKey: "primary",
      },
      {
        key: "media-integrations",
        icon: "youtube",
        title: "Integrations",
        subtitle: "Media & YouTube sync",
        route: "/settings/integrations",
        color: "#EF4444",
        badge: "new",
      },
      {
        key: "campus-admin",
        icon: "shield-crown-outline",
        title: "Campus Admin",
        subtitle: "Moderation & roles",
        route: "/admin",
        color: "#D97706",
      },
      {
        key: "settings-privacy",
        icon: "cog-outline",
        title: "Settings & Privacy",
        subtitle: "Password & security",
        route: "/settings",
        colorKey: "muted",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Flattened row model
// ---------------------------------------------------------------------------

type ListRow =
  | { kind: "profile"; key: string; categoryIndex: number }
  | {
      kind: "section";
      key: string;
      categoryIndex: number;
      title: string;
      tintKey: keyof AppPalette;
      count: number;
    }
  | { kind: "cards"; key: string; categoryIndex: number; items: ToolDef[] }
  | { kind: "signout"; key: string; categoryIndex: number };

// ---------------------------------------------------------------------------
// Sticky category pill
// ---------------------------------------------------------------------------

const CategoryPill = memo(function CategoryPill({
  index,
  label,
  active,
  onPress,
  onMeasure,
}: {
  index: number;
  label: string;
  active: boolean;
  onPress: (index: number) => void;
  onMeasure: (index: number, x: number, width: number) => void;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(active ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.primary]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
    transform: [{ scale: pressScale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.white]),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      onMeasure(index, x, width);
    },
    [index, onMeasure],
  );

  const handlePressIn = useCallback(() => {
    pressScale.value = withTiming(0.96, { duration: 90 });
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, { damping: 16, stiffness: 260 });
  }, [pressScale]);

  const handlePress = useCallback(() => {
    onPress(index);
  }, [index, onPress]);

  return (
    <Animated.View onLayout={handleLayout} style={[s.pill, containerStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        hitSlop={6}
        style={s.pillPress}
      >
        <Animated.Text numberOfLines={1} style={[s.pillLabel, labelStyle]}>
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Tool card — tactile 0.97 press feedback, native-driven
// ---------------------------------------------------------------------------

const ToolCard = memo(function ToolCard({
  def,
  width,
  onOpen,
}: {
  def: ToolDef;
  width: number;
  onOpen: (route: string) => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: 90 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 18, stiffness: 280 });
  }, [scale]);

  const handlePress = useCallback(() => {
    onOpen(def.route);
  }, [def.route, onOpen]);

  const tint = toolTint(def, colors);
  const badge = def.badge ? badgePalette(def.badge, colors) : null;
  const badgeLabel = def.badge === "new" ? "NEW" : "SOON";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={def.title}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={{ width }}
    >
      <Animated.View
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }, animatedStyle]}
      >
        <View style={s.cardTop}>
          <View style={[s.cardIcon, { backgroundColor: `${tint}18` }]}>
            <MaterialCommunityIcons name={def.icon} size={22} color={tint} />
          </View>
          {badge ? (
            <View style={[s.badge, { backgroundColor: badge.bg }]}>
              <Text numberOfLines={1} style={[s.badgeText, { color: badge.fg }]}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={[s.cardTitle, { color: colors.text }]}>
          {def.title}
        </Text>
        <Text numberOfLines={1} style={[s.cardSubtitle, { color: colors.muted }]}>
          {def.subtitle}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

const SectionHeading = memo(function SectionHeading({
  categoryIndex,
  title,
  count,
  tintKey,
  onMeasure,
}: {
  categoryIndex: number;
  title: string;
  count: number;
  tintKey: keyof AppPalette;
  onMeasure: (categoryIndex: number, y: number) => void;
}) {
  const { colors } = useTheme();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onMeasure(categoryIndex, event.nativeEvent.layout.y);
    },
    [categoryIndex, onMeasure],
  );

  return (
    <View onLayout={handleLayout} style={s.sectionRow}>
      <View style={[s.sectionAccent, { backgroundColor: colors[tintKey] }]} />
      <Text numberOfLines={1} style={[s.sectionTitle, { color: colors.text }]}>
        {title}
      </Text>
      <View style={[s.sectionCount, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Text style={[s.sectionCountText, { color: colors.muted }]}>{count}</Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Facebook-style Profile Card with Switcher Button
// ---------------------------------------------------------------------------

const ToolsProfileCard = memo(function ToolsProfileCard({
  profile,
  activePersona,
  onOpenProfile,
  onOpenSwitcher,
}: {
  profile: Profile | undefined;
  activePersona: string;
  onOpenProfile: () => void;
  onOpenSwitcher: () => void;
}) {
  const { colors } = useTheme();

  if (!profile) return null;

  return (
    <View style={s.profileCardContainer}>
      <View style={[s.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenProfile}
          style={({ pressed }) => [s.profileMainClickable, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[s.avatarCircle, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>
              {profile.full_name?.[0] || "U"}
            </Text>
          </View>
          <View style={s.profileTextWrap}>
            <Text numberOfLines={1} style={[s.profileName, { color: colors.text }]}>
              {profile.full_name}
            </Text>
            <Text numberOfLines={1} style={[s.profileHandle, { color: colors.muted }]}>
              @{profile.username} · {profile.university || "SkillBridge"}
            </Text>
            <View style={[s.activeRoleBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="shield-check" size={12} color={colors.primary} />
              <Text style={[s.activeRoleText, { color: colors.primary }]}>{activePersona}</Text>
            </View>
          </View>
        </Pressable>

        {/* Facebook-style Switch Profile Button */}
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSwitcher}
          style={({ pressed }) => [
            s.switchProfileBtn,
            { backgroundColor: colors.primarySoft, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="account-switch-outline" size={16} color={colors.primary} />
          <Text style={[s.switchProfileBtnText, { color: colors.primary }]}>Switch</Text>
        </Pressable>
      </View>

      {/* Quick 1-tap Hubs Shortcut Strip */}
      <View style={s.quickHubsStrip}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            router.push("/club/manage" as any);
          }}
          style={({ pressed }) => [
            s.quickHubBtn,
            { backgroundColor: "#F59E0B14", borderColor: "#F59E0B44", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="shield-crown-outline" size={14} color="#D97706" />
          <Text style={[s.quickHubBtnText, { color: "#D97706" }]}>My Clubs</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            router.push("/room/manage" as any);
          }}
          style={({ pressed }) => [
            s.quickHubBtn,
            { backgroundColor: "#6366F114", borderColor: "#6366F144", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="door-open" size={14} color="#4F46E5" />
          <Text style={[s.quickHubBtnText, { color: "#4F46E5" }]}>Room Controls</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            triggerHaptic();
            router.push("/posts" as any);
          }}
          style={({ pressed }) => [
            s.quickHubBtn,
            { backgroundColor: "#10B98114", borderColor: "#10B98144", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="post-outline" size={14} color="#059669" />
          <Text style={[s.quickHubBtnText, { color: "#059669" }]}>My Posts</Text>
        </Pressable>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Sign Out Card Component
// ---------------------------------------------------------------------------

const SignOutCard = memo(function SignOutCard({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onSignOut}
      style={({ pressed }) => [
        s.signOutCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[s.signOutIconCircle, { backgroundColor: "#EF444415" }]}>
        <MaterialCommunityIcons name="logout-variant" size={20} color="#EF4444" />
      </View>
      <View style={s.signOutTextWrap}>
        <Text style={s.signOutTitle}>Sign Out</Text>
        <Text style={[s.signOutSubtitle, { color: colors.muted }]}>
          Safely log out of your session on this device
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Main Tools Screen
// ---------------------------------------------------------------------------

export default function ToolsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const autoHideNav = useOptionalAutoHideNavigation();

  // Profile Switching State (Facebook style)
  const [activePersonaId, setActivePersonaId] = useState("student");
  const [activePersona, setActivePersona] = useState("🎓 Student Account");
  const [switchModalVisible, setSwitchModalVisible] = useState(false);

  const { data, isRefetching, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const profile = data?.profile;

  const columns = width < CARD_COLUMNS_BREAKPOINT ? 1 : 2;
  const cardWidth = useMemo(
    () => Math.floor((width - H_PADDING * 2 - CARD_GAP * (columns - 1)) / columns),
    [width, columns],
  );

  // Flattened data: Profile + categories + cards + Sign Out card
  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [{ kind: "profile", key: "tools-profile", categoryIndex: 0 }];
    TOOL_CATALOG.forEach((category, categoryIndex) => {
      out.push({
        kind: "section",
        key: `section-${category.key}`,
        categoryIndex,
        title: category.title,
        tintKey: category.tintKey,
        count: category.tools.length,
      });
      for (let start = 0; start < category.tools.length; start += columns) {
        out.push({
          kind: "cards",
          key: `cards-${category.key}-${start}`,
          categoryIndex,
          items: category.tools.slice(start, start + columns),
        });
      }
    });
    out.push({
      kind: "signout",
      key: "tools-signout",
      categoryIndex: TOOL_CATALOG.length - 1,
    });
    return out;
  }, [columns]);

  const sectionRowIndex = useMemo(() => {
    const map: Record<number, number> = {};
    rows.forEach((row, index) => {
      if (row.kind === "section") map[row.categoryIndex] = index;
    });
    return map;
  }, [rows]);

  const listRef = useRef<FlatList<ListRow>>(null);
  const categoryBarRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<number, number>>({});
  const pillLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const pillContentWidth = useRef(0);
  const screenWidthRef = useRef(width);
  const activeIndexRef = useRef(0);
  const isManualScrolling = useRef(false);
  const manualLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToIndexRetries = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    screenWidthRef.current = width;
  }, [width]);

  useEffect(
    () => () => {
      if (manualLockTimer.current) clearTimeout(manualLockTimer.current);
    },
    [],
  );

  const releaseManualScroll = useCallback(() => {
    if (manualLockTimer.current) {
      clearTimeout(manualLockTimer.current);
      manualLockTimer.current = null;
    }
    isManualScrolling.current = false;
  }, []);

  const scrollCategoryIntoView = useCallback((index: number) => {
    const layout = pillLayouts.current[index];
    const viewport = screenWidthRef.current;
    if (!layout || viewport <= 0) return;
    const maxOffset = Math.max(0, pillContentWidth.current - viewport);
    const centered = layout.x + layout.width / 2 - viewport / 2;
    categoryBarRef.current?.scrollTo({
      x: Math.min(Math.max(centered, 0), maxOffset),
      animated: true,
    });
  }, []);

  const handleCategoryPress = useCallback(
    (index: number) => {
      triggerHaptic();
      isManualScrolling.current = true;
      scrollToIndexRetries.current = 0;
      if (manualLockTimer.current) clearTimeout(manualLockTimer.current);
      manualLockTimer.current = setTimeout(releaseManualScroll, MANUAL_SCROLL_LOCK_MS);

      activeIndexRef.current = index;
      setActiveIndex((previous) => (previous === index ? previous : index));
      scrollCategoryIntoView(index);

      const offset = sectionOffsets.current[index];
      if (typeof offset === "number") {
        listRef.current?.scrollToOffset({
          offset: Math.max(offset - SECTION_NUDGE, 0),
          animated: true,
        });
        return;
      }

      const rowIndex = sectionRowIndex[index];
      if (typeof rowIndex === "number") {
        listRef.current?.scrollToIndex({ index: rowIndex, animated: true, viewPosition: 0 });
      }
    },
    [releaseManualScroll, scrollCategoryIntoView, sectionRowIndex],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (scrollToIndexRetries.current >= 2) return;
      scrollToIndexRetries.current += 1;
      const estimated = Math.max(0, info.averageItemLength * info.index);
      listRef.current?.scrollToOffset({ offset: estimated, animated: false });
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 });
      }, 160);
    },
    [],
  );

  const handleSectionMeasure = useCallback((categoryIndex: number, y: number) => {
    sectionOffsets.current[categoryIndex] = y;
  }, []);

  const handlePillMeasure = useCallback((index: number, x: number, width: number) => {
    pillLayouts.current[index] = { x, width };
  }, []);

  const handlePillContentSize = useCallback((contentWidth: number) => {
    pillContentWidth.current = contentWidth;
  }, []);

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken<ListRow>[] }) => {
      if (isManualScrolling.current) return;
      let nextIndex: number | null = null;
      for (let i = 0; i < info.viewableItems.length; i += 1) {
        const token = info.viewableItems[i];
        if (!token.isViewable || !token.item) continue;
        const candidate = token.item.categoryIndex;
        if (nextIndex === null || candidate < nextIndex) {
          nextIndex = candidate;
        }
      }
      if (nextIndex === null || nextIndex === activeIndexRef.current) return;
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      scrollCategoryIntoView(nextIndex);
    },
    [scrollCategoryIntoView],
  );

  const handleOpenRoute = useCallback((route: string) => {
    triggerHaptic();
    router.push(route as any);
  }, []);

  const handleOpenProfile = useCallback(() => {
    triggerHaptic();
    router.push("/(tabs)/profile" as any);
  }, []);

  const handleOpenSwitcher = useCallback(() => {
    triggerHaptic();
    setSwitchModalVisible(true);
  }, []);

  const handleSignOut = useCallback(() => {
    triggerHaptic();
    Alert.alert("Sign Out", "Are you sure you want to log out of SkillBridge?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            router.replace("/(auth)/login" as any);
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed to log out");
          }
        },
      },
    ]);
  }, []);

  const handleRefresh = useCallback(() => {
    triggerHaptic();
    void refetch();
  }, [refetch]);

  const keyExtractor = useCallback((row: ListRow) => row.key, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListRow>) => {
      switch (item.kind) {
        case "profile":
          return (
            <ToolsProfileCard
              profile={profile}
              activePersona={activePersona}
              onOpenProfile={handleOpenProfile}
              onOpenSwitcher={handleOpenSwitcher}
            />
          );
        case "section":
          return (
            <SectionHeading
              categoryIndex={item.categoryIndex}
              title={item.title}
              count={item.count}
              tintKey={item.tintKey}
              onMeasure={handleSectionMeasure}
            />
          );
        case "signout":
          return <SignOutCard onSignOut={handleSignOut} />;
        default:
          return (
            <Animated.View entering={FadeInUp.duration(260)} style={s.cardsRow}>
              {item.items.map((def) => (
                <ToolCard key={def.key} def={def} width={cardWidth} onOpen={handleOpenRoute} />
              ))}
            </Animated.View>
          );
      }
    },
    [
      activePersona,
      cardWidth,
      handleOpenProfile,
      handleOpenRoute,
      handleOpenSwitcher,
      handleSectionMeasure,
      handleSignOut,
      profile,
    ],
  );

  const listBottomPadding = (autoHideNav?.bottomNavHeight ?? 72) + spacing.lg;

  return (
    <Screen
      header={<AppHeader searchPlaceholder={t("tools.searchPlaceholder")} />}
      scroll={false}
      contentStyle={s.screen}
    >
      {/* Pinned Category Pills Bar */}
      <View style={[s.stickyBar, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <ScrollView
          ref={categoryBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={handlePillContentSize}
          contentContainerStyle={s.pillRow}
          accessibilityLabel={t("tools.categoriesLabel")}
        >
          {TOOL_CATALOG.map((category, index) => (
            <CategoryPill
              key={category.key}
              index={index}
              label={category.title}
              active={index === activeIndex}
              onPress={handleCategoryPress}
              onMeasure={handlePillMeasure}
            />
          ))}
        </ScrollView>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onMomentumScrollEnd={releaseManualScroll}
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
        style={s.list}
        initialNumToRender={5}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary, colors.primary2]}
            progressBackgroundColor={colors.surface}
            progressViewOffset={(autoHideNav?.headerHeight ?? 56) + 8}
          />
        }
      />

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Facebook-style Profile Switcher Modal                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={switchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSwitchModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="account-switch" size={22} color={colors.primary} />
                <Text style={[s.modalHeaderTitle, { color: colors.text }]}>Switch Profile</Text>
              </View>
              <Pressable onPress={() => setSwitchModalVisible(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={[s.modalHeaderSub, { color: colors.muted }]}>
              Switch between student learning, peer tutor mode, or club administration
            </Text>

            <View style={s.personaList}>
              {[
                {
                  id: "student",
                  name: profile?.full_name || "Primary Student Profile",
                  role: "Learning, Routine & Course Quizzes",
                  icon: "school",
                  tag: "🎓 Student Account",
                },
                {
                  id: "tutor",
                  name: `${profile?.full_name || "Member"} · Tutor`,
                  role: "Teaching, Availability & Bookings",
                  icon: "teach",
                  tag: "👨‍🏫 Tutor Mode",
                },
                {
                  id: "club_exec",
                  name: `${profile?.full_name || "Member"} · Executive`,
                  role: "Society Leadership & Campus Events",
                  icon: "account-tie",
                  tag: "🏛️ Club Exec",
                },
              ].map((item) => {
                const isActive = activePersonaId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      triggerHaptic();
                      setActivePersonaId(item.id);
                      setActivePersona(item.tag);
                      setSwitchModalVisible(false);
                      Alert.alert("Profile Switched", `Now active as: ${item.tag}`);
                    }}
                    style={[
                      s.personaItem,
                      {
                        backgroundColor: isActive ? `${colors.primary}12` : colors.surface2,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[s.personaIconWrap, { backgroundColor: colors.primarySoft }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.personaItemName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[s.personaItemRole, { color: colors.muted }]}>{item.role}</Text>
                    </View>
                    {isActive ? (
                      <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="radiobox-blank" size={20} color={colors.muted} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic();
                setSwitchModalVisible(false);
                router.push("/(auth)/login" as any);
              }}
              style={[s.addAccountBtn, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
              <Text style={[s.addAccountBtnText, { color: colors.primary }]}>
                Add or link another student account
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: { padding: 0, gap: 0 },
  list: { flex: 1 },
  stickyBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  pillRow: {
    paddingHorizontal: H_PADDING,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    alignItems: "center",
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  pillPress: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: H_PADDING,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  card: {
    width: "100%",
    minHeight: 106,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    elevation: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "800",
  },
  cardSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "800",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: H_PADDING,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: "800",
  },
  sectionCount: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCountText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  profileCardContainer: {
    marginHorizontal: H_PADDING,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: 8,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  quickHubsStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickHubBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  quickHubBtnText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  profileMainClickable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileTextWrap: { flex: 1, gap: 2 },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "800",
  },
  profileHandle: {
    fontSize: 11,
    lineHeight: 15,
  },
  activeRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
  activeRoleText: {
    fontSize: 10,
    fontWeight: "800",
  },
  switchProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  switchProfileBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginHorizontal: H_PADDING,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    gap: 12,
  },
  signOutIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutTextWrap: { flex: 1, gap: 2 },
  signOutTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#EF4444",
  },
  signOutSubtitle: {
    fontSize: 11.5,
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
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  modalHeaderSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  personaList: {
    gap: 8,
    marginTop: 4,
  },
  personaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  personaIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  personaItemName: {
    fontSize: 13.5,
    fontWeight: "800",
  },
  personaItemRole: {
    fontSize: 11,
    marginTop: 1,
  },
  addAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addAccountBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
});
