import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import type { PostStudyNoteMetadata } from "../../types";

interface StudyNoteBuilderProps {
  data: PostStudyNoteMetadata;
  onChange: (data: PostStudyNoteMetadata) => void;
  onRemove: () => void;
}

export function StudyNoteBuilder({ data, onChange, onRemove }: StudyNoteBuilderProps) {
  const { colors } = useTheme();

  const handleIdeaChange = (text: string, index: number) => {
    const updated = [...data.key_ideas];
    updated[index] = text;
    onChange({ ...data, key_ideas: updated });
  };

  const handleAddIdea = () => {
    triggerHaptic("selection");
    onChange({ ...data, key_ideas: [...data.key_ideas, ""] });
  };

  const handleRemoveIdea = (index: number) => {
    triggerHaptic("selection");
    const updated = data.key_ideas.filter((_, idx) => idx !== index);
    onChange({ ...data, key_ideas: updated });
  };

  return (
    <View style={[styles.container, { borderColor: "#06B6D4", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#06B6D4" />
          <Text style={styles.title}>Study Note Details</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Subject */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Subject / Course (e.g. CSE 2101: Data Structures)"
        placeholderTextColor={colors.muted}
        value={data.subject}
        onChangeText={(text) => onChange({ ...data, subject: text })}
      />

      {/* Key Ideas List */}
      <View style={{ gap: 6 }}>
        <Text style={[styles.subLabel, { color: colors.muted }]}>Key Points & Formulas</Text>
        {data.key_ideas.map((idea, idx) => (
          <Row key={idx} style={{ alignItems: "center", gap: 6 }}>
            <TextInput
              style={[
                styles.ideaInput,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
              ]}
              placeholder={`Formula or core point ${idx + 1}`}
              placeholderTextColor={colors.muted}
              value={idea}
              onChangeText={(text) => handleIdeaChange(text, idx)}
            />
            {data.key_ideas.length > 1 && (
              <Pressable onPress={() => handleRemoveIdea(idx)}>
                <MaterialCommunityIcons name="minus-circle-outline" size={18} color="#EF4444" />
              </Pressable>
            )}
          </Row>
        ))}
      </View>

      <Pressable onPress={handleAddIdea} style={[styles.addIdeaBtn, { borderColor: "#06B6D4" }]}>
        <MaterialCommunityIcons name="plus" size={15} color="#06B6D4" />
        <Text style={styles.addIdeaText}>Add Formula / Point</Text>
      </Pressable>

      {/* References */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg, marginTop: 4 }]}
        placeholder="References / Textbook Citation (Optional)"
        placeholderTextColor={colors.muted}
        value={data.references || ""}
        onChangeText={(text) => onChange({ ...data, references: text })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 10,
  },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#06B6D4",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
  },
  ideaInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  addIdeaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 6,
    borderRadius: radius.md,
    marginVertical: 6,
  },
  addIdeaText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#06B6D4",
  },
});
