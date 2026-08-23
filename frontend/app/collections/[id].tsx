import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { GrowthHero } from "@/components/GrowthHero";
import { growthIllustrations512 } from "@/assets/illustrations";
import {
  fetchSavedItems,
  deleteSavedCollection,
  removeSavedItem,
  type SavedItem,
} from "@/features/growth/growthApi";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchSavedItems(id);
      setItems(data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, [loadItems]);

  const handleDeleteCollection = () => {
    Alert.alert(
      "Delete Collection",
      "Are you sure you want to delete this collection? Saved items will remain in your library.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            try {
              await deleteSavedCollection(id);
              router.replace("/saved" as any);
            } catch (err: any) {
              Alert.alert(t("common.error"), err.message || "Failed to delete collection");
            }
          },
        },
      ],
    );
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeSavedItem(itemId);
      setItems(items.filter((it) => it.id !== itemId));
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to remove item");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Collection</Text>
        <TouchableOpacity onPress={handleDeleteCollection}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <GrowthHero
        eyebrow="SAVED COLLECTION"
        title="Collection Items"
        subtitle={`${items.length} items organized in this collection.`}
        illustration={growthIllustrations512.savedLibrary}
        illustrationSize={120}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {items.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="bookmark-outline" size={36} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No items saved in this collection yet.
              </Text>
            </View>
          ) : (
            items.map((it) => (
              <View
                key={it.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.itemTop}>
                  <Text style={[styles.itemType, { color: colors.primary }]}>
                    {it.entity_type.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveItem(it.id)}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{it.title}</Text>
                {it.subtitle ? (
                  <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                    {it.subtitle}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  scrollContent: { padding: 20, gap: 12 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyCard: { padding: 32, borderRadius: 16, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  itemCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  itemTop: { flexDirection: "row", justifyContent: "space-between" },
  itemType: { fontSize: 11, fontWeight: "800" },
  itemTitle: { fontSize: 15, fontWeight: "700" },
  itemSubtitle: { fontSize: 13 },
});
