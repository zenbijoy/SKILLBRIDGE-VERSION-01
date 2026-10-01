import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";

export interface PollBuilderData {
  question: string;
  options: string[];
  is_multiple: boolean;
  is_anonymous: boolean;
  duration_days?: number;
}

interface PollBuilderProps {
  data: PollBuilderData;
  onChange: (data: PollBuilderData) => void;
  onRemove: () => void;
}

export function PollBuilder({ data, onChange, onRemove }: PollBuilderProps) {
  const { colors } = useTheme();

  const handleOptionChange = (text: string, index: number) => {
    const updated = [...data.options];
    updated[index] = text;
    onChange({ ...data, options: updated });
  };

  const handleAddOption = () => {
    if (data.options.length >= 6) return;
    triggerHaptic("selection");
    onChange({ ...data, options: [...data.options, ""] });
  };

  const handleRemoveOption = (index: number) => {
    if (data.options.length <= 2) return;
    triggerHaptic("selection");
    const updated = data.options.filter((_, idx) => idx !== index);
    onChange({ ...data, options: updated });
  };

  return (
    <View style={[styles.container, { borderColor: "#10B981", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="poll" size={18} color="#10B981" />
          <Text style={styles.title}>Campus Poll Builder</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Question Input */}
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Ask a question for campus peers..."
        placeholderTextColor={colors.muted}
        value={data.question}
        onChangeText={(text) => onChange({ ...data, question: text })}
      />

      {/* Options */}
      <View style={styles.optionsList}>
        {data.options.map((opt, idx) => (
          <Row key={idx} style={styles.optionRow}>
            <TextInput
              style={[
                styles.optionInput,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
              ]}
              placeholder={`Option ${idx + 1}`}
              placeholderTextColor={colors.muted}
              value={opt}
              onChangeText={(text) => handleOptionChange(text, idx)}
            />
            {data.options.length > 2 && (
              <Pressable onPress={() => handleRemoveOption(idx)} style={styles.removeBtn}>
                <MaterialCommunityIcons name="minus-circle-outline" size={20} color="#EF4444" />
              </Pressable>
            )}
          </Row>
        ))}
      </View>

      {/* Add option button */}
      {data.options.length < 6 && (
        <Pressable
          onPress={handleAddOption}
          style={[styles.addOptionBtn, { borderColor: "#10B981" }]}
        >
          <MaterialCommunityIcons name="plus" size={16} color="#10B981" />
          <Text style={styles.addOptionText}>Add Option ({data.options.length}/6)</Text>
        </Pressable>
      )}

      {/* Toggles */}
      <Row style={styles.togglesRow}>
        <Pressable
          onPress={() => onChange({ ...data, is_multiple: !data.is_multiple })}
          style={[
            styles.toggleChip,
            { borderColor: colors.border },
            data.is_multiple && { backgroundColor: "#10B98120", borderColor: "#10B981" },
          ]}
        >
          <MaterialCommunityIcons
            name={data.is_multiple ? "checkbox-marked" : "checkbox-blank-outline"}
            size={16}
            color={data.is_multiple ? "#10B981" : colors.muted}
          />
          <Text
            style={[
              styles.toggleChipText,
              { color: data.is_multiple ? "#10B981" : colors.text },
            ]}
          >
            Multiple Choice
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onChange({ ...data, is_anonymous: !data.is_anonymous })}
          style={[
            styles.toggleChip,
            { borderColor: colors.border },
            data.is_anonymous && { backgroundColor: "#10B98120", borderColor: "#10B981" },
          ]}
        >
          <MaterialCommunityIcons
            name={data.is_anonymous ? "incognito" : "account-outline"}
            size={16}
            color={data.is_anonymous ? "#10B981" : colors.muted}
          />
          <Text
            style={[
              styles.toggleChipText,
              { color: data.is_anonymous ? "#10B981" : colors.text },
            ]}
          >
            Anonymous Votes
          </Text>
        </Pressable>
      </Row>
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
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#10B981",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  optionsList: {
    gap: 8,
    marginBottom: 8,
  },
  optionRow: {
    alignItems: "center",
    gap: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  removeBtn: {
    padding: 4,
  },
  addOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 8,
    marginVertical: 6,
  },
  addOptionText: {
    color: "#10B981",
    fontSize: 12.5,
    fontWeight: "700",
  },
  togglesRow: {
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
  },
  toggleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  toggleChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
