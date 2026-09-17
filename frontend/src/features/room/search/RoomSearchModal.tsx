import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import type { RoomOSTabKey } from "../RoomOSTabs";

type SearchCategory = "all" | "posts" | "messages" | "questions" | "files" | "videos" | "members" | "announcements";

type SearchResultItem = {
  id: string;
  kind: "post" | "message" | "question" | "file" | "video" | "member" | "announcement";
  title: string;
  subtitle: string;
  targetTab: RoomOSTabKey;
  metadata?: Record<string, any>;
};

type RoomSearchModalProps = {
  roomId: string;
  roomTitle: string;
  visible: boolean;
  onClose: () => void;
  onSelectResult: (targetTab: RoomOSTabKey, metadata?: Record<string, any>) => void;
};

export function RoomSearchModal({
  roomId,
  roomTitle,
  visible,
  onClose,
  onSelectResult,
}: RoomSearchModalProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [query]);

  const { data, isLoading } = useQuery<{ results: SearchResultItem[]; total: number }>({
    queryKey: ["room-search", roomId, debouncedQuery, category],
    queryFn: () =>
      api<{ results: SearchResultItem[]; total: number }>(
        `/rooms/${roomId}/search?q=${encodeURIComponent(debouncedQuery)}&category=${category}`,
      ),
    enabled: visible && debouncedQuery.length > 0,
  });

  const categories: { key: SearchCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "posts", label: "Posts" },
    { key: "messages", label: "Messages" },
    { key: "questions", label: "Questions" },
    { key: "files", label: "Files" },
    { key: "videos", label: "Videos" },
    { key: "members", label: "Members" },
  ];

  const getResultIcon = (kind: SearchResultItem["kind"]): keyof typeof MaterialCommunityIcons.glyphMap => {
    switch (kind) {
      case "post":
        return "text-box-outline";
      case "announcement":
        return "bullhorn";
      case "message":
        return "chat-processing-outline";
      case "question":
        return "help-circle-outline";
      case "file":
        return "file-document-outline";
      case "video":
        return "play-box-outline";
      case "member":
        return "account-outline";
      default:
        return "magnify";
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Search Header */}
        <Row style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            style={s.backBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>

          <View style={[s.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              placeholder={`Search ${roomTitle}...`}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>
        </Row>

        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.pillRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          {categories.map((c) => {
            const isSelected = category === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => {
                  triggerHaptic();
                  setCategory(c.key);
                }}
                style={[
                  s.pill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.background,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    s.pillText,
                    {
                      color: isSelected ? "#FFFFFF" : colors.text,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Results List */}
        {isLoading ? (
          <View style={s.centerState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[s.stateText, { color: colors.muted }]}>Searching room content...</Text>
          </View>
        ) : debouncedQuery.length === 0 ? (
          <View style={s.centerState}>
            <MaterialCommunityIcons name="text-search" size={44} color={colors.muted} />
            <Text style={[s.stateText, { color: colors.muted }]}>
              Type keywords to search posts, chat, questions, and files.
            </Text>
          </View>
        ) : (data?.results ?? []).length === 0 ? (
          <View style={s.centerState}>
            <MaterialCommunityIcons name="magnify-close" size={44} color={colors.muted} />
            <Text style={[s.stateText, { color: colors.muted }]}>No matches found for "{debouncedQuery}"</Text>
          </View>
        ) : (
          <FlatList
            data={data?.results ?? []}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            contentContainerStyle={s.resultList}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  onSelectResult(item.targetTab, item.metadata);
                  onClose();
                }}
                style={[s.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Row style={{ alignItems: "center", gap: 12 }}>
                  <View style={[s.iconBox, { backgroundColor: colors.primary + "16" }]}>
                    <MaterialCommunityIcons name={getResultIcon(item.kind)} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.resultTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={[s.resultSubtitle, { color: colors.muted }]}>{item.subtitle}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                </Row>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  pillRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
  resultList: {
    padding: 16,
    gap: 8,
  },
  resultCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  stateText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
