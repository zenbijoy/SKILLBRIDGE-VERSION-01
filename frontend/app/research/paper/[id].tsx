import React, { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { copyToClipboard } from "@/utils/safeClipboard";
import { api } from "@/lib/api";
import {
  Button,
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
import { radius, spacing, useTheme } from "@/theme";
import type { SSPaper, SavedPaper } from "@/features/research/types";

type PaperDetail = SSPaper;
type CitationRef = {
  paperId: string;
  title: string;
  year?: number;
  citationCount?: number;
  authors: { name: string }[];
};

export default function PaperDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeSection, setActiveSection] = useState<"abstract" | "references" | "citations">("abstract");
  const [citationFormat, setCitationFormat] = useState<"apa" | "bibtex">("apa");
  const [showCitationModal, setShowCitationModal] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);

  const paperId = decodeURIComponent(id ?? "");

  const paperQuery = useQuery({
    queryKey: ["paper-detail", paperId],
    queryFn: () => api<PaperDetail>(`/research/papers/${encodeURIComponent(paperId)}`),
    enabled: Boolean(paperId),
  });

  const savedPapersQuery = useQuery({
    queryKey: ["saved-papers"],
    queryFn: () => api<{ data: SavedPaper[] }>("/research/saved-papers"),
    staleTime: 30_000,
  });

  const referencesQuery = useQuery({
    queryKey: ["paper-refs", paperId],
    queryFn: () => api<{ data: CitationRef[] }>(`/research/papers/${encodeURIComponent(paperId)}/references`),
    enabled: activeSection === "references" && Boolean(paperId),
  });

  const citationsQuery = useQuery({
    queryKey: ["paper-citations", paperId],
    queryFn: () => api<{ data: CitationRef[] }>(`/research/papers/${encodeURIComponent(paperId)}/citations`),
    enabled: activeSection === "citations" && Boolean(paperId),
  });

  const citationTextQuery = useQuery({
    queryKey: ["paper-cite", paperId, citationFormat],
    queryFn: () =>
      api<{ citation: string; format: string }>(`/research/papers/${encodeURIComponent(paperId)}/cite?format=${citationFormat}`),
    enabled: showCitationModal && Boolean(paperId),
  });

  const isSaved = (savedPapersQuery.data?.data ?? []).some((s) => s.paper_id === paperId);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isSaved) {
        return api(`/research/saved-papers/${encodeURIComponent(paperId)}`, { method: "DELETE" });
      }
      return api("/research/saved-papers", {
        method: "POST",
        body: JSON.stringify({ paper_id: paperId, paper_data: paperQuery.data }),
      });
    },
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["saved-papers"] });
    },
  });

  const paper = paperQuery.data;

  if (paperQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={200} />
        <Skeleton height={120} style={{ marginTop: 12 }} />
        <Skeleton height={80} style={{ marginTop: 12 }} />
      </Screen>
    );
  }

  if (paperQuery.isError) {
    return (
      <Screen>
        <ErrorState detail={(paperQuery.error as Error).message} onRetry={() => paperQuery.refetch()} />
      </Screen>
    );
  }

  if (!paper) {
    return (
      <Screen>
        <Empty title="Paper not found" detail="This paper could not be loaded from Semantic Scholar." />
      </Screen>
    );
  }

  const pdfUrl = paper.openAccessPdf?.url;
  const doiUrl = paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : null;
  const arXivUrl = paper.externalIds?.ArXiv ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}` : null;

  const openUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert("Cannot open URL", url);
  };

  const handleShare = () => {
    Share.share({
      title: paper.title,
      message: `${paper.title}\n\n${paper.authors.slice(0, 3).map((a) => a.name).join(", ")} (${paper.year})\n\n${doiUrl ?? arXivUrl ?? paper.url ?? ""}`,
    });
  };

  const handleCopyCitation = async () => {
    if (citationTextQuery.data?.citation) {
      await copyToClipboard(citationTextQuery.data.citation, "Citation");
      triggerHaptic();
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    }
  };

  return (
    <Screen>
      {/* Back navigation */}
      <Pressable onPress={() => router.back()} style={s.backRow} hitSlop={12}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        <Text style={[s.backLabel, { color: colors.text }]}>Research Hub</Text>
      </Pressable>

      {/* ── Header Card ──────────────────────────────────────────────────── */}
      <View style={[s.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Fields & Open Access */}
        <Row style={{ flexWrap: "wrap", gap: 6 }}>
          {paper.fieldsOfStudy?.slice(0, 3).map((f) => (
            <Pill key={f} tone="primary">{f}</Pill>
          ))}
          {paper.isOpenAccess ? <Pill tone="success">Open Access</Pill> : null}
          {paper.publicationTypes?.slice(0, 1).map((t) => <Pill key={t}>{t}</Pill>)}
        </Row>

        {/* Title */}
        <Text style={[s.paperTitle, { color: colors.text }]}>{paper.title}</Text>

        {/* Authors */}
        <View style={{ gap: 2 }}>
          {paper.authors.slice(0, 6).map((author, idx) => (
            <Pressable
              key={idx}
              onPress={() => {
                if (author.authorId) router.push(`/research/author/${author.authorId}` as any);
              }}
            >
              <Text style={[s.authorChip, { color: author.authorId ? colors.primary : colors.muted }]}>
                {author.name}{author.authorId ? " ↗" : ""}
              </Text>
            </Pressable>
          ))}
          {paper.authors.length > 6 ? (
            <Text style={[s.authorChip, { color: colors.muted }]}>+{paper.authors.length - 6} more authors</Text>
          ) : null}
        </View>

        {/* Publication info */}
        <View style={[s.pubInfo, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          {paper.year ? (
            <Row style={{ alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons name="calendar" size={14} color={colors.muted} />
              <Text style={[s.pubText, { color: colors.muted }]}>{paper.year}</Text>
            </Row>
          ) : null}
          {(paper.journal?.name || paper.venue) ? (
            <Row style={{ alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.muted} />
              <Text style={[s.pubText, { color: colors.muted }]} numberOfLines={1}>{paper.journal?.name || paper.venue}</Text>
            </Row>
          ) : null}
          {paper.citationCount != null ? (
            <Row style={{ alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons name="format-quote-close" size={14} color={colors.accent} />
              <Text style={[s.pubText, { color: colors.accent }]}>{paper.citationCount.toLocaleString()} citations</Text>
            </Row>
          ) : null}
          {paper.referenceCount != null ? (
            <Row style={{ alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons name="link-variant" size={14} color={colors.muted} />
              <Text style={[s.pubText, { color: colors.muted }]}>{paper.referenceCount} references</Text>
            </Row>
          ) : null}
        </View>

        {/* Action buttons */}
        <Row style={{ gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => { triggerHaptic(); saveMutation.mutate(); }}
            style={[s.actionBtn, { backgroundColor: isSaved ? `${colors.warning}18` : colors.surface2, borderColor: isSaved ? colors.warning : colors.border }]}
          >
            <MaterialCommunityIcons name={isSaved ? "bookmark" : "bookmark-outline"} size={16} color={isSaved ? colors.warning : colors.text} />
            <Text style={[s.actionBtnText, { color: isSaved ? colors.warning : colors.text }]}>
              {isSaved ? "Saved" : "Save"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => { triggerHaptic(); setShowCitationModal(true); }}
            style={[s.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="format-quote-open" size={16} color={colors.text} />
            <Text style={[s.actionBtnText, { color: colors.text }]}>Cite</Text>
          </Pressable>

          <Pressable
            onPress={handleShare}
            style={[s.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="share-outline" size={16} color={colors.text} />
            <Text style={[s.actionBtnText, { color: colors.text }]}>Share</Text>
          </Pressable>

          {pdfUrl ? (
            <Pressable
              onPress={() => { triggerHaptic(); openUrl(pdfUrl); }}
              style={[s.actionBtn, { backgroundColor: `${colors.info}18`, borderColor: `${colors.info}40` }]}
            >
              <MaterialCommunityIcons name="file-pdf-box" size={16} color={colors.info} />
              <Text style={[s.actionBtnText, { color: colors.info }]}>Read PDF</Text>
            </Pressable>
          ) : null}
        </Row>

        {/* External links */}
        {(doiUrl || arXivUrl || paper.url) ? (
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            {doiUrl ? (
              <Pressable onPress={() => openUrl(doiUrl)} style={[s.linkChip, { borderColor: colors.border }]}>
                <Text style={[s.linkChipText, { color: colors.primary }]}>DOI ↗</Text>
              </Pressable>
            ) : null}
            {arXivUrl ? (
              <Pressable onPress={() => openUrl(arXivUrl)} style={[s.linkChip, { borderColor: colors.border }]}>
                <Text style={[s.linkChipText, { color: colors.primary }]}>arXiv ↗</Text>
              </Pressable>
            ) : null}
            {paper.url && !doiUrl ? (
              <Pressable onPress={() => openUrl(paper.url!)} style={[s.linkChip, { borderColor: colors.border }]}>
                <Text style={[s.linkChipText, { color: colors.primary }]}>Semantic Scholar ↗</Text>
              </Pressable>
            ) : null}
          </Row>
        ) : null}
      </View>

      {/* ── Section Tabs ─────────────────────────────────────────────────── */}
      <Row style={{ gap: 6, marginVertical: 4 }}>
        {(["abstract", "references", "citations"] as const).map((sec) => {
          const active = activeSection === sec;
          const label = sec === "abstract" ? "Abstract" : sec === "references" ? `References (${paper.referenceCount ?? 0})` : `Cited By (${paper.citationCount ?? 0})`;
          return (
            <Pressable
              key={sec}
              onPress={() => { triggerHaptic(); setActiveSection(sec); }}
              style={[s.sectionTab, { backgroundColor: active ? colors.primary : colors.surface2, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[s.sectionTabText, { color: active ? colors.white : colors.text }]}>{label}</Text>
            </Pressable>
          );
        })}
      </Row>

      {/* ── Abstract ────────────────────────────────────────────────────────── */}
      {activeSection === "abstract" && (
        <Card style={{ gap: 12 }}>
          <H2>Abstract</H2>
          {paper.abstract ? (
            <Text style={[s.abstractText, { color: colors.text }]}>{paper.abstract}</Text>
          ) : (
            <Muted>No abstract available for this paper.</Muted>
          )}

          {/* Topic tags */}
          {(paper.s2FieldsOfStudy?.length ?? 0) > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={[s.metaLabel, { color: colors.muted }]}>TOPICS</Text>
              <Row style={{ flexWrap: "wrap", gap: 6 }}>
                {paper.s2FieldsOfStudy?.map((f, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => { triggerHaptic(); router.back(); }}
                    style={[s.topicTag, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}
                  >
                    <Text style={[s.topicTagText, { color: colors.primary }]}>{f.category}</Text>
                  </Pressable>
                ))}
              </Row>
            </View>
          )}
        </Card>
      )}

      {/* ── References ──────────────────────────────────────────────────────── */}
      {activeSection === "references" && (
        <View style={{ gap: 10 }}>
          {referencesQuery.isLoading ? (
            <>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={70} />)}</>
          ) : referencesQuery.isError ? (
            <ErrorState detail="Could not load references" onRetry={() => referencesQuery.refetch()} />
          ) : referencesQuery.data?.data?.length === 0 ? (
            <Empty icon="link-variant-off" title="No references found" detail="Reference data is not available for this paper." />
          ) : (
            referencesQuery.data?.data?.map((ref) => (
              <RefItem key={ref.paperId} item={ref} />
            ))
          )}
        </View>
      )}

      {/* ── Cited By ────────────────────────────────────────────────────────── */}
      {activeSection === "citations" && (
        <View style={{ gap: 10 }}>
          {citationsQuery.isLoading ? (
            <>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={70} />)}</>
          ) : citationsQuery.isError ? (
            <ErrorState detail="Could not load citations" onRetry={() => citationsQuery.refetch()} />
          ) : citationsQuery.data?.data?.length === 0 ? (
            <Empty icon="format-quote-close" title="No citing papers found" detail="Citation data may not be available for this paper." />
          ) : (
            citationsQuery.data?.data?.map((c) => (
              <RefItem key={c.paperId} item={c} />
            ))
          )}
        </View>
      )}

      {/* ── Citation Modal ──────────────────────────────────────────────────── */}
      {showCitationModal && (
        <Pressable
          onPress={() => setShowCitationModal(false)}
          style={[s.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[s.citationSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <H2>Cite Paper</H2>
              <Pressable onPress={() => setShowCitationModal(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Row style={{ gap: 8, marginBottom: 12 }}>
              {(["apa", "bibtex"] as const).map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => { triggerHaptic(); setCitationFormat(fmt); }}
                  style={[s.formatBtn, { backgroundColor: citationFormat === fmt ? colors.primary : colors.surface2, borderColor: citationFormat === fmt ? colors.primary : colors.border }]}
                >
                  <Text style={[s.formatBtnText, { color: citationFormat === fmt ? colors.white : colors.text }]}>
                    {fmt === "apa" ? "APA" : "BibTeX"}
                  </Text>
                </Pressable>
              ))}
            </Row>

            {citationTextQuery.isLoading ? (
              <Skeleton height={80} />
            ) : citationTextQuery.data?.citation ? (
              <View style={[s.citationBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <Text style={[s.citationText, { color: colors.text }]} selectable>
                  {citationTextQuery.data.citation}
                </Text>
              </View>
            ) : null}

            <Button
              title={copiedCitation ? "Copied! ✓" : "Copy Citation"}
              icon="content-copy"
              onPress={handleCopyCitation}
              disabled={!citationTextQuery.data?.citation || copiedCitation}
              variant={copiedCitation ? "accent" : "primary"}
              compact
            />
          </Pressable>
        </Pressable>
      )}
    </Screen>
  );
}

function RefItem({ item }: { item: CitationRef }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (item.paperId) {
          triggerHaptic();
          router.push(`/research/paper/${encodeURIComponent(item.paperId)}` as any);
        }
      }}
      style={[s.refItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[s.refTitle, { color: colors.text }]} numberOfLines={2}>{item.title || "Untitled"}</Text>
      <Row style={{ gap: 8, marginTop: 4 }}>
        {item.authors?.length ? (
          <Text style={[s.refMeta, { color: colors.muted }]} numberOfLines={1}>
            {item.authors.slice(0, 2).map((a) => a.name).join(", ")}
          </Text>
        ) : null}
        {item.year ? <Text style={[s.refMeta, { color: colors.muted }]}>{item.year}</Text> : null}
        {item.citationCount != null ? (
          <Row style={{ alignItems: "center", gap: 3 }}>
            <MaterialCommunityIcons name="format-quote-close" size={11} color={colors.accent} />
            <Text style={[s.refMeta, { color: colors.accent }]}>{item.citationCount}</Text>
          </Row>
        ) : null}
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  backLabel: { fontSize: 14, fontWeight: "600" },

  headerCard: { borderRadius: radius.xl, borderWidth: 1, padding: 16, gap: 12, marginBottom: 14 },
  paperTitle: { fontSize: 20, fontWeight: "900", lineHeight: 27 },
  authorChip: { fontSize: 13, fontWeight: "600" },

  pubInfo: { borderRadius: radius.md, borderWidth: 1, padding: 12, gap: 6 },
  pubText: { fontSize: 12, fontWeight: "600" },

  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
  linkChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  linkChipText: { fontSize: 12, fontWeight: "700" },

  sectionTab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.md, borderWidth: 1 },
  sectionTabText: { fontSize: 11, fontWeight: "800", textAlign: "center" },

  abstractText: { fontSize: 14, lineHeight: 23 },
  metaLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  topicTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  topicTagText: { fontSize: 11, fontWeight: "700" },

  refItem: { padding: 12, borderRadius: radius.md, borderWidth: 1 },
  refTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  refMeta: { fontSize: 11 },

  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100 },
  citationSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, borderWidth: 1, gap: 10 },
  formatBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.md, borderWidth: 1 },
  formatBtnText: { fontSize: 13, fontWeight: "800" },
  citationBox: { borderRadius: radius.md, borderWidth: 1, padding: 12 },
  citationText: { fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
});
