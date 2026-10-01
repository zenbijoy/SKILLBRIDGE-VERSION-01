import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row } from "@/components/ui";
import type { PostQuoteMetadata } from "../../types";

interface QuoteBuilderProps {
  data: PostQuoteMetadata;
  onChange: (data: PostQuoteMetadata) => void;
  onRemove: () => void;
}

export function QuoteBuilder({ data, onChange, onRemove }: QuoteBuilderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: "#84CC16", backgroundColor: colors.surface }]}>
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="format-quote-close" size={18} color="#84CC16" />
          <Text style={styles.title}>Quote Card Builder</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Row>

      {/* Quote Text */}
      <TextInput
        style={[styles.quoteInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        placeholder="Enter quote or inspiring thought..."
        placeholderTextColor={colors.muted}
        value={data.quote}
        onChangeText={(text) => onChange({ ...data, quote: text })}
        multiline
      />

      <Row style={{ gap: 10 }}>
        {/* Author */}
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder="Author / Speaker"
          placeholderTextColor={colors.muted}
          value={data.author}
          onChangeText={(text) => onChange({ ...data, author: text })}
        />

        {/* Source */}
        <TextInput
          style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
          placeholder="Source / Book / Speech"
          placeholderTextColor={colors.muted}
          value={data.source || ""}
          onChangeText={(text) => onChange({ ...data, source: text })}
        />
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
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#84CC16",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quoteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontStyle: "italic",
    minHeight: 60,
    marginBottom: 8,
    textAlignVertical: "top",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
});
