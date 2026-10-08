import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubResource, ClubRole } from "../types";
import { isClubOfficer } from "../constants";
import { useI18n } from "../../../i18n";
import { clubErrorMessage } from "../lib/apiErrors";
import api from "../../../services/api";

interface ClubResourcesTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  resources?: ClubResource[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const ClubResourcesTab: React.FC<ClubResourcesTabProps> = ({
  clubId,
  myRole,
  resources: initialResources,
  isLoading: initialLoading = false,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isLeader = isClubOfficer(myRole);

  const {
    data: queryResources,
    isLoading: isFetching,
    refetch,
  } = useQuery({
    queryKey: ["club-resources", clubId],
    queryFn: async () => {
      const res = await api.get<{ resources: ClubResource[] }>(
        `/clubs/${clubId}/resources`
      );
      return res.data?.resources ?? [];
    },
    initialData: initialResources?.length ? initialResources : undefined,
  });

  const resources = queryResources ?? initialResources ?? [];
  const loading = isFetching || initialLoading;

  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Add Resource Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Slides");
  const [permission, setPermission] = useState<"public" | "members" | "team">(
    "members"
  );
  const [adding, setAdding] = useState(false);

  const categories = ["all", "Slides", "Documents", "Code", "Recording", "Notes"];

  const filteredResources =
    activeCategory === "all"
      ? resources
      : resources.filter((r) => r.category === activeCategory);

  const handleOpenResource = (res: ClubResource) => {
    if (res.url) {
      Linking.openURL(res.url).catch(() => {
        Alert.alert("Error", t("common.error", "Could not open resource link."));
      });
    }
  };

  const handleAddResource = async () => {
    if (!title.trim() || !url.trim()) {
      Alert.alert("Required Fields", "Please enter title and resource URL.");
      return;
    }
    try {
      setAdding(true);
      await api.post(`/clubs/${clubId}/resources`, {
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        file_type: category.toLowerCase(),
        category,
        permission,
      });
      Alert.alert("Success", "Resource added to club library!");
      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["club-resources", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      onRefresh?.();
    } catch (err: unknown) {
      Alert.alert("Failed", clubErrorMessage(err, t));
    } finally {
      setAdding(false);
    }
  };

  const getFileIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "slides":
        return "easel-outline";
      case "documents":
        return "document-text-outline";
      case "code":
        return "code-slash-outline";
      case "recording":
        return "videocam-outline";
      default:
        return "folder-outline";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Category Filter Pills & Add button */}
      <View style={styles.topBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {categories.map((cat) => {
            const isSelected = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterPill,
                  isSelected && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isSelected ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {cat === "all" ? "All Files" : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isLeader && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t("clubs.addResource", "Add")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>
            {t("common.loading", "Loading...")}
          </Text>
        </View>
      ) : filteredResources.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            {t("clubs.empty.resources", "No Resources Found")}
          </Text>
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>
            {activeCategory === "all"
              ? "This club hasn't uploaded workshop slides, codebases, or reference documents yet."
              : `No resources found under "${activeCategory}".`}
          </Text>
          {isLeader && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>
                {t("clubs.addResource", "Upload First Resource")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredResources}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          onRefresh={() => {
            refetch();
            onRefresh?.();
          }}
          refreshing={isFetching}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.resourceCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => handleOpenResource(item)}
            >
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: "rgba(59, 130, 246, 0.1)" },
                ]}
              >
                <Ionicons
                  name={getFileIcon(item.category) as any}
                  size={24}
                  color={colors.primary}
                />
              </View>

              <View style={styles.resourceInfo}>
                <View style={styles.titleRow}>
                  <Text
                    style={[styles.resourceTitle, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.permBadge,
                      {
                        backgroundColor:
                          item.permission === "public"
                            ? "rgba(16, 185, 129, 0.12)"
                            : "rgba(139, 92, 246, 0.12)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.permBadgeText,
                        {
                          color:
                            item.permission === "public"
                              ? "#10b981"
                              : "#8b5cf6",
                        },
                      ]}
                    >
                      {item.permission.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text
                    style={[
                      styles.resourceDesc,
                      { color: colors.textSecondary },
                    ]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                ) : null}

                <View style={styles.metaRow}>
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {item.category} · Added{" "}
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                  {item.uploader?.full_name && (
                    <Text
                      style={[styles.metaText, { color: colors.textSecondary }]}
                    >
                      by {item.uploader.full_name}
                    </Text>
                  )}
                </View>
              </View>

              <Ionicons
                name="open-outline"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add Resource Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Share Club Resource
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Title *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. ROS2 Navigation Workshop Slides (PDF)"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Description
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="Brief summary of what's inside..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Resource URL / Storage Link *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="https://..."
                placeholderTextColor={colors.textSecondary}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Category
              </Text>
              <View style={styles.chipRow}>
                {["Slides", "Documents", "Code", "Recording", "Notes"].map(
                  (cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chipOption,
                        category === cat && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                        { borderColor: colors.border },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipOptionText,
                          { color: category === cat ? "#fff" : colors.text },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Access Permission
              </Text>
              <View style={styles.chipRow}>
                {(["public", "members", "team"] as const).map((perm) => (
                  <TouchableOpacity
                    key={perm}
                    style={[
                      styles.chipOption,
                      permission === perm && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => setPermission(perm)}
                  >
                    <Text
                      style={[
                        styles.chipOptionText,
                        { color: permission === perm ? "#fff" : colors.text },
                      ]}
                    >
                      {perm.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleAddResource}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Add to Library</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  filterScroll: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(150, 150, 150, 0.12)",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  centerSub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  resourceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  permBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  resourceDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  metaText: {
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  formScroll: {
    paddingBottom: 20,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 60,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chipOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
