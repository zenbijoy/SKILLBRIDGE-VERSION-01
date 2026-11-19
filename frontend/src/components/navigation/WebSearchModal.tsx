import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { useTheme, radius } from "@/theme";
import { useI18n } from "@/i18n";
import { triggerHaptic } from "@/components/ui";

export type SearchItem = {
  kind: "person" | "room" | "event" | "skill" | "club" | "research" | "resource";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  score?: number;
  metadata?: Record<string, any>;
};

type SearchResponse = {
  results: SearchItem[];
  total: number;
};

const CATEGORIES = [
  { key: "all", label: "All", apiKind: "all", icon: "earth" },
  { key: "people", label: "People", apiKind: "person", icon: "account-outline" },
  { key: "rooms", label: "Rooms", apiKind: "room", icon: "door-open" },
  { key: "skills", label: "Skills", apiKind: "skill", icon: "star-shooting-outline" },
  { key: "clubs", label: "Clubs", apiKind: "club", icon: "shield-account" },
  { key: "research", label: "Research", apiKind: "research", icon: "flask-outline" },
  { key: "events", label: "Events", apiKind: "event", icon: "calendar-star" },
] as const;

interface WebSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WebSearchModal({ visible, onClose }: WebSearchModalProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const debouncedQuery = useDebounce(query.trim(), 250);
  const inputRef = useRef<TextInput>(null);

  const recentSearches = usePreferencesStore((s) => s.recentSearches);
  const addRecentSearch = usePreferencesStore((s) => s.addRecentSearch);
  const removeRecentSearch = usePreferencesStore((s) => s.removeRecentSearch);
  const clearRecentSearches = usePreferencesStore((s) => s.clearRecentSearches);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [visible]);

  // Global ESC key listener on web
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  const activeCategoryObj = CATEGORIES.find((c) => c.key === activeCategory) || CATEGORIES[0];

  const { data, isLoading } = useQuery({
    queryKey: ["web-spotlight-search", debouncedQuery, activeCategoryObj.apiKind],
    queryFn: () =>
      api<SearchResponse>(
        `/search?${qs({
          q: debouncedQuery,
          kind: activeCategoryObj.apiKind,
          limit: 16,
        })}`
      ),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const results = data?.results || [];

  const handleSelectResult = (item: SearchItem) => {
    triggerHaptic();
    if (query.trim().length >= 2) {
      addRecentSearch(query.trim());
    }
    onClose();

    switch (item.kind) {
      case "person":
        router.push(`/user/${item.id}` as any);
        break;
      case "room":
        router.push(`/room/${item.id}` as any);
        break;
      case "club":
        router.push(`/club/${item.id}` as any);
        break;
      case "research":
        router.push(`/research/${item.id}` as any);
        break;
      case "event":
        router.push(`/event/${item.id}` as any);
        break;
      case "resource":
        if (item.metadata?.room_id) {
          router.push(`/room/${item.metadata.room_id}` as any);
        } else {
          router.push("/saved" as any);
        }
        break;
      case "skill":
        router.push(`/(tabs)/discover` as any);
        break;
    }
  };

  const handleSelectQuickLink = (route: string) => {
    triggerHaptic();
    onClose();
    router.push(route as any);
  };

  const getItemIcon = (kind: SearchItem["kind"]) => {
    switch (kind) {
      case "person":
        return "account-outline";
      case "room":
        return "door-open";
      case "club":
        return "shield-account";
      case "research":
        return "flask-outline";
      case "event":
        return "calendar-star";
      case "skill":
        return "star-shooting-outline";
      case "resource":
        return "file-document-outline";
      default:
        return "magnify";
    }
  };

  const getItemBadgeColor = (kind: SearchItem["kind"]) => {
    switch (kind) {
      case "person":
        return { bg: "rgba(37, 99, 235, 0.12)", text: "#2563EB" };
      case "room":
        return { bg: "rgba(16, 185, 129, 0.12)", text: "#10B981" };
      case "club":
        return { bg: "rgba(168, 85, 247, 0.12)", text: "#A855F7" };
      case "research":
        return { bg: "rgba(245, 158, 11, 0.12)", text: "#F59E0B" };
      case "event":
        return { bg: "rgba(236, 72, 153, 0.12)", text: "#EC4899" };
      default:
        return { bg: "rgba(100, 116, 139, 0.12)", text: "#64748B" };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              shadowColor: "#000",
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Search Input */}
          <View style={[styles.searchHeader, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={24} color={colors.primary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t("common.searchEverything", "Search skills, people, rooms, research...")}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text }]}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery("")}
                style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            <View style={[styles.escKey, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[styles.escKeyText, { color: colors.muted }]}>ESC</Text>
            </View>
          </View>

          {/* Category Filter Pills */}
          <View style={[styles.categoriesRow, { borderBottomColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContent}>
              {CATEGORIES.map((cat) => {
                const isSelected = activeCategory === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => {
                      triggerHaptic();
                      setActiveCategory(cat.key);
                    }}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surface2,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={14}
                      color={isSelected ? "#FFFFFF" : colors.muted}
                    />
                    <Text
                      style={[
                        styles.categoryPillText,
                        { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Results / Suggestions Stream */}
          <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
            {/* Loading Indicator */}
            {isLoading && debouncedQuery.length >= 2 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Searching campus network...</Text>
              </View>
            ) : null}

            {/* Results List */}
            {debouncedQuery.length >= 2 && !isLoading && results.length > 0 ? (
              <View style={styles.resultsContainer}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  {results.length} RESULTS FOUND
                </Text>
                {results.map((item) => {
                  const badge = getItemBadgeColor(item.kind);
                  return (
                    <Pressable
                      key={`${item.kind}-${item.id}`}
                      onPress={() => handleSelectResult(item)}
                      style={({ pressed }) => [
                        styles.resultRow,
                        {
                          backgroundColor: pressed ? colors.surface2 : "transparent",
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.resultImage} />
                      ) : (
                        <View style={[styles.resultIconFallback, { backgroundColor: badge.bg }]}>
                          <MaterialCommunityIcons name={getItemIcon(item.kind) as any} size={20} color={badge.text} />
                        </View>
                      )}
                      <View style={styles.resultTextCol}>
                        <View style={styles.resultTitleRow}>
                          <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <View style={[styles.kindBadge, { backgroundColor: badge.bg }]}>
                            <Text style={[styles.kindBadgeText, { color: badge.text }]}>
                              {item.kind.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        {item.subtitle ? (
                          <Text style={[styles.resultSubtitle, { color: colors.muted }]} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* No Results */}
            {debouncedQuery.length >= 2 && !isLoading && results.length === 0 ? (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="text-search" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  Try searching for a different skill, student name, or study room topic.
                </Text>
              </View>
            ) : null}

            {/* Default State: Recent Searches & Quick Shortcuts */}
            {debouncedQuery.length < 2 ? (
              <View style={styles.defaultContainer}>
                {recentSearches.length > 0 ? (
                  <View style={styles.recentSection}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionLabel, { color: colors.muted }]}>RECENT SEARCHES</Text>
                      <Pressable onPress={clearRecentSearches}>
                        <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear all</Text>
                      </Pressable>
                    </View>
                    <View style={styles.recentPillsWrap}>
                      {recentSearches.map((rec) => (
                        <View
                          key={rec}
                          style={[styles.recentPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                        >
                          <Pressable
                            onPress={() => {
                              triggerHaptic();
                              setQuery(rec);
                            }}
                            style={styles.recentPillPress}
                          >
                            <MaterialCommunityIcons name="history" size={14} color={colors.muted} />
                            <Text style={[styles.recentPillText, { color: colors.text }]}>{rec}</Text>
                          </Pressable>
                          <Pressable onPress={() => removeRecentSearch(rec)} style={styles.recentRemoveBtn}>
                            <MaterialCommunityIcons name="close" size={14} color={colors.muted} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Quick Shortcuts */}
                <View style={styles.quickLinksSection}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>QUICK CAMPUS SHORTCUTS</Text>
                  <View style={styles.shortcutsGrid}>
                    {[
                      { icon: "newspaper-variant", title: "Campus Feed", subtitle: "Live posts & questions", route: "/feed", color: "#3B82F6" },
                      { icon: "door-open", title: "Live Study Rooms", subtitle: "Join active audio & video", route: "/(tabs)/rooms", color: "#10B981" },
                      { icon: "compass-outline", title: "Discover Mentors", subtitle: "Explore campus skill tags", route: "/(tabs)/discover", color: "#8B5CF6" },
                      { icon: "calendar-clock", title: "Study Schedule", subtitle: "Upcoming classes & exams", route: "/schedule", color: "#F59E0B" },
                      { icon: "archive-outline", title: "Learning Vault", subtitle: "Past notes & materials", route: "/vault", color: "#EC4899" },
                      { icon: "trophy-outline", title: "Leaderboard", subtitle: "Campus top reputations", route: "/leaderboard", color: "#06B6D4" },
                    ].map((sc) => (
                      <Pressable
                        key={sc.route}
                        onPress={() => handleSelectQuickLink(sc.route)}
                        style={({ pressed }) => [
                          styles.shortcutCard,
                          {
                            backgroundColor: pressed ? colors.surface2 : colors.surfaceMuted,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View style={[styles.shortcutIconWrap, { backgroundColor: `${sc.color}1A` }]}>
                          <MaterialCommunityIcons name={sc.icon as any} size={22} color={sc.color} />
                        </View>
                        <View style={styles.shortcutTextCol}>
                          <Text style={[styles.shortcutTitle, { color: colors.text }]}>{sc.title}</Text>
                          <Text style={[styles.shortcutSubtitle, { color: colors.muted }]}>{sc.subtitle}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer keyboard hints */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border, backgroundColor: colors.surface2 }]}>
            <View style={styles.footerHint}>
              <Text style={[styles.footerKey, { color: colors.text, backgroundColor: colors.surface }]}>ESC</Text>
              <Text style={[styles.footerLabel, { color: colors.muted }]}>to close</Text>
            </View>
            <View style={styles.footerHint}>
              <Text style={[styles.footerKey, { color: colors.text, backgroundColor: colors.surface }]}>↵</Text>
              <Text style={[styles.footerLabel, { color: colors.muted }]}>to select</Text>
            </View>
            <View style={styles.footerHint}>
              <Text style={[styles.footerKey, { color: colors.text, backgroundColor: colors.surface }]}>Ctrl+K</Text>
              <Text style={[styles.footerLabel, { color: colors.muted }]}>global shortcut</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "82%",
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 24,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    display: "flex",
    flexDirection: "column",
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    padding: 0,
    outlineWidth: 0,
  } as any,
  clearBtn: {
    padding: 4,
  },
  escKey: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  escKeyText: {
    fontSize: 10,
    fontWeight: "700",
  },
  categoriesRow: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  categoriesContent: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: "row",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
  },
  resultsList: {
    flex: 1,
    maxHeight: 460,
  },
  loadingWrap: {
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  resultsContainer: {
    padding: 12,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 12,
  },
  resultImage: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
  },
  resultIconFallback: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTextCol: {
    flex: 1,
    gap: 3,
  },
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  kindBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  resultSubtitle: {
    fontSize: 12,
  },
  emptyWrap: {
    padding: 48,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 360,
  },
  defaultContainer: {
    padding: 14,
    gap: 18,
  },
  recentSection: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "600",
  },
  recentPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentPillPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 10,
    paddingVertical: 6,
  },
  recentPillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  recentRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quickLinksSection: {
    gap: 8,
  },
  shortcutsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  shortcutCard: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  shortcutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutTextCol: {
    flex: 1,
  },
  shortcutTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  shortcutSubtitle: {
    fontSize: 11,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 16,
  },
  footerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerKey: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  footerLabel: {
    fontSize: 11,
  },
});
