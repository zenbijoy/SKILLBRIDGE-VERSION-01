import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { GrowthEmptyState } from "@/components/GrowthEmptyState";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchSavedCollections,
  fetchSavedItems,
  removeSavedItem,
  type SavedCollection,
  type SavedItem,
} from "@/features/growth/growthApi";

export default function SavedLibraryScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [colData, itemData] = await Promise.all([
        fetchSavedCollections(),
        fetchSavedItems(selectedCollectionId || undefined, selectedType || undefined),
      ]);
      setCollections(colData.collections || []);
      setItems(itemData || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCollectionId, selectedType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRemove = async (id: string) => {
    try {
      await removeSavedItem(id);
      setItems(items.filter((it) => it.id !== id));
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to remove item");
    }
  };

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
      default:
        return "bookmark-outline";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t("saved.title")}</Text>
        <TouchableOpacity
          style={[styles.createColBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/collections/create" as any)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.createColText}>{t("saved.createCollection")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero */}
        <GrowthHero
          eyebrow="PERSONAL LIBRARY"
          title={t("saved.title")}
          subtitle={t("saved.subtitle")}
          illustration={growthIllustrations512.savedLibrary}
          illustrationSize={125}
        />

        {/* Collections Horizontal Carousel */}
        <View style={styles.collectionsSection}>
          <View style={styles.sectionTop}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("saved.collections")} ({collections.length})
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colScroll}>
            <TouchableOpacity
              style={[
                styles.colChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                selectedCollectionId === null && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setSelectedCollectionId(null)}
            >
              <Ionicons
                name="albums-outline"
                size={14}
                color={selectedCollectionId === null ? "#FFFFFF" : colors.text}
              />
              <Text
                style={[
                  styles.colChipText,
                  { color: selectedCollectionId === null ? "#FFFFFF" : colors.text },
                ]}
              >
                {t("saved.allSaved")}
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
                    isSelected && { backgroundColor: col.color || colors.primary },
                  ]}
                  onPress={() => setSelectedCollectionId(col.id)}
                >
                  <View style={[styles.colDot, { backgroundColor: isSelected ? "#FFFFFF" : col.color }]} />
                  <Text
                    style={[
                      styles.colChipText,
                      { color: isSelected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {col.name} ({col.item_count || 0})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Items List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <GrowthEmptyState
            illustration={growthIllustrations512.savedLibrary}
            title={t("saved.noItems")}
            detail="Bookmark skills, rooms, mentors, and resources across SkillBridge to access them here anytime."
            actionTitle={t("common.search")}
            onAction={() => router.push("/(tabs)/discover" as any)}
          />
        ) : (
          <View style={styles.itemsGrid}>
            {items.map((it) => (
              <View
                key={it.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: it.is_tombstone ? "#EF444450" : colors.border,
                  },
                ]}
              >
                <View style={styles.itemTop}>
                  <View style={styles.typeBadge}>
                    <Ionicons name={getEntityIcon(it.entity_type) as any} size={13} color={colors.primary} />
                    <Text style={[styles.typeText, { color: colors.primary }]}>
                      {it.entity_type.toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemove(it.id)}>
                    <Ionicons name="bookmark" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.itemTitle, { color: colors.text }]}>
                  {it.title}
                </Text>

                {it.subtitle ? (
                  <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                    {it.subtitle}
                  </Text>
                ) : null}

                {it.note ? (
                  <View style={[styles.noteBox, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                      📝 {it.note}
                    </Text>
                  </View>
                ) : null}

                {it.is_tombstone && (
                  <Text style={styles.tombstoneText}>⚠️ {t("saved.tombstoneArchived")}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  createColBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, gap: 4 },
  createColText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 60 },
  collectionsSection: { gap: 10 },
  sectionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  colScroll: { gap: 8, paddingVertical: 4 },
  colChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 6 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colChipText: { fontSize: 12, fontWeight: "700" },
  centerContainer: { paddingVertical: 40, justifyContent: "center", alignItems: "center" },
  itemsGrid: { gap: 12 },
  itemCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  typeText: { fontSize: 10, fontWeight: "800" },
  itemTitle: { fontSize: 15, fontWeight: "700" },
  itemSubtitle: { fontSize: 13 },
  noteBox: { padding: 8, borderRadius: 8, marginTop: 4 },
  noteText: { fontSize: 12 },
  tombstoneText: { fontSize: 11, color: "#EF4444", fontWeight: "600", marginTop: 4 },
});


