import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import {
  Card,
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
import type { SSAuthor } from "@/features/research/types";

export default function AuthorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const authorId = decodeURIComponent(id ?? "");

  const authorQuery = useQuery({
    queryKey: ["author-detail", authorId],
    queryFn: () => api<SSAuthor>(`/research/authors/${encodeURIComponent(authorId)}`),
    enabled: Boolean(authorId),
  });

  if (authorQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={180} />
        <Skeleton height={100} style={{ marginTop: 12 }} />
      </Screen>
    );
  }

  if (authorQuery.isError) {
    return (
      <Screen>
        <ErrorState detail="Could not load author profile" onRetry={() => authorQuery.refetch()} />
      </Screen>
    );
  }

  const author = authorQuery.data;
  if (!author) return null;

  return (
    <Screen>
      {/* Back */}
      <Pressable onPress={() => router.back()} style={s.backRow} hitSlop={12}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        <Text style={[s.backLabel, { color: colors.muted }]}>Back</Text>
      </Pressable>

      {/* Author card */}
      <View style={[s.authorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.avatar, { backgroundColor: `${colors.primary}18` }]}>
          <MaterialCommunityIcons name="account-school-outline" size={40} color={colors.primary} />
        </View>
        <H1>{author.name}</H1>

        {author.affiliations?.length ? (
          <Row style={{ flexWrap: "wrap", gap: 4 }}>
            {author.affiliations.map((aff, idx) => (
              <Pill key={idx}>{aff}</Pill>
            ))}
          </Row>
        ) : null}

        {/* Metrics */}
        <View style={[s.metricsRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={s.metric}>
            <Text style={[s.metricVal, { color: colors.primary }]}>{author.paperCount?.toLocaleString() ?? "—"}</Text>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Papers</Text>
          </View>
          <View style={[s.metricDivider, { backgroundColor: colors.border }]} />
          <View style={s.metric}>
            <Text style={[s.metricVal, { color: colors.accent }]}>{author.citationCount?.toLocaleString() ?? "—"}</Text>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Citations</Text>
          </View>
          <View style={[s.metricDivider, { backgroundColor: colors.border }]} />
          <View style={s.metric}>
            <Text style={[s.metricVal, { color: colors.success }]}>{author.hIndex ?? "—"}</Text>
            <Text style={[s.metricLabel, { color: colors.muted }]}>h-index</Text>
          </View>
        </View>

        {author.homepage ? (
          <Muted style={{ fontSize: 12 }}>🌐 {author.homepage}</Muted>
        ) : null}
      </View>

      {/* Papers */}
      {author.papers && author.papers.length > 0 ? (
        <View style={{ gap: 10 }}>
          <H2>Papers ({author.papers.length})</H2>
          {author.papers
            .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
            .map((paper, idx) => (
              <Pressable
                key={paper.paperId ?? idx}
                onPress={() => {
                  if (paper.paperId) {
                    triggerHaptic();
                    router.push(`/research/paper/${encodeURIComponent(paper.paperId)}` as any);
                  }
                }}
                style={[s.paperRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.paperTitle, { color: colors.text }]} numberOfLines={2}>
                    {paper.title}
                  </Text>
                  <Row style={{ gap: 10 }}>
                    {paper.year ? (
                      <Text style={[s.paperMeta, { color: colors.muted }]}>{paper.year}</Text>
                    ) : null}
                    {paper.citationCount != null ? (
                      <Row style={{ alignItems: "center", gap: 3 }}>
                        <MaterialCommunityIcons name="format-quote-close" size={12} color={colors.accent} />
                        <Text style={[s.paperMeta, { color: colors.accent }]}>{paper.citationCount}</Text>
                      </Row>
                    ) : null}
                  </Row>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  backLabel: { fontSize: 13, fontWeight: "600" },
  authorCard: { borderRadius: radius.xl, borderWidth: 1, padding: 20, gap: 12, marginBottom: 14, alignItems: "flex-start" },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  metricsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", width: "100%", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1 },
  metric: { alignItems: "center", flex: 1 },
  metricVal: { fontSize: 22, fontWeight: "900" },
  metricLabel: { fontSize: 11, fontWeight: "700" },
  metricDivider: { width: 1, height: 30 },
  paperRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  paperTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  paperMeta: { fontSize: 11 },
});
