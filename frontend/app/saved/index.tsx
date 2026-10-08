import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import {
  fetchSavedCollections,
  fetchSavedItems,
  removeSavedItem,
  type SavedCollection,
  type SavedItem,
} from "@/features/growth/growthApi";

type MediaTypeTab = "all" | "posts" | "liked" | "videos" | "audio" | "research";

const MEDIA_TABS: { key: MediaTypeTab; label: string; icon: string }[] = [
  { key: "all", label: "All Saved", icon: "bookmark" },
  { key: "posts", label: "Bookmarked", icon: "bookmark-outline" },
  { key: "liked", label: "Liked Posts", icon: "heart" },
  { key: "videos", label: "Watch Later", icon: "play-circle" },
  { key: "audio", label: "Audio", icon: "headset" },
  { key: "research", label: "Research & PDFs", icon: "document-text" },
];

export default function SavedLibraryScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [activeMediaTab, setActiveMediaTab] = useState<MediaTypeTab>("all");
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [likedPosts, setLikedPosts] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [colData, itemData, likedData] = await Promise.all([
        fetchSavedCollections(),
        fetchSavedItems(selectedCollectionId || undefined),
        api<{ posts: any[] }>("/saved/liked-posts").catch(() => ({ posts: [] })),
      ]);
      setCollections(colData.collections || []);
      setItems(itemData || []);
      setLikedPosts(likedData?.posts || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCollectionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRemove = async (id: string) => {
    try {
      await removeSavedItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      triggerHaptic("selection");
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to remove item");
    }
  };

  // Filter items based on active media tab
  const displayedItems = useMemo(() => {
    if (activeMediaTab === "videos") {
      return items.filter(
        (it) =>
          it.entity_type === "resource" ||
          (it as any).details?.media_type === "video" ||
          (it as any).details?.post_type === "video" ||
          it.collection?.name?.toLowerCase().includes("video") ||
          it.collection?.name?.toLowerCase().includes("watch later")
      );
    }
    if (activeMediaTab === "audio") {
      return items.filter(
        (it) =>
          it.entity_type === "room" ||
          (it as any).details?.media_type === "audio" ||
          it.collection?.name?.toLowerCase().includes("audio") ||
          it.collection?.name?.toLowerCase().includes("podcast")
      );
    }
    if (activeMediaTab === "posts") {
      // Posts bookmarked via the feed's Save action (saved_items.entity_type === "post")
      return items.filter((it) => it.entity_type === "post");
    }
    if (activeMediaTab === "research") {
      return items.filter(
        (it) =>
          it.entity_type === "research" ||
          it.entity_type === "resource" ||
          (it as any).details?.type === "pdf" ||
          (it as any).details?.type === "document"
      );
    }
    return items;
  }, [items, activeMediaTab]);

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "room":
        return "chatbubbles-outline";
      case "event":
        return "calendar-outline";
      case "resource":
        return "document-text-outline";
      case "person":
      case "profile":
        return "person-outline";
      case "skill":
        return "school-outline";
      case "club":
        return "people-outline";
      case "research":
        return "flask-outline";
      case "post":
        return "newspaper-outline";
      default:
        return "bookmark-outline";
    }
  };

  return (
    <Screen scroll={false}>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Saved & Liked</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>Library, watch later & bookmarks</Text>
          </View>
        </Row>
        <TouchableOpacity
          style={[styles.createColBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
          onPress={() => router.push("/collections/create" as any)}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={[styles.createColText, { color: colors.primary }]}>Collection</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Media Filter Tabs */}
      <View style={[styles.tabsWrap, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {MEDIA_TABS.map((tab) => {
            const isSel = activeMediaTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  triggerHaptic("selection");
                  setActiveMediaTab(tab.key);
                }}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: isSel ? colors.primary : colors.surface,
                    borderColor: isSel ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isSel ? "#FFFFFF" : colors.muted}
                />
                <Text
                  style={[
                    styles.tabChipText,
                    {
                      color: isSel ? "#FFFFFF" : colors.text,
                      fontWeight: isSel ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                  {tab.key === "liked" && likedPosts.length > 0 ? ` (${likedPosts.length})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Collections Carousel (when in All Saved) */}
        {activeMediaTab === "all" && collections.length > 0 && (
          <View style={styles.collectionsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colScroll}>
              <TouchableOpacity
                style={[
                  styles.colChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  selectedCollectionId === null && {
                    backgroundColor: colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => setSelectedCollectionId(null)}
              >
                <Ionicons
                  name="albums-outline"
                  size={14}
                  color={selectedCollectionId === null ? colors.primary : colors.muted}
                />
                <Text
                  style={[
                    styles.colChipText,
                    { color: selectedCollectionId === null ? colors.primary : colors.text, fontWeight: "700" },
                  ]}
                >
                  All ({items.length})
                </Text>
              </TouchableOpacity>

              {collections.map((col) => {
                const isSelected = selectedCollectionId === col.id;
                return (
                  <TouchableOpacity
                    key={col.id}
                    style={[
                      styles.colChip,
                      { borderColor: col.color || colors.border, backgroundColor: colors.surface },
                      isSelected && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                    ]}
                    onPress={() => setSelectedCollectionId(col.id)}
                  >
                    <View style={[styles.colDot, { backgroundColor: col.color || colors.primary }]} />
                    <Text
                      style={[
                        styles.colChipText,
                        { color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? "700" : "500" },
                      ]}
                    >
                      {col.name} ({col.item_count || 0})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Content View */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : activeMediaTab === "liked" ? (
          // Liked Posts View
          likedPosts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="heart-outline" size={48} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Liked Posts Yet</Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>
                Posts you like or react to in the campus feed will automatically show up here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {likedPosts.map((post) => (
                <Pressable
                  key={post.id}
                  onPress={() => router.push(`/post/${post.id}` as any)}
                  style={[styles.likedPostCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                        {post.author?.avatar_url ? (
                          <Image source={{ uri: post.author.avatar_url }} style={styles.avatarImg} />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>
                            {post.author?.full_name?.[0] || "U"}
                          </Text>
                        )}
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>
                          {post.author?.full_name || "Campus Peer"}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </Row>
                    <Pill tone="danger">❤️ Liked</Pill>
                  </Row>

                  <Text style={{ fontSize: 13.5, color: colors.text, lineHeight: 19 }} numberOfLines={3}>
                    {post.body}
                  </Text>

                  <Row style={{ gap: 12, marginTop: 8 }}>
                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <Ionicons name="heart" size={14} color="#EF4444" />
                      <Text style={{ fontSize: 11, color: colors.muted }}>{post.likes_count || 1}</Text>
                    </Row>
                    <Row style={{ alignItems: "center", gap: 4 }}>
                      <Ionicons name="chatbubble-outline" size={13} color={colors.muted} />
                      <Text style={{ fontSize: 11, color: colors.muted }}>{post.comments_count || 0}</Text>
                    </Row>
                  </Row>
                </Pressable>
              ))}
            </View>
          )
        ) : displayedItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="bookmark-outline" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Items Saved</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>
              {activeMediaTab === "videos"
                ? "Bookmark lecture recordings and video posts to watch them later."
                : activeMediaTab === "research"
                ? "Save research hub papers, PDFs, and laboratory notes to review anytime."
                : "Bookmark posts, rooms, and files across the app to view here."}
            </Text>
          </View>
        ) : (
          <View style={styles.itemsGrid}>
            {displayedItems.map((it) => (
              <View
                key={it.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Pressable
                  style={styles.itemMain}
                  onPress={() => {
                    triggerHaptic();
                    if (it.entity_type === "room") router.push(`/room/${it.entity_id}` as any);
                    else if (it.entity_type === "research") router.push(`/research/${it.entity_id}` as any);
                    else if (it.entity_type === "club") router.push(`/club/${it.entity_id}` as any);
                    else if (it.entity_type === "event") router.push(`/event/${it.entity_id}` as any);
                    else if (it.entity_type === "post") router.push(`/post/${it.entity_id}` as any);
                    else if (it.entity_type === "profile") router.push(`/user/${it.entity_id}` as any);
                  }}
                >
                  <View style={[styles.itemIconWrap, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons
                      name={getEntityIcon(it.entity_type) as any}
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                      {it.title || it.entity_type}
                    </Text>
                    <Text style={[styles.itemSub, { color: colors.muted }]} numberOfLines={1}>
                      {it.subtitle || it.entity_type.toUpperCase()}
                    </Text>
                  </View>
                </Pressable>

                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemove(it.id)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  createColBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  createColText: {
    fontSize: 12,
    fontWeight: "700",
  },
  tabsWrap: {
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  tabsScroll: {
    gap: 8,
    paddingHorizontal: 16,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabChipText: {
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  collectionsSection: {
    marginBottom: 12,
  },
  colScroll: {
    gap: 8,
  },
  colChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  colChipText: {
    fontSize: 12,
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 18,
  },
  itemsGrid: {
    gap: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  itemMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  itemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  itemSub: {
    fontSize: 11,
    marginTop: 1,
  },
  removeBtn: {
    padding: 6,
  },
  likedPostCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
});
