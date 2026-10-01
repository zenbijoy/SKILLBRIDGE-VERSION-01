import React from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { CODE_LANGUAGES } from "../../constants";
import type { PostCodeMetadata } from "../../types";

interface CodeEditorProps {
  data: PostCodeMetadata;
  onChange: (data: PostCodeMetadata) => void;
  onRemove: () => void;
}

export function CodeEditor({ data, onChange, onRemove }: CodeEditorProps) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <Row style={styles.header}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="code-tags" size={18} color="#38BDF8" />
          <Text style={styles.title}>Code Post Editor</Text>
        </Row>
        <Pressable onPress={onRemove} hitSlop={6}>
          <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
        </Pressable>
      </Row>

      {/* Snippet Title */}
      <TextInput
        style={styles.titleInput}
        placeholder="Snippet Title (e.g. Binary Search in C++)"
        placeholderTextColor="#64748B"
        value={data.title || ""}
        onChangeText={(text) => onChange({ ...data, title: text })}
      />

      {/* Language Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll}>
        <Row style={{ gap: 6 }}>
          {CODE_LANGUAGES.map((lang) => {
            const isSelected = data.language === lang.value;
            return (
              <Pressable
                key={lang.value}
                onPress={() => {
                  triggerHaptic("selection");
                  onChange({ ...data, language: lang.value });
                }}
                style={[
                  styles.langPill,
                  isSelected && { backgroundColor: "#38BDF825", borderColor: "#38BDF8" },
                ]}
              >
                <Text
                  style={[
                    styles.langPillText,
                    { color: isSelected ? "#38BDF8" : "#94A3B8", fontWeight: isSelected ? "700" : "500" },
                  ]}
                >
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </ScrollView>

      {/* Code Text Area */}
      <TextInput
        style={styles.codeInput}
        placeholder="// Paste or write your code here..."
        placeholderTextColor="#475569"
        value={data.code}
        onChangeText={(text) => onChange({ ...data, code: text })}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0D1117",
    borderWidth: 1,
    borderColor: "#30363D",
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
    color: "#38BDF8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: "#30363D",
    borderRadius: radius.md,
    backgroundColor: "#161B22",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#F0F6FC",
    marginBottom: 8,
  },
  langScroll: {
    marginBottom: 8,
  },
  langPill: {
    borderWidth: 1,
    borderColor: "#30363D",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "#161B22",
  },
  langPillText: {
    fontSize: 11.5,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "#30363D",
    borderRadius: radius.md,
    backgroundColor: "#161B22",
    padding: 12,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#58A6FF",
    minHeight: 120,
    textAlignVertical: "top",
  },
});
