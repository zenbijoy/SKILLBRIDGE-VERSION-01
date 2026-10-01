import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import type { SSPaper } from "../types";

interface PaperCardProps {
  paper: SSPaper;
  index?: number;
  isSaved?: boolean;
  onSaveToggle?: (saved: boolean) => void;
  compact?: boolean;
}

export function PaperCard({ paper, index = 0, isSaved = false, onSaveToggle, compact = false }: PaperCardProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(isSaved);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (saved) {
        return api(`/research/saved-papers/${encodeURIComponent(paper.paperId)}`, { method: "DELETE" });
      }
      return api("/research/saved-papers", {
        method: "POST",
        body: JSON.stringify({ paper_id: paper.paperId, paper_data: paper }),
      });
    },
    onSuccess: () => {
      const nextSaved = !saved;
      setSaved(nextSaved);
      onSaveToggle?.(nextSaved);
      qc.invalidateQueries({ queryKey: ["saved-papers"] });
      triggerHaptic();
    },
  });

  const primaryField = paper.s2FieldsOfStudy?.[0]?.category || paper.fieldsOfStudy?.[0];
  const pdfUrl = paper.openAccessPdf?.url;
  const authorsShort = paper.authors.slice(0, 3).map((a) => a.name).join(", ") + (paper.authors.length > 3 ? " et al." : "");

  const handlePress = () => {
    triggerHaptic();
    // Track reading history inline
    api("/research/reading-history", {
      method: "POST",
      body: JSON.stringify({
        paper_id: paper.paperId,
        paper_title: paper.title,
        paper_year: paper.year,
        paper_authors: paper.authors.slice(0, 5).map((a) => a.name),
      }),
    }).catch(() => {});
    router.push(`/research/paper/${encodeURIComponent(paper.paperId)}` as any);
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 50).springify()}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        {/* Top row: field pill + year + save button */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            {primaryField ? (
              <View style={[styles.fieldPill, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}30` }]}>
                <Text style={[styles.fieldPillText, { color: colors.primary }]} numberOfLines={1}>
                  {primaryField}
                </Text>
              </View>
            ) : null}
            {paper.isOpenAccess ? (
              <View style={[styles.oaBadge, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}30` }]}>
                <MaterialCommunityIcons name="lock-open-outline" size={10} color={colors.success} />
                <Text style={[styles.oaText, { color: colors.success }]}>Open Access</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.topRight}>
            {paper.year ? <Text style={[styles.yearText, { color: colors.muted }]}>{paper.year}</Text> : null}
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              hitSlop={10}
              style={[styles.saveBtn, { backgroundColor: saved ? `${colors.warning}20` : `${colors.surface2}` }]}
            >
              <MaterialCommunityIcons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={18}
                color={saved ? colors.warning : colors.muted}
              />
            </Pressable>
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={compact ? 2 : 3}>
          {paper.title}
        </Text>

        {/* Authors */}
        {authorsShort ? (
          <Text style={[styles.authors, { color: colors.muted }]} numberOfLines={1}>
            {authorsShort}
          </Text>
        ) : null}

        {/* Abstract snippet */}
        {!compact && paper.abstract ? (
          <Text style={[styles.abstract, { color: colors.textSecondary }]} numberOfLines={3}>
            {paper.abstract}
          </Text>
        ) : null}

        {/* Bottom row: metrics + PDF */}
        <View style={styles.bottomRow}>
          <View style={styles.metrics}>
            {paper.citationCount != null ? (
              <View style={styles.metric}>
                <MaterialCommunityIcons name="format-quote-close" size={13} color={colors.accent} />
                <Text style={[styles.metricText, { color: colors.accent }]}>{paper.citationCount >= 1000 ? `${(paper.citationCount / 1000).toFixed(1)}K` : paper.citationCount}</Text>
              </View>
            ) : null}
            {paper.referenceCount != null ? (
              <View style={styles.metric}>
                <MaterialCommunityIcons name="link-variant" size={13} color={colors.muted} />
                <Text style={[styles.metricText, { color: colors.muted }]}>{paper.referenceCount} refs</Text>
              </View>
            ) : null}
            {paper.venue ? (
              <Text style={[styles.venueText, { color: colors.muted }]} numberOfLines={1}>
                {paper.venue}
              </Text>
            ) : null}
          </View>
          {pdfUrl ? (
            <View style={[styles.pdfBadge, { backgroundColor: `${colors.info}15`, borderColor: `${colors.info}30` }]}>
              <MaterialCommunityIcons name="file-pdf-box" size={12} color={colors.info} />
              <Text style={[styles.pdfText, { color: colors.info }]}>PDF</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    marginBottom: 10,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topLeft: { flexDirection: "row", gap: 6, flex: 1, alignItems: "center" },
  topRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  fieldPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 140,
  },
  fieldPillText: { fontSize: 10, fontWeight: "700" },
  oaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  oaText: { fontSize: 10, fontWeight: "700" },
  yearText: { fontSize: 12, fontWeight: "600" },
  saveBtn: { padding: 5, borderRadius: radius.sm },
  title: { fontSize: 15, fontWeight: "800", lineHeight: 21 },
  authors: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  abstract: { fontSize: 13, lineHeight: 19 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  metrics: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  metric: { flexDirection: "row", alignItems: "center", gap: 3 },
  metricText: { fontSize: 11, fontWeight: "600" },
  venueText: { fontSize: 11, fontStyle: "italic", flex: 1 },
  pdfBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pdfText: { fontSize: 10, fontWeight: "700" },
});
