import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
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
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type {
  SSPaper,
  SavedPaper,
  PaperAiInsights,
  PaperQuestionAnswer,
  CitationFormats,
  ResearchCollection,
  ResearchWorkspaceSummary,
} from "@/features/research/types";

type PaperDetail = SSPaper;
type CitationRef = {
  paperId: string;
  title: string;
  year?: number;
  citationCount?: number;
  authors: { name: string }[];
};

const CITATION_STYLES = [
  { id: "apa", label: "APA 7th" },
  { id: "mla", label: "MLA 9th" },
  { id: "ieee", label: "IEEE" },
  { id: "chicago", label: "Chicago" },
  { id: "harvard", label: "Harvard" },
  { id: "bibtex", label: "BibTeX" },
] as const;

export default function PaperDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeSection, setActiveSection] = useState<"abstract" | "ai" | "references" | "citations">("abstract");
  const [citationFormat, setCitationFormat] = useState<string>("apa");
  const [showCitationModal, setShowCitationModal] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);

  // Collections state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);

  // Workspace share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [shareComment, setShareComment] = useState("");

  // AI Q&A state
  const [customQuestion, setCustomQuestion] = useState("");
  const [qaHistory, setQaHistory] = useState<PaperQuestionAnswer[]>([]);

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

  const aiInsightsQuery = useQuery({
    queryKey: ["paper-ai-insights", paperId],
    queryFn: () => api<PaperAiInsights>(`/research/papers/${encodeURIComponent(paperId)}/ai-insights`),
    enabled: activeSection === "ai" && Boolean(paperId),
    staleTime: 60_000 * 30,
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
      api<CitationFormats>(`/research/papers/${encodeURIComponent(paperId)}/cite?format=${citationFormat}`),
    enabled: showCitationModal && Boolean(paperId),
  });

  const collectionsQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<{ data: ResearchCollection[] }>("/research/collections"),
    enabled: showCollectionModal,
  });

  const workspacesQuery = useQuery({
    queryKey: ["user-workspaces"],
    queryFn: () => api<{ data: ResearchWorkspaceSummary[] }>("/research/user/workspaces"),
    enabled: showShareModal,
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

  const askAiMutation = useMutation({
    mutationFn: (questionText: string) =>
      api<PaperQuestionAnswer>(`/research/papers/${encodeURIComponent(paperId)}/ai-qa`, {
        method: "POST",
        body: JSON.stringify({ question: questionText }),
      }),
    onSuccess: (res) => {
      triggerHaptic();
      setQaHistory((prev) => [res, ...prev]);
      setCustomQuestion("");
    },
    onError: (err) => {
      Alert.alert("AI Error", (err as Error).message || "Could not answer question");
    },
  });

  const shareToWorkspaceMutation = useMutation({
    mutationFn: ({ roomId, comment }: { roomId: string; comment?: string }) =>
      api(`/research/papers/${encodeURIComponent(paperId)}/share-to-workspace`, {
        method: "POST",
        body: JSON.stringify({ roomId, comment }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setShowShareModal(false);
      setShareComment("");
      Alert.alert(
        "Paper Shared! 🚀",
        "This paper and discussion link have been posted to your research workspace.",
        [
          { text: "Dismiss", style: "cancel" },
          {
            text: "Open Chat 💬",
            onPress: () => {
              if (selectedWorkspaceId) {
                router.push(`/room/${selectedWorkspaceId}?tab=chat` as any);
              }
            },
          },
        ]
      );
    },
    onError: (err) => {
      Alert.alert("Share Failed", (err as Error).message || "Could not share paper to workspace");
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) =>
      api("/research/collections", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setNewCollectionName("");
      setCreatingCol(false);
      qc.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const addPaperToColMutation = useMutation({
    mutationFn: (colId: string) =>
      api(`/research/collections/${colId}/papers`, {
        method: "POST",
        body: JSON.stringify({ paper_id: paperId, paper_data: paperQuery.data }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["collections"] });
      Alert.alert("Added to Collection", "Paper has been saved to your selected collection.");
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
        <Empty title="Paper not found" detail="This paper could not be loaded from academic sources." />
      </Screen>
    );
  }

  const rawPdf = paper.pdfUrl || paper.openAccessPdf?.url;
  const arxivId = paper.externalIds?.ArXiv;
  const doi = paper.externalIds?.DOI;
  const pmcid = (paper.externalIds as any)?.PMCID;

  const pdfUrl = rawPdf || (arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null) || (pmcid ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${pmcid}&blobtype=pdf` : null);
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const arXivUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : null;
  const readUrl = paper.readUrl || pdfUrl || arXivUrl || doiUrl || paper.url;

  const sourceName = paper.source === "arxiv"
    ? "arXiv (Real-Time ⚡)"
    : paper.source === "openalex"
    ? "OpenAlex (250M+ Works 📚)"
    : paper.source === "europepmc"
    ? "Europe PMC / PubMed 🧬"
    : paper.source === "crossref"
    ? "Crossref (Peer-Reviewed 🏛️)"
    : paper.sourceLabel || "Scholarly Index";

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

  const handleCopyBibtex = async () => {
    const bib = citationTextQuery.data?.allFormats?.bibtex;
    if (bib) {
      await copyToClipboard(bib, "BibTeX");
      triggerHaptic();
      setCopiedBibtex(true);
      setTimeout(() => setCopiedBibtex(false), 2000);
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
        {/* Fields & Open Access & Real-Time Source */}
        <Row style={{ flexWrap: "wrap", gap: 6 }}>
          {sourceName ? (
            <Pill tone="accent">{sourceName}</Pill>
          ) : null}
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
          {/* Quick AI Breakdown */}
          <Pressable
            onPress={() => { triggerHaptic(); setActiveSection("ai"); }}
            style={[s.actionBtn, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="creation" size={16} color={colors.primary} />
            <Text style={[s.actionBtnText, { color: colors.primary, fontWeight: "800" }]}>AI Breakdown ✨</Text>
          </Pressable>

          {/* Save bookmark */}
          <Pressable
            onPress={() => { triggerHaptic(); saveMutation.mutate(); }}
            style={[s.actionBtn, { backgroundColor: isSaved ? `${colors.warning}18` : colors.surface2, borderColor: isSaved ? colors.warning : colors.border }]}
          >
            <MaterialCommunityIcons name={isSaved ? "bookmark" : "bookmark-outline"} size={16} color={isSaved ? colors.warning : colors.text} />
            <Text style={[s.actionBtnText, { color: isSaved ? colors.warning : colors.text }]}>
              {isSaved ? "Saved" : "Save"}
            </Text>
          </Pressable>

          {/* Add to Collection */}
          <Pressable
            onPress={() => { triggerHaptic(); setShowCollectionModal(true); }}
            style={[s.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="folder-plus-outline" size={16} color={colors.text} />
            <Text style={[s.actionBtnText, { color: colors.text }]}>Collection</Text>
          </Pressable>

          {/* Cite */}
          <Pressable
            onPress={() => { triggerHaptic(); setShowCitationModal(true); }}
            style={[s.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="format-quote-open" size={16} color={colors.text} />
            <Text style={[s.actionBtnText, { color: colors.text }]}>Cite</Text>
          </Pressable>

          {/* Share to Workspace */}
          <Pressable
            onPress={() => { triggerHaptic(); setShowShareModal(true); }}
            style={[s.actionBtn, { backgroundColor: `${colors.accent}15`, borderColor: `${colors.accent}40` }]}
          >
            <MaterialCommunityIcons name="forum-outline" size={16} color={colors.accent} />
            <Text style={[s.actionBtnText, { color: colors.accent, fontWeight: "700" }]}>To Lab 💬</Text>
          </Pressable>

          {/* Share external */}
          <Pressable
            onPress={handleShare}
            style={[s.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="share-outline" size={16} color={colors.text} />
            <Text style={[s.actionBtnText, { color: colors.text }]}>Share</Text>
          </Pressable>

          {/* Read PDF */}
          {pdfUrl ? (
            <Pressable
              onPress={() => { triggerHaptic(); openUrl(pdfUrl); }}
              style={[s.actionBtn, { backgroundColor: `${colors.info}20`, borderColor: `${colors.info}50` }]}
            >
              <MaterialCommunityIcons name="file-pdf-box" size={16} color={colors.info} />
              <Text style={[s.actionBtnText, { color: colors.info, fontWeight: "800" }]}>Read PDF 📄</Text>
            </Pressable>
          ) : readUrl ? (
            <Pressable
              onPress={() => { triggerHaptic(); openUrl(readUrl); }}
              style={[s.actionBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` }]}
            >
              <MaterialCommunityIcons name="book-open-page-variant" size={16} color={colors.primary} />
              <Text style={[s.actionBtnText, { color: colors.primary, fontWeight: "800" }]}>Read Paper 📖</Text>
            </Pressable>
          ) : null}
        </Row>

        {/* External links */}
        {(doiUrl || arXivUrl || paper.url) ? (
          <Row style={{ gap: 8, flexWrap: "wrap", marginTop: 2 }}>
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
                <Text style={[s.linkChipText, { color: colors.primary }]}>Publication ↗</Text>
              </Pressable>
            ) : null}
          </Row>
        ) : null}
      </View>

      {/* ── Section Tabs ─────────────────────────────────────────────────── */}
      <Row style={{ gap: 6, marginVertical: 6 }}>
        {([
          { key: "abstract", label: "Abstract", icon: "text" },
          { key: "ai", label: "AI Insights ✨", icon: "sparkles" },
          { key: "references", label: `Refs (${paper.referenceCount ?? 0})`, icon: "link-variant" },
          { key: "citations", label: `Citations (${paper.citationCount ?? 0})`, icon: "format-quote-close" },
        ] as const).map((sec) => {
          const active = activeSection === sec.key;
          return (
            <Pressable
              key={sec.key}
              onPress={() => { triggerHaptic(); setActiveSection(sec.key); }}
              style={[
                s.sectionTab,
                {
                  backgroundColor: active ? (sec.key === "ai" ? colors.primary : colors.primary) : colors.surface2,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[s.sectionTabText, { color: active ? colors.white : colors.text }]}>{sec.label}</Text>
            </Pressable>
          );
        })}
      </Row>

      {/* ── Abstract View ─────────────────────────────────────────────────── */}
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
            <View style={{ gap: 6, marginTop: 4 }}>
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

      {/* ── AI Insights View ──────────────────────────────────────────────── */}
      {activeSection === "ai" && (
        <View style={{ gap: 12 }}>
          {aiInsightsQuery.isLoading ? (
            <Card style={{ gap: 10, padding: 18, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Generating AI Paper Analysis...</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>Synthesizing key findings, architecture, and practical takeaways</Text>
            </Card>
          ) : aiInsightsQuery.isError ? (
            <ErrorState detail="Could not generate AI insights" onRetry={() => aiInsightsQuery.refetch()} />
          ) : aiInsightsQuery.data ? (
            <>
              {/* TL;DR Executive Summary */}
              <View style={[s.aiCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}35` }]}>
                <Row style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <MaterialCommunityIcons name="creation" size={18} color={colors.primary} />
                  <Text style={[s.aiCardTitle, { color: colors.primary }]}>TL;DR / Executive Summary</Text>
                </Row>
                <Text style={[s.aiBodyText, { color: colors.text }]}>{aiInsightsQuery.data.tldr}</Text>
              </View>

              {/* Key Findings */}
              <View style={[s.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={18} color={colors.success} />
                  <Text style={[s.aiCardTitle, { color: colors.text }]}>Key Findings & Contributions</Text>
                </Row>
                {aiInsightsQuery.data.keyFindings.map((finding, idx) => (
                  <Row key={idx} style={{ gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <MaterialCommunityIcons name="check-circle" size={15} color={colors.success} style={{ marginTop: 2 }} />
                    <Text style={[s.aiBulletText, { color: colors.text }]}>{finding}</Text>
                  </Row>
                ))}
              </View>

              {/* Methodology & Tech */}
              <View style={[s.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <MaterialCommunityIcons name="flask-outline" size={18} color={colors.info} />
                  <Text style={[s.aiCardTitle, { color: colors.text }]}>Methodology & Architecture</Text>
                </Row>
                <Text style={[s.aiBodyText, { color: colors.text }]}>{aiInsightsQuery.data.methodology}</Text>
              </View>

              {/* Practical Takeaways */}
              <View style={[s.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.warning} />
                  <Text style={[s.aiCardTitle, { color: colors.text }]}>Practical Takeaways & Applications</Text>
                </Row>
                {aiInsightsQuery.data.practicalTakeaways.map((item, idx) => (
                  <Row key={idx} style={{ gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <MaterialCommunityIcons name="arrow-right-circle" size={15} color={colors.warning} style={{ marginTop: 2 }} />
                    <Text style={[s.aiBulletText, { color: colors.text }]}>{item}</Text>
                  </Row>
                ))}
              </View>

              {/* Future Directions */}
              {aiInsightsQuery.data.futureDirections ? (
                <View style={[s.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Row style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <MaterialCommunityIcons name="compass-outline" size={18} color={colors.accent} />
                    <Text style={[s.aiCardTitle, { color: colors.text }]}>Future Directions & Open Problems</Text>
                  </Row>
                  <Text style={[s.aiBodyText, { color: colors.text }]}>{aiInsightsQuery.data.futureDirections}</Text>
                </View>
              ) : null}

              {/* ── Interactive Ask This Paper ────────────────────────────── */}
              <View style={[s.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="comment-question-outline" size={18} color={colors.primary} />
                  <Text style={[s.aiCardTitle, { color: colors.text }]}>Ask This Paper Anything</Text>
                </Row>

                {/* Suggested prompt chips */}
                <Row style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {[
                    "Explain in simple terms 💡",
                    "What are the limitations? ⚠️",
                    "What dataset was evaluated? 📊",
                    "How to replicate results? 🛠️",
                  ].map((chip) => (
                    <Pressable
                      key={chip}
                      onPress={() => {
                        triggerHaptic();
                        setCustomQuestion(chip);
                        askAiMutation.mutate(chip);
                      }}
                      style={[s.promptChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                    >
                      <Text style={[s.promptChipText, { color: colors.muted }]}>{chip}</Text>
                    </Pressable>
                  ))}
                </Row>

                {/* Input box */}
                <View style={[s.qaInputBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <TextInput
                    value={customQuestion}
                    onChangeText={setCustomQuestion}
                    placeholder="Ask a specific question about methodology or results..."
                    placeholderTextColor={colors.muted}
                    style={[s.qaInput, { color: colors.text }]}
                  />
                  <Pressable
                    onPress={() => {
                      if (customQuestion.trim()) {
                        triggerHaptic();
                        askAiMutation.mutate(customQuestion.trim());
                      }
                    }}
                    disabled={!customQuestion.trim() || askAiMutation.isPending}
                    style={[s.qaSendBtn, { backgroundColor: customQuestion.trim() ? colors.primary : colors.surface2 }]}
                  >
                    {askAiMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <MaterialCommunityIcons name="send" size={16} color={customQuestion.trim() ? colors.white : colors.muted} />
                    )}
                  </Pressable>
                </View>

                {/* Answers history */}
                {qaHistory.map((item, idx) => (
                  <View key={idx} style={[s.qaAnswerCard, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` }]}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, marginBottom: 4 }}>
                      Q: {item.question}
                    </Text>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: colors.text }}>{item.answer}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      )}

      {/* ── References View ───────────────────────────────────────────────── */}
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

      {/* ── Cited By View ─────────────────────────────────────────────────── */}
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

      {/* ── Universal Citation Modal ──────────────────────────────────────── */}
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
              <H2>Universal Citation Generator</H2>
              <Pressable onPress={() => setShowCitationModal(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            {/* Style Selector Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {CITATION_STYLES.map((st) => (
                <Pressable
                  key={st.id}
                  onPress={() => { triggerHaptic(); setCitationFormat(st.id); }}
                  style={[
                    s.formatBtn,
                    {
                      backgroundColor: citationFormat === st.id ? colors.primary : colors.surface2,
                      borderColor: citationFormat === st.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[s.formatBtnText, { color: citationFormat === st.id ? colors.white : colors.text }]}>
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {citationTextQuery.isLoading ? (
              <Skeleton height={80} />
            ) : citationTextQuery.data?.citation ? (
              <View style={[s.citationBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <Text style={[s.citationText, { color: colors.text }]} selectable>
                  {citationTextQuery.data.citation}
                </Text>
              </View>
            ) : null}

            <Row style={{ gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={copiedCitation ? "Copied! ✓" : `Copy ${citationFormat.toUpperCase()}`}
                  icon="content-copy"
                  onPress={handleCopyCitation}
                  disabled={!citationTextQuery.data?.citation || copiedCitation}
                  variant={copiedCitation ? "accent" : "primary"}
                  compact
                />
              </View>
              {citationFormat !== "bibtex" && citationTextQuery.data?.allFormats?.bibtex ? (
                <View style={{ flex: 1 }}>
                  <Button
                    title={copiedBibtex ? "BibTeX Copied! ✓" : "Copy BibTeX"}
                    icon="code-tags"
                    onPress={handleCopyBibtex}
                    disabled={copiedBibtex}
                    variant="secondary"
                    compact
                  />
                </View>
              ) : null}
            </Row>
          </Pressable>
        </Pressable>
      )}

      {/* ── Add to Collection Modal ───────────────────────────────────────── */}
      {showCollectionModal && (
        <Pressable
          onPress={() => setShowCollectionModal(false)}
          style={[s.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[s.citationSheet, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: "80%" }]}
          >
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <H2>Save to Collection</H2>
              <Pressable onPress={() => setShowCollectionModal(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            {/* Quick create collection */}
            {creatingCol ? (
              <Row style={{ gap: 8, marginBottom: 12 }}>
                <TextInput
                  value={newCollectionName}
                  onChangeText={setNewCollectionName}
                  placeholder="Collection name (e.g. Deep Learning Thesis)..."
                  placeholderTextColor={colors.muted}
                  style={[s.newColInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                />
                <Button
                  title="Create"
                  compact
                  onPress={() => {
                    if (newCollectionName.trim()) {
                      createCollectionMutation.mutate(newCollectionName.trim());
                    }
                  }}
                  disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
                />
              </Row>
            ) : (
              <Pressable
                onPress={() => setCreatingCol(true)}
                style={[s.newColTrigger, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>Create New Collection</Text>
              </Pressable>
            )}

            <ScrollView style={{ maxHeight: 260 }}>
              {collectionsQuery.isLoading ? (
                <Skeleton height={100} />
              ) : collectionsQuery.data?.data?.length === 0 ? (
                <Empty icon="folder-outline" title="No collections yet" detail="Create your first collection to organize your research papers." />
              ) : (
                collectionsQuery.data?.data?.map((col) => (
                  <Pressable
                    key={col.id}
                    onPress={() => addPaperToColMutation.mutate(col.id)}
                    style={[s.colItem, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="folder-outline" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.colItemName, { color: colors.text }]}>{col.name}</Text>
                      {col.description ? <Text style={[s.colItemDesc, { color: colors.muted }]}>{col.description}</Text> : null}
                    </View>
                    <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.muted} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {/* ── Share to Workspace Modal ──────────────────────────────────────── */}
      {showShareModal && (
        <Pressable
          onPress={() => setShowShareModal(false)}
          style={[s.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[s.citationSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <H2>Share to Lab Workspace</H2>
              <Pressable onPress={() => setShowShareModal(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>

            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
              Select a research workspace to broadcast this paper into the live chat channel for discussion.
            </Text>

            {/* Workspace list */}
            <ScrollView style={{ maxHeight: 180, marginBottom: 10 }}>
              {workspacesQuery.isLoading ? (
                <Skeleton height={70} />
              ) : workspacesQuery.data?.data?.length === 0 ? (
                <Empty icon="flask-outline" title="No research workspaces" detail="You are not enrolled in any research projects yet." />
              ) : (
                workspacesQuery.data?.data?.map((ws) => {
                  const selected = selectedWorkspaceId === ws.roomId;
                  return (
                    <Pressable
                      key={ws.roomId}
                      onPress={() => { triggerHaptic(); setSelectedWorkspaceId(ws.roomId); }}
                      style={[
                        s.wsItem,
                        {
                          backgroundColor: selected ? `${colors.primary}18` : colors.surface2,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={selected ? "radiobox-marked" : "radiobox-blank"}
                        size={18}
                        color={selected ? colors.primary : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.wsName, { color: colors.text }]}>{ws.projectTitle}</Text>
                        <Text style={[s.wsSub, { color: colors.muted }]}>{ws.roomName}</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {/* Note input */}
            <TextInput
              value={shareComment}
              onChangeText={setShareComment}
              placeholder="Add an optional discussion note or question for your team..."
              placeholderTextColor={colors.muted}
              multiline
              style={[s.shareNoteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            />

            <Button
              title="Post to Workspace Chat 💬"
              onPress={() => {
                if (selectedWorkspaceId) {
                  shareToWorkspaceMutation.mutate({
                    roomId: selectedWorkspaceId,
                    comment: shareComment,
                  });
                }
              }}
              disabled={!selectedWorkspaceId || shareToWorkspaceMutation.isPending}
              loading={shareToWorkspaceMutation.isPending}
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

  // AI Cards
  aiCard: { borderRadius: radius.lg, borderWidth: 1, padding: 14, gap: 6 },
  aiCardTitle: { fontSize: 14, fontWeight: "800" },
  aiBodyText: { fontSize: 13, lineHeight: 20 },
  aiBulletText: { fontSize: 13, lineHeight: 19, flex: 1 },
  promptChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  promptChipText: { fontSize: 11, fontWeight: "600" },
  qaInputBox: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  qaInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  qaSendBtn: { paddingHorizontal: 14, paddingVertical: 11 },
  qaAnswerCard: { padding: 10, borderRadius: radius.md, borderWidth: 1, marginTop: 6 },

  refItem: { padding: 12, borderRadius: radius.md, borderWidth: 1 },
  refTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  refMeta: { fontSize: 11 },

  // Modals
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100 },
  citationSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, borderWidth: 1, gap: 10 },
  formatBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  formatBtnText: { fontSize: 12, fontWeight: "800" },
  citationBox: { borderRadius: radius.md, borderWidth: 1, padding: 12 },
  citationText: { fontSize: 12, lineHeight: 18, fontFamily: "monospace" },

  // Collections modal
  newColTrigger: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: radius.md, borderWidth: 1, marginBottom: 8 },
  newColInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, fontSize: 13 },
  colItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, marginBottom: 6 },
  colItemName: { fontSize: 13, fontWeight: "800" },
  colItemDesc: { fontSize: 11, marginTop: 2 },

  // Workspaces modal
  wsItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, marginBottom: 6 },
  wsName: { fontSize: 13, fontWeight: "800" },
  wsSub: { fontSize: 11, marginTop: 1 },
  shareNoteInput: { borderRadius: radius.md, borderWidth: 1, padding: 10, fontSize: 13, height: 60, textAlignVertical: "top", marginBottom: 10 },
});
