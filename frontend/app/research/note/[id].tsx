import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { ResearchNote } from "@/features/research/types";

// Auto-save debounce (ms)
const AUTOSAVE_DELAY = 1500;

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noteQuery = useQuery({
    queryKey: ["research-note", id],
    queryFn: () => api<ResearchNote>(`/research/notes/${id}`),
    enabled: Boolean(id),
    initialData: () => {
      const notesListCache = qc.getQueryData<{ data: ResearchNote[] }>(["research-notes"]);
      return notesListCache?.data?.find((n) => n.id === id);
    },
  });

  useEffect(() => {
    if (noteQuery.data) {
      setTitle(noteQuery.data.title ?? "");
      setBody(noteQuery.data.body ?? "");
      setTags(noteQuery.data.tags ?? []);
    }
  }, [noteQuery.data?.id]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api(`/research/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), body: body.trim(), tags }),
      }),
    onSuccess: (data: any) => {
      setLastSaved(new Date());
      setIsDirty(false);
      // Update cache
      qc.setQueryData<{ data: ResearchNote[] }>(["research-notes"], (old) => {
        if (!old) return old;
        return { data: old.data.map((n) => (n.id === id ? { ...n, ...data } : n)) };
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/research/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-notes"] });
      router.back();
    },
  });

  const scheduleAutosave = () => {
    setIsDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMutation.mutate();
    }, AUTOSAVE_DELAY);
  };

  const handleTitleChange = (t: string) => {
    setTitle(t);
    scheduleAutosave();
  };

  const handleBodyChange = (b: string) => {
    setBody(b);
    scheduleAutosave();
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) {
      const newTags = [...tags, t];
      setTags(newTags);
      setTagInput("");
      setIsDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveMutation.mutate();
      }, 500);
    }
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    setIsDirty(true);
    scheduleAutosave();
  };

  const handleDelete = () => {
    Alert.alert("Delete Note", "Delete this note permanently? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const statusText = saveMutation.isPending
    ? "Saving…"
    : isDirty
      ? "Unsaved changes"
      : lastSaved
        ? `Saved ${lastSaved.toLocaleTimeString()}`
        : "Auto-save enabled";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    >
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => {
          if (isDirty) saveMutation.mutate();
          router.back();
        }} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <Text style={[s.statusText, { color: colors.muted }]}>{statusText}</Text>

        <Row style={{ gap: 8 }}>
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
            hitSlop={10}
          >
            <MaterialCommunityIcons
              name="content-save-outline"
              size={22}
              color={isDirty ? colors.primary : colors.muted}
            />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={10}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
          </Pressable>
        </Row>
      </View>

      {/* Paper link badge (if linked to a paper) */}
      {noteQuery.data?.paper_title ? (
        <View style={[s.paperBadge, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
          <MaterialCommunityIcons name="file-document-outline" size={13} color={colors.primary} />
          <Text style={[s.paperBadgeText, { color: colors.primary }]} numberOfLines={1}>
            From paper: {noteQuery.data.paper_title}
          </Text>
        </View>
      ) : null}

      {/* Title */}
      <TextInput
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Note title..."
        placeholderTextColor={colors.muted}
        style={[s.titleInput, { color: colors.text }]}
        multiline
        returnKeyType="next"
        maxLength={200}
      />

      {/* Tags */}
      <View style={s.tagsSection}>
        <Row style={{ gap: 6, flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => removeTag(tag)}
              style={[s.tag, { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}30` }]}
            >
              <Text style={[s.tagText, { color: colors.accent }]}>#{tag}</Text>
              <MaterialCommunityIcons name="close" size={11} color={colors.accent} />
            </Pressable>
          ))}
          <View style={[s.tagInput, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <TextInput
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Add tag..."
              placeholderTextColor={colors.muted}
              style={[s.tagInputText, { color: colors.text }]}
              onSubmitEditing={addTag}
              returnKeyType="done"
              maxLength={30}
            />
          </View>
        </Row>
      </View>

      {/* Body */}
      <TextInput
        value={body}
        onChangeText={handleBodyChange}
        placeholder={"Start writing your research notes...\n\nYou can jot down:\n• Key findings\n• Methodology observations\n• Questions to explore\n• Quotes and citations"}
        placeholderTextColor={colors.muted}
        style={[s.bodyInput, { color: colors.text }]}
        multiline
        textAlignVertical="top"
        maxLength={50000}
      />

      {/* Word count */}
      <Text style={[s.wordCount, { color: colors.muted }]}>
        {body.trim().split(/\s+/).filter(Boolean).length} words · {body.length} chars
      </Text>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  statusText: { fontSize: 12, fontStyle: "italic" },
  paperBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  paperBadgeText: { fontSize: 12, fontWeight: "600", flex: 1 },
  titleInput: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 32,
    marginBottom: 8,
    padding: 0,
    textAlignVertical: "top",
  },
  tagsSection: { marginBottom: 14 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontWeight: "700" },
  tagInput: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 80,
  },
  tagInputText: { fontSize: 11 },
  bodyInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    padding: 0,
    minHeight: 200,
    textAlignVertical: "top",
  },
  wordCount: {
    fontSize: 11,
    textAlign: "right",
    marginTop: 8,
    marginBottom: 20,
  },
});
