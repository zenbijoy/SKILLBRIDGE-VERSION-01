import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, TextInput, Pressable, FlatList, Image, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import type { PostMention } from "../../types";

interface MentionPickerProps {
  visible: boolean;
  onSelect: (mention: PostMention) => void;
  onClose: () => void;
}

export function MentionPicker({ visible, onSelect, onClose }: MentionPickerProps) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const searchResultsQuery = useQuery<{ results?: Profile[]; profiles?: Profile[] }>({
    queryKey: ["mention-search", searchQuery],
    queryFn: () =>
      searchQuery.trim().length > 1
        ? api(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=people`)
        : api("/recommendations/people"),
    enabled: visible,
  });

  const profiles: Profile[] =
    searchResultsQuery.data?.results || searchResultsQuery.data?.profiles || [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <Row style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Mention a Campus Peer</Text>
            <Pressable onPress={onClose} hitSlop={6}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {/* Search Input */}
          <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name, username, or department..."
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          {/* List */}
          {searchResultsQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : profiles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {searchQuery ? "No campus peers found" : "Type a name to search"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={profiles.slice(0, 12)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect({
                      id: item.id,
                      username: item.username || "student",
                      full_name: item.full_name || item.username || "Student",
                      avatar_url: item.avatar_url,
                    });
                    onClose();
                  }}
                  style={({ pressed }) => [styles.userItem, pressed && { backgroundColor: `${colors.primary}15` }]}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                      <MaterialCommunityIcons name="account" size={18} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]}>
                      {item.full_name || item.username}
                    </Text>
                    <Text style={[styles.username, { color: colors.muted }]}>
                      @{item.username} {item.department ? `· ${item.department}` : item.university ? `· ${item.university}` : ""}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 16,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
  },
  username: {
    fontSize: 12,
    marginTop: 2,
  },
});
