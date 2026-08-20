import { useState } from "react";
import { router } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Empty, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type SearchResultItem = {
  kind: "person" | "room" | "event" | "skill" | "club" | "research" | "resource";
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  score: number;
  metadata: Record<string, string | number | boolean | null>;
};

const KINDS = [
  { id: "all", label: "All" },
  { id: "person", label: "Peers & Tutors" },
  { id: "room", label: "Study Rooms" },
  { id: "event", label: "Events" },
  { id: "research", label: "Research" },
  { id: "club", label: "Clubs" },
  { id: "skill", label: "Skills" },
  { id: "resource", label: "Resources" },
];

export default function GlobalSearchScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<string>("all");

  const searchResults = useQuery({
    queryKey: ["search", query, activeKind],
    queryFn: () =>
      api<{ results: SearchResultItem[]; total: number }>(
        `/search?q=${encodeURIComponent(query.trim())}&kind=${activeKind}`,
      ),
    enabled: query.trim().length >= 1,
  });

  const getKindIcon = (kind: SearchResultItem["kind"]): any => {
    switch (kind) {
      case "person":
        return "account";
      case "room":
        return "google-classroom";
      case "event":
        return "calendar-star";
      case "research":
        return "flask-outline";
      case "club":
        return "account-group";
      case "skill":
        return "brain";
      case "resource":
        return "file-document-outline";
      default:
        return "magnify";
    }
  };

  const handleResultPress = (item: SearchResultItem) => {
    triggerHaptic();
    switch (item.kind) {
      case "person":
        router.push(`/user/${item.id}` as any);
        break;
      case "room":
        router.push(`/room/${item.id}` as any);
        break;
      case "event":
        router.push("/events" as any);
        break;
      case "club":
        router.push("/clubs" as any);
        break;
      case "research":
        router.push("/research" as any);
        break;
      case "skill":
        router.push("/quiz" as any);
        break;
      case "resource":
        if (item.metadata.room_id) {
          router.push(`/room/${item.metadata.room_id}` as any);
        }
        break;
      default:
        break;
    }
  };

  return (
    <Screen>
      {/* Header Search Bar */}
      <View style={s.searchBarContainer}>
        <Row style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
          <TextInput
            placeholder="Search peers, skills, rooms, research..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            style={[s.input, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setQuery("");
              }}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </Row>
      </View>

      {/* Category Kind Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={KINDS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.chipScroll}
        renderItem={({ item }) => {
          const isSelected = activeKind === item.id;
          return (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setActiveKind(item.id);
              }}
              style={[
                s.chip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? colors.white : colors.text,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Search Content */}
      {query.trim().length === 0 ? (
        <View style={s.popularContainer}>
          <H2>Popular Searches</H2>
          <Muted>Tap to search trending peer topics</Muted>
          <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {["Python", "Data Structures", "Calculus", "Machine Learning", "Physics", "Figma Design"].map(
              (tag) => (
                <Pressable
                  key={tag}
                  onPress={() => {
                    triggerHaptic();
                    setQuery(tag);
                  }}
                >
                  <Pill tone="primary">{tag}</Pill>
                </Pressable>
              ),
            )}
          </Row>
        </View>
      ) : searchResults.isLoading ? (
        <View style={{ gap: 10, marginTop: 16 }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : searchResults.data?.results && searchResults.data.results.length > 0 ? (
        <FlatList
          data={searchResults.data.results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleResultPress(item)}>
              <Card style={s.resultCard}>
                <Row style={{ alignItems: "center", gap: 12 }}>
                  <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons
                      name={getKindIcon(item.kind)}
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[s.resultTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Pill tone="default">{item.kind.toUpperCase()}</Pill>
                    </Row>
                    {item.subtitle ? (
                      <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                        {item.subtitle}
                      </Muted>
                    ) : null}
                  </View>
                </Row>
              </Card>
            </Pressable>
          )}
        />
      ) : (
        <Empty
          title="No matches found"
          detail={`We couldn't find any results for "${query}". Try searching with broader keywords.`}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBarContainer: {
    paddingVertical: 8,
  },
  searchBar: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  chipScroll: {
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  popularContainer: {
    marginTop: 24,
    gap: 6,
  },
  resultCard: {
    padding: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
});
