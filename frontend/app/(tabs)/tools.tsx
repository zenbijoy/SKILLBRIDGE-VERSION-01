import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
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
import type { Profile } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Muted, Screen, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme, type AppPalette } from "@/theme";
import { useI18n } from "@/i18n";
import { useOptionalAutoHideNavigation } from "@/navigation/AutoHideNavigationContext";

// ---------------------------------------------------------------------------
// Catalog model (data preserved verbatim from the original Tools screen)
// ---------------------------------------------------------------------------

type ToolBadge = "new" | "soon";

type ToolDef = {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  titleKey: string;
  subtitleKey: string;
  route: string;
  /** Theme token used for the icon tint. */
  colorKey?: keyof AppPalette;
  /** Literal brand tint; takes precedence over `colorKey`. */
  color?: string;
  badge?: ToolBadge;
};

type ToolCategoryDef = {
  key: string;
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
// Tool catalog — titles, subtitles, icons, routes and tints are the exact
// values used by the previous implementation (i18n keys unchanged).
// ---------------------------------------------------------------------------

const TOOL_CATALOG: ToolCategoryDef[] = [
  {
    key: "academic",
    titleKey: "tools.academicEngines",
    tintKey: "primary",
    tools: [
      {
        key: "ask-help",
        icon: "help-circle-outline",
        titleKey: "tools.askHelpTitle",
        subtitleKey: "tools.askHelpSubtitle",
        route: "/help/questions",
        colorKey: "primary",
      },
      {
        key: "research-hub",
        icon: "flask-outline",
        titleKey: "tools.researchHubTitle",
        subtitleKey: "tools.researchHubSubtitle",
        route: "/research",
        colorKey: "info",
      },
      {
        key: "skill-quizzes",
        icon: "brain",
        titleKey: "tools.skillQuizzesTitle",
        subtitleKey: "tools.skillQuizzesSubtitle",
        route: "/quiz",
        color: "#8B5CF6",
      },
      {
        key: "academic-schedule",
        icon: "calendar-clock",
        titleKey: "tools.academicScheduleTitle",
        subtitleKey: "tools.academicScheduleSubtitle",
        route: "/schedule",
        colorKey: "accent",
      },
      {
        key: "tutor-bookings",
        icon: "calendar-check-outline",
        titleKey: "tools.tutorBookingsTitle",
        subtitleKey: "tools.tutorBookingsSubtitle",
        route: "/bookings",
        colorKey: "success",
      },
    ],
  },
  {
    key: "community",
    titleKey: "tools.communityCampus",
    tintKey: "warning",
    tools: [
      {
        key: "student-clubs",
        icon: "account-group-outline",
        titleKey: "tools.studentClubsTitle",
        subtitleKey: "tools.studentClubsSubtitle",
        route: "/clubs",
        colorKey: "warning",
      },
      {
        key: "campus-events",
        icon: "calendar-star",
        titleKey: "tools.campusEventsTitle",
        subtitleKey: "tools.campusEventsSubtitle",
        route: "/events",
        colorKey: "danger",
      },
      {
        key: "campus-leaderboard",
        icon: "trophy-outline",
        titleKey: "tools.campusLeaderboardTitle",
        subtitleKey: "tools.campusLeaderboardSubtitle",
        route: "/leaderboard",
        color: "#EAB308",
      },
      {
        key: "saved-materials",
        icon: "bookmark-multiple-outline",
        titleKey: "tools.savedMaterialsTitle",
        subtitleKey: "tools.savedMaterialsSubtitle",
        route: "/saved",
        colorKey: "primary",
      },
    ],
  },
  {
    key: "preferences",
    titleKey: "tools.preferencesConfig",
    tintKey: "accent",
    tools: [
      {
        key: "customize-feed",
        icon: "tune-variant",
        titleKey: "tools.customizeFeedTitle",
        subtitleKey: "tools.customizeFeedSubtitle",
        route: "/dashboard/customize",
        colorKey: "primary",
      },
      {
        key: "media-integrations",
        icon: "youtube",
        titleKey: "tools.mediaIntegrationsTitle",
        subtitleKey: "tools.mediaIntegrationsSubtitle",
        route: "/settings/integrations",
        color: "#EF4444",
        badge: "new",
      },
      {
        key: "settings-privacy",
        icon: "cog-outline",
        titleKey: "tools.settingsPrivacyTitle",
        subtitleKey: "tools.settingsPrivacySubtitle",
        route: "/settings",
        colorKey: "muted",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Flattened row model — one FlatList virtualises every card, while the pinned
// category bar stays a sibling (never a nested scroll container).
// ---------------------------------------------------------------------------

type ListRow =
  | { kind: "profile"; key: string; categoryIndex: number }
  | {
      kind: "section";
      key: string;
      categoryIndex: number;
      titleKey: string;
      tintKey: keyof AppPalette;
      count: number;
    }
  | { kind: "cards"; key: string; categoryIndex: number; items: ToolDef[] };

// ---------------------------------------------------------------------------
// Sticky category pill — the active indicator is animated on the UI thread.
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
  const { t } = useI18n();
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
        accessibilityLabel={`${t("tools.a11yCategory")}: ${label}`}
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
// Tool card — tactile 0.97 press feedback, native-driven.
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
  const { t } = useI18n();
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
  const badgeLabel = def.badge === "new" ? t("tools.badgeNew") : t("tools.badgeSoon");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(def.titleKey)}
      accessibilityHint={t("tools.a11yTool")}
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
        <Text numberOfLines={2} style={[s.cardTitle, { color: colors.text }]}>
          {t(def.titleKey)}
        </Text>
        <Text numberOfLines={2} style={[s.cardSubtitle, { color: colors.muted }]}>
          {t(def.subtitleKey)}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Section heading — reports its own y offset so a pill tap can scrollToOffset.
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
// Existing quick-profile card, preserved (now scrolls with the catalog).
// ---------------------------------------------------------------------------

const ToolsProfileCard = memo(function ToolsProfileCard({
  profile,
  onPress,
}: {
  profile: Profile | undefined;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  if (!profile) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={profile.full_name}
      onPress={onPress}
      style={({ pressed }) => [
        s.profileCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.88 : 1 },
      ]}
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
        <Muted numberOfLines={1}>
          @{profile.username} · {profile.university || "SkillBridge Member"}
        </Muted>
      </View>
      <View style={[s.viewProfilePill, { backgroundColor: colors.primarySoft }]}>
        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
          {t("tools.viewProfile")}
        </Text>
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Screen — dual-synced sticky category navigation
// ---------------------------------------------------------------------------

export default function ToolsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const autoHideNav = useOptionalAutoHideNavigation();

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

  // Flattened data: profile + per-category heading + grid rows of cards.
  const rows = useMemo<ListRow[]>(() => {
    const out: ListRow[] = [{ kind: "profile", key: "tools-profile", categoryIndex: 0 }];
    TOOL_CATALOG.forEach((category, categoryIndex) => {
      out.push({
        kind: "section",
        key: `section-${category.key}`,
        categoryIndex,
        titleKey: category.titleKey,
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

  /** Lock flag: released when the tap-triggered scroll settles (or on timeout). */
  const releaseManualScroll = useCallback(() => {
    if (manualLockTimer.current) {
      clearTimeout(manualLockTimer.current);
      manualLockTimer.current = null;
    }
    isManualScrolling.current = false;
  }, []);

  /** Keeps the active pill centred inside the pinned bar. */
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

  /** Tap-to-scroll, driven by pre-measured section offsets. */
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

      // Section has not been laid out yet (still outside the render window).
      const rowIndex = sectionRowIndex[index];
      if (typeof rowIndex === "number") {
        listRef.current?.scrollToIndex({ index: rowIndex, animated: true, viewPosition: 0 });
      }
    },
    [releaseManualScroll, scrollCategoryIntoView, sectionRowIndex],
  );

  /** Fallback for scrollToIndex while a far section is still unmeasured. */
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

  /**
   * Scroll-to-sync: fires only when rows cross the viewport threshold, so there
   * is no per-frame JS work while scrolling.
   */
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

  const handleRefresh = useCallback(() => {
    triggerHaptic();
    void refetch();
  }, [refetch]);

  const keyExtractor = useCallback((row: ListRow) => row.key, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListRow>) => {
      switch (item.kind) {
        case "profile":
          return <ToolsProfileCard profile={profile} onPress={handleOpenProfile} />;
        case "section":
          return (
            <SectionHeading
              categoryIndex={item.categoryIndex}
              title={t(item.titleKey)}
              count={item.count}
              tintKey={item.tintKey}
              onMeasure={handleSectionMeasure}
            />
          );
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
    [cardWidth, handleOpenProfile, handleOpenRoute, handleSectionMeasure, profile, t],
  );

  const listBottomPadding = (autoHideNav?.bottomNavHeight ?? 72) + spacing.lg;

  return (
    <Screen
      header={<AppHeader searchPlaceholder={t("tools.searchPlaceholder")} />}
      scroll={false}
      contentStyle={s.screen}
    >
      {/* Pinned category bar — a sibling of the list, never a nested scroll view */}
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
              label={t(category.titleKey)}
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
    minHeight: 118,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    gap: 6,
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
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  cardSubtitle: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 15,
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
    fontSize: 15,
    lineHeight: 22,
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
    lineHeight: 17,
    fontWeight: "800",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginHorizontal: H_PADDING,
    marginTop: spacing.md,
  },
  profileTextWrap: { flex: 1, gap: 2 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  viewProfilePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
});
