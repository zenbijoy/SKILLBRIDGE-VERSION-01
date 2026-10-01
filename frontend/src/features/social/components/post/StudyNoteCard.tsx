import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import { Row, Pill } from "@/components/ui";
import type { PostStudyNoteMetadata } from "../../types";

interface StudyNoteCardProps {
  note: PostStudyNoteMetadata;
}

export function StudyNoteCard({ note }: StudyNoteCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: "#06B6D4", backgroundColor: colors.surface }]}>
      <Row style={styles.topRow}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#06B6D4" />
          <Text style={styles.headerLabel}>Campus Study Note</Text>
        </Row>
        <Pill tone="info">
          {note.subject.toUpperCase()}
        </Pill>
      </Row>

      {note.key_ideas && note.key_ideas.length > 0 && (
        <View style={styles.ideasContainer}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>Key Takeaways & Formulas</Text>
          {note.key_ideas.map((idea, idx) => (
            <Row key={idx} style={styles.ideaItem}>
              <MaterialCommunityIcons name="check-decagram" size={15} color="#06B6D4" style={{ marginTop: 2 }} />
              <Text style={[styles.ideaText, { color: colors.text }]}>{idea}</Text>
            </Row>
          ))}
        </View>
      )}

      {note.references && (
        <Row style={[styles.refRow, { borderTopColor: colors.border }]}>
          <MaterialCommunityIcons name="bookmark-outline" size={14} color={colors.muted} />
          <Text style={[styles.refText, { color: colors.muted }]}>Ref: {note.references}</Text>
        </Row>
      )}

      {note.topic_tags && note.topic_tags.length > 0 && (
        <Row style={styles.tagsRow}>
          {note.topic_tags.map((tag, idx) => (
            <View key={idx} style={[styles.tagPill, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            </View>
          ))}
        </Row>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderLeftWidth: 4,
    borderRadius: radius.lg,
    padding: 14,
    marginVertical: 8,
  },
  topRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#06B6D4",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ideasContainer: {
    marginTop: 4,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  ideaItem: {
    alignItems: "flex-start",
    gap: 8,
  },
  ideaText: {
    fontSize: 13.5,
    lineHeight: 19,
    flex: 1,
  },
  refRow: {
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  refText: {
    fontSize: 12,
    fontStyle: "italic",
    flex: 1,
  },
  tagsRow: {
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
