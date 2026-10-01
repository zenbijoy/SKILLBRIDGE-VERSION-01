import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import {
  Button,
  Empty,
  ErrorState,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { CollectionPaper, ResearchCollection } from "@/features/research/types";

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const collectionQuery = useQuery({
    queryKey: ["research-collection", id],
    queryFn: () => api<ResearchCollection>(`/research/collections/${id}`),
    enabled: Boolean(id),
    initialData: () => {
      const collectionsCache = qc.getQueryData<{ data: ResearchCollection[] }>(["research-collections"]);
      return collectionsCache?.data?.find((c) => c.id === id);
    },
  });
  const collection = collectionQuery.data;

  const papersQuery = useQuery({
    queryKey: ["collection-papers", id],
    queryFn: () => api<{ data: CollectionPaper[] }>(`/research/collections/${id}/papers`),
    enabled: Boolean(id),
  });

  const updateCollection = useMutation({
    mutationFn: () =>
      api(`/research/collections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || undefined }),
      }),
    onSuccess: (data: any) => {
      triggerHaptic();
      qc.setQueryData<{ data: ResearchCollection[] }>(["research-collections"], (old) => {
        if (!old) return old;
        return { data: old.data.map((c) => (c.id === id ? { ...c, ...data } : c)) };
      });
      setIsEditing(false);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const removePaper = useMutation({
    mutationFn: (paperId: string) =>
      api(`/research/collections/${id}/papers/${encodeURIComponent(paperId)}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["collection-papers", id] });
    },
  });

  const deleteCollection = useMutation({
    mutationFn: () => api(`/research/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-collections"] });
      router.back();
    },
  });

  const handleEditStart = () => {
    setEditName(collection?.name ?? "");
    setEditDesc(collection?.description ?? "");
    setIsEditing(true);
  };

  const papers = papersQuery.data?.data ?? [];
  const filtered = search.trim()
    ? papers.filter((p) =>
        p.paper_data.title?.toLowerCase().includes(search.toLowerCase()) ||
        p.paper_data.authors?.some((a: any) => a.name?.toLowerCase().includes(search.toLowerCase()))
      )
    : papers;

  return (
    <Screen>
      {/* Back */}
      <Pressable onPress={() => router.back()} style={s.backRow} hitSlop={12}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        <Text style={[s.backLabel, { color: colors.muted }]}>My Library</Text>
      </Pressable>

      {/* Header */}
      {isEditing ? (
        <View style={[s.editCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            style={[s.editTitle, { color: colors.text, borderBottomColor: colors.border }]}
            placeholder="Collection name"
            placeholderTextColor={colors.muted}
            maxLength={80}
            autoFocus
          />
          <TextInput
            value={editDesc}
            onChangeText={setEditDesc}
            style={[s.editDesc, { color: colors.text, borderColor: colors.border }]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={2}
            maxLength={300}
          />
          <Row style={{ gap: 8, marginTop: 8 }}>
            <Button title="Cancel" variant="ghost" compact onPress={() => setIsEditing(false)} />
            <Button
              title="Save"
              compact
              disabled={!editName.trim() || updateCollection.isPending}
              loading={updateCollection.isPending}
              onPress={() => updateCollection.mutate()}
            />
          </Row>
        </View>
      ) : (
        <View style={[s.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[s.folderIcon, { backgroundColor: `${colors.accent}18` }]}>
                <MaterialCommunityIcons name="folder-outline" size={24} color={colors.accent} />
              </View>
              <H1 style={{ marginTop: 8 }}>{collection?.name ?? "Collection"}</H1>
              {collection?.description ? <Muted>{collection.description}</Muted> : null}
              <Text style={[s.paperCount, { color: colors.muted }]}>
                {papers.length} {papers.length === 1 ? "paper" : "papers"}
              </Text>
            </View>
            <Row style={{ gap: 8 }}>
              <Pressable
                onPress={handleEditStart}
                style={[s.iconBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                hitSlop={8}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert("Delete Collection", `Delete "${collection?.name}" and all its papers?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteCollection.mutate() },
                  ])
                }
                style={[s.iconBtn, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}
                hitSlop={8}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
              </Pressable>
            </Row>
          </Row>
        </View>
      )}

      {/* Search */}
      {papers.length > 4 && (
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search in this collection..."
            placeholderTextColor={colors.muted}
            style={[s.searchInput, { color: colors.text }]}
          />
        </View>
      )}

      {/* Papers list */}
      {papersQuery.isLoading ? (
        <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={100} style={{ marginBottom: 10 }} />)}</>
      ) : papersQuery.isError ? (
        <ErrorState detail="Could not load collection papers" onRetry={() => papersQuery.refetch()} />
      ) : filtered.length === 0 ? (
        papers.length === 0 ? (
          <Empty
            icon="folder-outline"
            title="Collection is empty"
            detail="Open any paper and use the collection button to add papers here."
            actionTitle="Search Papers"
            onAction={() => router.back()}
          />
        ) : (
          <Empty icon="magnify" title="No matching papers" detail="Try a different search term." />
        )
      ) : (
        <View style={{ gap: 10 }}>
          {filtered.map((cp, idx) => {
            const paper = cp.paper_data;
            const authors = paper.authors?.slice(0, 2).map((a: any) => a.name).join(", ") ?? "";
            return (
              <Pressable
                key={cp.id}
                onPress={() => router.push(`/research/paper/${encodeURIComponent(cp.paper_id)}` as any)}
                style={[s.paperRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.paperTitle, { color: colors.text }]} numberOfLines={2}>
                    {paper.title || "Untitled"}
                  </Text>
                  {authors ? <Text style={[s.paperMeta, { color: colors.muted }]} numberOfLines={1}>{authors}</Text> : null}
                  <Row style={{ gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    {paper.year ? <Pill>{String(paper.year)}</Pill> : null}
                    {paper.isOpenAccess ? <Pill tone="success">Open Access</Pill> : null}
                    {paper.fieldsOfStudy?.[0] ? <Pill tone="primary">{paper.fieldsOfStudy[0]}</Pill> : null}
                    {paper.citationCount != null ? (
                      <Pill tone="accent">⭐ {paper.citationCount} cited</Pill>
                    ) : null}
                  </Row>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert("Remove Paper", "Remove this paper from the collection?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => removePaper.mutate(cp.paper_id) },
                    ])
                  }
                  hitSlop={8}
                  style={{ padding: 6 }}
                >
                  <MaterialCommunityIcons name="minus-circle-outline" size={20} color={colors.danger} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  backLabel: { fontSize: 13, fontWeight: "600" },
  headerCard: { borderRadius: radius.xl, borderWidth: 1, padding: 16, gap: 4, marginBottom: 14 },
  folderIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  paperCount: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },

  editCard: { borderRadius: radius.xl, borderWidth: 1, padding: 16, gap: 8, marginBottom: 14 },
  editTitle: { fontSize: 20, fontWeight: "900", paddingBottom: 8, borderBottomWidth: 1 },
  editDesc: { borderWidth: 1, borderRadius: radius.md, padding: 10, fontSize: 14 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14 },

  paperRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  paperTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  paperMeta: { fontSize: 12 },
});
