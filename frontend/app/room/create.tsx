import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Room } from "@/types";
import { Button, Card, H1, H2, Muted, Row, Screen } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export default function CreateRoomScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private" | "invite_only">("public");
  const [capacity, setCapacity] = useState("25");
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">("online");
  const [campusLocation, setCampusLocation] = useState("");
  const [inviteUsernames, setInviteUsernames] = useState("");

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const capNumber = parseInt(capacity, 10);
      if (isNaN(capNumber) || capNumber < 2 || capNumber > 500) {
        throw new Error("Capacity must be a number between 2 and 500.");
      }

      if ((mode === "offline" || mode === "hybrid") && !campusLocation.trim()) {
        throw new Error("Campus location is required for in-person or hybrid study rooms.");
      }

      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        description: description.trim(),
        rules: rules.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        visibility,
        capacity: capNumber,
        mode,
        campus_location: mode !== "online" ? campusLocation.trim() : undefined,
      };

      const res = await api<{ room: Room }>("/rooms", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Send initial invitations if any specified
      if (inviteUsernames.trim() && res.room?.id) {
        const usernames = inviteUsernames
          .split(",")
          .map((u) => u.trim().replace(/^@/, ""))
          .filter(Boolean);

        for (const username of usernames) {
          try {
            await api(`/rooms/${res.room.id}/invitations`, {
              method: "POST",
              body: JSON.stringify({ username }),
            });
          } catch {
            // non-fatal: room was still created
          }
        }
      }

      return res.room;
    },
    onSuccess: (newRoom) => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      Alert.alert("Room Created!", `"${newRoom.title}" is ready.`, [
        {
          text: "Open Room",
          onPress: () => router.replace(`/room/${newRoom.id}`),
        },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Failed to Create Room", err.message || "An unexpected error occurred.");
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please provide a name for your study room.");
      return;
    }
    if (!topic.trim()) {
      Alert.alert("Missing Subject/Topic", "Please provide a topic (e.g. Algorithms, Organic Chemistry).");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <H1 style={styles.title}>Create Study Room</H1>
        </Row>
        <Muted style={styles.subtitle}>Launch a collaborative learning space for your peers or study group.</Muted>

        {/* Basic Information */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>1. Basic Details</H2>
          
          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Room Title *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Distributed Systems Working Group"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Topic / Subject *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Computer Science, Calculus II, MCAT Prep"
              placeholderTextColor={colors.muted}
              value={topic}
              onChangeText={setTopic}
              maxLength={60}
            />
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="What will members learn or collaborate on in this room?"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Room Guidelines & Rules</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Be respectful, no spam, participate actively in sessions."
              placeholderTextColor={colors.muted}
              value={rules}
              onChangeText={setRules}
              multiline
              numberOfLines={2}
              maxLength={300}
            />
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Tags</Text>
            <Row style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, styles.tagInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="Add keyword (e.g. python, exam-prep)"
                placeholderTextColor={colors.muted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={addTag}
              />
              <View style={styles.addTagButtonWrapper}>
                <Button title="Add" onPress={addTag} variant="secondary" />
              </View>
            </Row>
            {tags.length > 0 && (
              <View style={styles.tagList}>
                {tags.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => removeTag(tag)}
                    style={[styles.tagBadge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}
                  >
                    <Text style={[styles.tagText, { color: colors.primary }]}>#{tag}</Text>
                    <MaterialCommunityIcons name="close-circle" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </Card>

        {/* Access & Format */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>2. Access & Capacity</H2>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Visibility</Text>
            <Row style={styles.modeRow}>
              {(["public", "private", "invite_only"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setVisibility(v)}
                  style={[
                    styles.modeButton,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    visibility === v && { borderColor: colors.primary, backgroundColor: colors.primary + "14" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={v === "public" ? "earth" : v === "private" ? "lock" : "email-lock"}
                    size={20}
                    color={visibility === v ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.modeButtonText, { color: visibility === v ? colors.primary : colors.text }]}>
                    {v === "public" ? "Public" : v === "private" ? "Private" : "Invite Only"}
                  </Text>
                </Pressable>
              ))}
            </Row>
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Maximum Capacity</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="25"
              placeholderTextColor={colors.muted}
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Muted style={{ fontSize: 12, marginTop: 4 }}>Row-level capacity limits are enforced automatically.</Muted>
          </View>
        </Card>

        {/* Delivery Mode & Location */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>3. Location & Format</H2>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Format</Text>
            <Row style={styles.modeRow}>
              {(["online", "offline", "hybrid"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[
                    styles.modeButton,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    mode === m && { borderColor: colors.primary, backgroundColor: colors.primary + "14" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={m === "online" ? "video" : m === "offline" ? "map-marker" : "transit-connection-variant"}
                    size={20}
                    color={mode === m ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.modeButtonText, { color: mode === m ? colors.primary : colors.text }]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </Row>
          </View>

          {(mode === "offline" || mode === "hybrid") && (
            <View style={styles.fieldWrapper}>
              <Text style={[styles.label, { color: colors.text }]}>Campus Location *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. Science Library Room 304, North Campus"
                placeholderTextColor={colors.muted}
                value={campusLocation}
                onChangeText={setCampusLocation}
                maxLength={120}
              />
            </View>
          )}

          <View style={styles.fieldWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>Initial Invitations (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Comma-separated usernames (e.g. alex, jordan, sam)"
              placeholderTextColor={colors.muted}
              value={inviteUsernames}
              onChangeText={setInviteUsernames}
              autoCapitalize="none"
            />
            <Muted style={{ fontSize: 12, marginTop: 4 }}>Invited members will receive a notification and direct invite.</Muted>
          </View>
        </Card>

        {/* Submit */}
        <View style={styles.footer}>
          <Button
            title={createMutation.isPending ? "Creating Room..." : "Launch Study Room"}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  card: {
    padding: 16,
    marginBottom: 16,
    borderRadius: radius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  tagInputRow: {
    alignItems: "center",
    gap: 8,
  },
  tagInput: {
    flex: 1,
  },
  addTagButtonWrapper: {
    minWidth: 80,
  },
  tagList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "600",
  },
  modeRow: {
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    marginTop: 8,
  },
});
