import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, qs } from "@/lib/api";
import type { Profile } from "@/types";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  H1,
  H2,
  H3,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { radius, spacing, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";
import { PaperCard } from "@/features/research/components/PaperCard";
import type {
  ResearchCollection,
  ResearchNote,
  ReadingHistoryEntry,
  SavedPaper,
  TrendingSection,
  SSPaper,
} from "@/features/research/types";
import { RESEARCH_DISCIPLINES, RESEARCH_FIELDS } from "@/features/research/types";

// ─── Types (project) ─────────────────────────────────────────────────────────

type ResearchProject = {
  id: string;
  title: string;
  description?: string;
  owner: Profile;
  owner_id: string;
  status: string;
  research_areas: string[];
  methods: string[];
  tools: string[];
  looking_for_collaborators: boolean;
  collaboration_requirements?: string;
  created_at: string;
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type MainTab = "home" | "papers" | "library" | "projects" | "discover";

const MAIN_TABS: { key: MainTab; icon: string; label: string }[] = [
  { key: "home", icon: "home-variant-outline", label: "Home" },
  { key: "papers", icon: "text-search", label: "Papers" },
  { key: "library", icon: "bookshelf", label: "Library" },
  { key: "projects", icon: "flask-outline", label: "Projects" },
  { key: "discover", icon: "compass-outline", label: "Discover" },
];

type LibrarySection = "saved" | "collections" | "notes" | "history";

// ─── Dataset & Opportunity resources (curated real links) ─────────────────────

const DATASETS = [
  { name: "Kaggle Datasets", desc: "100K+ public datasets for ML/research", icon: "database", url: "https://www.kaggle.com/datasets", color: "#20BEFF" },
  { name: "UCI ML Repository", desc: "Classic benchmark datasets", icon: "archive-outline", url: "https://archive.ics.uci.edu/", color: "#EA580C" },
  { name: "Google Dataset Search", desc: "Search across dataset repositories", icon: "google", url: "https://datasetsearch.research.google.com/", color: "#4285F4" },
  { name: "Hugging Face Datasets", desc: "NLP & AI datasets", icon: "robot-outline", url: "https://huggingface.co/datasets", color: "#FFD21E" },
  { name: "World Bank Open Data", desc: "Economic & development data", icon: "earth", url: "https://data.worldbank.org/", color: "#009FDA" },
  { name: "NASA Open Data", desc: "Space & Earth science data", icon: "space-station", url: "https://data.nasa.gov/", color: "#0B3D91" },
];

const RESEARCH_TOOLS = [
  { name: "Google Scholar", icon: "magnify", url: "https://scholar.google.com", color: "#4285F4", desc: "Search scholarly literature" },
  { name: "arXiv", icon: "file-document-outline", url: "https://arxiv.org", color: "#B31B1B", desc: "Preprints in CS, Physics, Math" },
  { name: "ResearchGate", icon: "account-group-outline", url: "https://www.researchgate.net", color: "#00CCBB", desc: "Academic networking" },
  { name: "IEEE Xplore", icon: "lightning-bolt", url: "https://ieeexplore.ieee.org", color: "#0065BD", desc: "Engineering & tech journals" },
  { name: "PubMed", icon: "heart-pulse", url: "https://pubmed.ncbi.nlm.nih.gov", color: "#336699", desc: "Biomedical research" },
  { name: "Zotero", icon: "bookmark-multiple-outline", url: "https://www.zotero.org", color: "#CC2936", desc: "Reference management" },
  { name: "Overleaf", icon: "text-box-outline", url: "https://www.overleaf.com", color: "#47A141", desc: "LaTeX collaborative editor" },
  { name: "Mendeley", icon: "library-shelves", url: "https://www.mendeley.com", color: "#9D1620", desc: "Reference manager & PDF reader" },
];

const OPPORTUNITIES = [
  { name: "NSF Grants", desc: "National Science Foundation funding", icon: "currency-usd", url: "https://www.nsf.gov/funding/", color: "#003087" },
  { name: "IEEE Student Contests", desc: "Engineering competitions worldwide", icon: "trophy-outline", url: "https://www.ieee.org/membership/students/competitions-and-contests.html", color: "#0065BD" },
  { name: "Google Summer of Code", desc: "Open source research internships", icon: "google", url: "https://summerofcode.withgoogle.com/", color: "#FBBC04" },
  { name: "AAAI Student Programs", desc: "AI research conferences & grants", icon: "brain", url: "https://aaai.org/about-aaai/programs/", color: "#00A99D" },
  { name: "Research Internships DB", desc: "Curated international internships", icon: "briefcase-outline", url: "https://www.research-internships.de/", color: "#6366F1" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ResearchHub() {
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [librarySection, setLibrarySection] = useState<LibrarySection>("saved");

  // Papers tab state
  const [paperQuery, setPaperQuery] = useState("");
  const [paperField, setPaperField] = useState("All Fields");
  const [paperYearFilter, setPaperYearFilter] = useState("");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);

  // Projects tab state (preserved from original)
  const [projectsTab, setProjectsTab] = useState<"projects" | "calls" | "people" | "desk">("projects");
  const [selectedDiscipline, setSelectedDiscipline] = useState("All");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAreas, setNewAreas] = useState<string[]>(["AI / Machine Learning"]);
  const [newMethods, setNewMethods] = useState("");
  const [lookingForCollabs, setLookingForCollabs] = useState(true);
  const [collabRequirements, setCollabRequirements] = useState("");
  const [selectedProjectForCollab, setSelectedProjectForCollab] = useState<ResearchProject | null>(null);
  const [collabMessage, setCollabMessage] = useState("");

  // Library modal states
  const [showNewCollectionModal, setShowNewCollectionModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");

  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");

  // ─── Queries ───────────────────────────────────────────────────────────────

  const statsQuery = useQuery({
    queryKey: ["research-stats"],
    queryFn: () => api<{ totalProjects: number; openCalls: number; completedProjects: number }>("/research/stats"),
  });

  const trendingQuery = useQuery({
    queryKey: ["research-trending"],
    queryFn: () => api<{ topics: TrendingSection[]; allTopics: string[] }>("/research/trending"),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "home",
  });

  const paperSearchQuery = useQuery({
    queryKey: ["paper-search", paperQuery, paperField, paperYearFilter, openAccessOnly],
    queryFn: () =>
      api<{ total: number; data: SSPaper[] }>(
        `/research/papers/search?${qs({
          q: paperQuery,
          field: paperField === "All Fields" ? "" : paperField,
          year: paperYearFilter,
          openAccess: openAccessOnly,
        })}`,
      ),
    enabled: searchSubmitted && paperQuery.trim().length >= 2,
    staleTime: 2 * 60 * 1000,
  });

  const savedPapersQuery = useQuery({
    queryKey: ["saved-papers"],
    queryFn: () => api<{ data: SavedPaper[] }>("/research/saved-papers"),
    enabled: activeTab === "library",
  });

  const collectionsQuery = useQuery({
    queryKey: ["research-collections"],
    queryFn: () => api<{ data: ResearchCollection[] }>("/research/collections"),
    enabled: activeTab === "library",
  });

  const notesQuery = useQuery({
    queryKey: ["research-notes"],
    queryFn: () => api<{ data: ResearchNote[] }>("/research/notes"),
    enabled: activeTab === "library",
  });

  const historyQuery = useQuery({
    queryKey: ["reading-history"],
    queryFn: () => api<{ data: ReadingHistoryEntry[] }>("/research/reading-history"),
    enabled: activeTab === "library" && librarySection === "history",
  });

  // Projects queries (preserved)
  const projectsQuery = useQuery({
    queryKey: ["research-projects", selectedDiscipline, projectSearchQuery, projectsTab],
    queryFn: () => {
      const areaParam = selectedDiscipline === "All" ? "" : selectedDiscipline;
      const openParam = projectsTab === "calls" ? "true" : "false";
      return api<{ data: ResearchProject[] }>(
        `/research/projects?${qs({ area: areaParam, q: projectSearchQuery, openOnly: openParam })}`,
      );
    },
    enabled: activeTab === "projects" && (projectsTab === "projects" || projectsTab === "calls"),
  });

  const peopleQuery = useQuery({
    queryKey: ["research-people", projectSearchQuery],
    queryFn: () =>
      api<{ people: Profile[]; topics: string[] }>(`/recommendations/research?${qs({ interest: projectSearchQuery })}`),
    enabled: activeTab === "projects" && projectsTab === "people",
  });

  const requestsQuery = useQuery({
    queryKey: ["research-requests"],
    queryFn: () => api<{ data: any[] }>("/research/collaboration-requests"),
    enabled: activeTab === "projects" && projectsTab === "desk",
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const createProject = useMutation({
    mutationFn: () =>
      api("/research/projects", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          research_areas: newAreas,
          methods: newMethods.split(",").map((s) => s.trim()).filter(Boolean),
          looking_for_collaborators: lookingForCollabs,
          collaboration_requirements: collabRequirements.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-projects"] });
      qc.invalidateQueries({ queryKey: ["research-stats"] });
      setShowCreateModal(false);
      setNewTitle(""); setNewDesc(""); setCollabRequirements("");
      Alert.alert("Project Published! 🔬", "Your research project is now indexed in the Campus Research Hub.");
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const sendCollabRequest = useMutation({
    mutationFn: () =>
      api(`/research/projects/${selectedProjectForCollab?.id}/collaborate`, {
        method: "POST",
        body: JSON.stringify({ message: collabMessage.trim() || "I would like to collaborate on this research project." }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-requests"] });
      setSelectedProjectForCollab(null);
      setCollabMessage("");
      Alert.alert("Proposal Sent! 🚀", "The lead researcher will review your collaboration request.");
    },
    onError: (e: any) => Alert.alert("Could not send request", e.message),
  });

  const updateRequestStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" | "cancelled" }) =>
      api(`/research/collaboration-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => { triggerHaptic(); qc.invalidateQueries({ queryKey: ["research-requests"] }); },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api(`/research/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-projects"] });
      qc.invalidateQueries({ queryKey: ["research-stats"] });
    },
  });

  const createCollection = useMutation({
    mutationFn: () =>
      api("/research/collections", {
        method: "POST",
        body: JSON.stringify({ name: newColName.trim(), description: newColDesc.trim() || undefined }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-collections"] });
      setShowNewCollectionModal(false);
      setNewColName(""); setNewColDesc("");
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const deleteCollection = useMutation({
    mutationFn: (id: string) => api(`/research/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => { triggerHaptic(); qc.invalidateQueries({ queryKey: ["research-collections"] }); },
  });

  const createNote = useMutation({
    mutationFn: () =>
      api("/research/notes", {
        method: "POST",
        body: JSON.stringify({ title: newNoteTitle.trim(), body: newNoteBody.trim() }),
      }),
    onSuccess: (data: any) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-notes"] });
      setShowNewNoteModal(false);
      setNewNoteTitle(""); setNewNoteBody("");
      router.push(`/research/note/${data.id}` as any);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => api(`/research/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => { triggerHaptic(); qc.invalidateQueries({ queryKey: ["research-notes"] }); },
  });

  const unsavePaper = useMutation({
    mutationFn: (paperId: string) =>
      api(`/research/saved-papers/${encodeURIComponent(paperId)}`, { method: "DELETE" }),
    onSuccess: () => { triggerHaptic(); qc.invalidateQueries({ queryKey: ["saved-papers"] }); },
  });

  const toggleArea = (area: string) => {
    triggerHaptic();
    setNewAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  };

  const savedPaperIds = new Set((savedPapersQuery.data?.data ?? []).map((s) => s.paper_id));

  // ─── Tab Selector ──────────────────────────────────────────────────────────

  const TabBar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.tabBarContent}
      style={s.tabBar}
    >
      {MAIN_TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => { triggerHaptic(); setActiveTab(t.key); }}
            style={[s.tabBtn, { backgroundColor: active ? colors.primary : colors.surface2, borderColor: active ? colors.primary : colors.border }]}
          >
            <MaterialCommunityIcons
              name={t.icon as any}
              size={14}
              color={active ? colors.white : colors.muted}
            />
            <Text style={[s.tabLabel, { color: active ? colors.white : colors.text }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ─── HOME TAB ─────────────────────────────────────────────────────────────

  const HomeTab = () => (
    <View style={{ gap: 20 }}>
      {/* Hero search card */}
      <Animated.View entering={FadeInDown.springify()}>
        <View style={[s.heroCard, { backgroundColor: colors.primary }]}>
          <Text style={[s.heroTitle, { color: colors.white }]}>Research Hub 🔬</Text>
          <Text style={[s.heroSubtitle, { color: `${colors.white}CC` }]}>
            Search 200M+ academic papers, manage your library, and collaborate with campus researchers.
          </Text>
          <Pressable
            onPress={() => { triggerHaptic(); setActiveTab("papers"); }}
            style={[s.heroSearchBtn, { backgroundColor: `${colors.white}20`, borderColor: `${colors.white}40` }]}
          >
            <MaterialCommunityIcons name="magnify" size={18} color={colors.white} />
            <Text style={[s.heroSearchText, { color: `${colors.white}CC` }]}>Search papers, authors, topics...</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Quick Stats */}
      <View style={[s.statStrip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: colors.primary }]}>{statsQuery.data?.totalProjects ?? "—"}</Text>
          <Text style={[s.statLabel, { color: colors.muted }]}>Active Projects</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: colors.accent }]}>{statsQuery.data?.openCalls ?? "—"}</Text>
          <Text style={[s.statLabel, { color: colors.muted }]}>Open Co-Author Calls</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: colors.success }]}>{savedPapersQuery.data?.data?.length ?? "—"}</Text>
          <Text style={[s.statLabel, { color: colors.muted }]}>Saved Papers</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={{ gap: 10 }}>
        <H2>Quick Actions</H2>
        <View style={s.quickActions}>
          {[
            { icon: "text-search", label: "Search Papers", color: colors.primary, action: () => setActiveTab("papers") },
            { icon: "bookshelf", label: "My Library", color: colors.accent, action: () => setActiveTab("library") },
            { icon: "flask-outline", label: "My Projects", color: colors.success, action: () => setActiveTab("projects") },
            { icon: "note-plus-outline", label: "New Note", color: colors.warning, action: () => { setActiveTab("library"); setLibrarySection("notes"); setShowNewNoteModal(true); } },
            { icon: "account-group-outline", label: "Find Collaborators", color: colors.info, action: () => { setActiveTab("projects"); setProjectsTab("calls"); } },
            { icon: "compass-outline", label: "Discover", color: colors.primary2, action: () => setActiveTab("discover") },
          ].map((item, idx) => (
            <Pressable
              key={item.label}
              onPress={() => { triggerHaptic(); item.action(); }}
              style={[s.quickActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[s.quickActionIcon, { backgroundColor: `${item.color}18` }]}>
                <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={[s.quickActionLabel, { color: colors.text }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Trending This Week */}
      <View style={{ gap: 12 }}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <H2>🔥 Trending Research</H2>
          <Pressable onPress={() => { triggerHaptic(); setActiveTab("discover"); }}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>See all</Text>
          </Pressable>
        </Row>

        {trendingQuery.isLoading ? (
          <>
            <Skeleton height={220} />
            <Skeleton height={220} />
          </>
        ) : trendingQuery.isError ? (
          <ErrorState detail="Could not load trending papers" onRetry={() => trendingQuery.refetch()} />
        ) : (
          trendingQuery.data?.topics.slice(0, 3).map((section, sIdx) => (
            <Animated.View key={section.topic} entering={FadeInUp.delay(sIdx * 80).springify()}>
              <View style={[s.trendingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <View style={[s.topicDot, { backgroundColor: colors.primary }]} />
                  <Text style={[s.trendingSectionTitle, { color: colors.text }]}>{section.topic}</Text>
                </Row>
                {section.papers.slice(0, 2).map((paper, pIdx) => (
                  <PaperCard
                    key={paper.paperId}
                    paper={paper}
                    index={pIdx}
                    compact
                    isSaved={savedPaperIds.has(paper.paperId)}
                  />
                ))}
              </View>
            </Animated.View>
          ))
        )}
      </View>

      {/* Recently read */}
      {historyQuery.data?.data && historyQuery.data.data.length > 0 && (
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <H2>📖 Recently Read</H2>
            <Pressable onPress={() => { setActiveTab("library"); setLibrarySection("history"); }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>See all</Text>
            </Pressable>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
            {historyQuery.data.data.slice(0, 6).map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push(`/research/paper/${encodeURIComponent(entry.paper_id)}` as any)}
                style={[s.historyChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="book-open-outline" size={14} color={colors.primary} />
                <Text style={[s.historyChipText, { color: colors.text }]} numberOfLines={2}>{entry.paper_title}</Text>
                {entry.paper_year ? <Text style={[s.historyChipYear, { color: colors.muted }]}>{entry.paper_year}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // ─── PAPERS TAB ───────────────────────────────────────────────────────────

  const PapersTab = () => (
    <View style={{ gap: 14 }}>
      {/* Search bar */}
      <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} style={{ marginLeft: 12 }} />
        <TextInput
          value={paperQuery}
          onChangeText={setPaperQuery}
          placeholder="Search papers, authors, topics..."
          placeholderTextColor={colors.muted}
          style={[s.searchInput, { color: colors.text }]}
          returnKeyType="search"
          onSubmitEditing={() => { setSearchSubmitted(true); }}
        />
        {paperQuery.length > 0 && (
          <Pressable onPress={() => { setPaperQuery(""); setSearchSubmitted(false); }} style={{ padding: 10 }}>
            <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        )}
        <Pressable
          onPress={() => { if (paperQuery.trim().length >= 2) { triggerHaptic(); setSearchSubmitted(true); } }}
          style={[s.searchBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: colors.white, fontWeight: "800", fontSize: 13 }}>Search</Text>
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {/* Field filter */}
        {RESEARCH_FIELDS.map((f) => {
          const active = paperField === f;
          return (
            <Pressable
              key={f}
              onPress={() => { triggerHaptic(); setPaperField(f); }}
              style={[s.filterChip, { backgroundColor: active ? colors.primary : colors.surface2, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[s.filterChipText, { color: active ? colors.white : colors.text }]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Extra filters row */}
      <Row style={{ gap: 8, alignItems: "center" }}>
        <Pressable
          onPress={() => { triggerHaptic(); setOpenAccessOnly(!openAccessOnly); }}
          style={[s.filterToggle, { backgroundColor: openAccessOnly ? `${colors.success}18` : colors.surface2, borderColor: openAccessOnly ? colors.success : colors.border }]}
        >
          <MaterialCommunityIcons name={openAccessOnly ? "lock-open" : "lock-open-outline"} size={14} color={openAccessOnly ? colors.success : colors.muted} />
          <Text style={[s.filterToggleText, { color: openAccessOnly ? colors.success : colors.text }]}>Open Access</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const years = ["", "2024", "2023", "2022", "2021", "2020-2024"];
            const currentIndex = years.indexOf(paperYearFilter);
            const next = years[(currentIndex + 1) % years.length];
            setPaperYearFilter(next);
          }}
          style={[s.filterToggle, { backgroundColor: paperYearFilter ? `${colors.info}18` : colors.surface2, borderColor: paperYearFilter ? colors.info : colors.border }]}
        >
          <MaterialCommunityIcons name="calendar-range" size={14} color={paperYearFilter ? colors.info : colors.muted} />
          <Text style={[s.filterToggleText, { color: paperYearFilter ? colors.info : colors.text }]}>
            {paperYearFilter || "Any Year"}
          </Text>
        </Pressable>
      </Row>

      {/* Results */}
      {!searchSubmitted ? (
        <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
          <MaterialCommunityIcons name="text-search" size={56} color={`${colors.primary}40`} />
          <H3 style={{ color: colors.muted, textAlign: "center" }}>Search 200M+ Academic Papers</H3>
          <Muted style={{ textAlign: "center", maxWidth: 260 }}>
            Type a topic, author name, or keyword and press Search
          </Muted>
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>Try searching:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {["deep learning", "climate change", "CRISPR", "quantum computing", "neural networks"].map((q) => (
                <Pressable
                  key={q}
                  onPress={() => { triggerHaptic(); setPaperQuery(q); setSearchSubmitted(true); }}
                  style={[s.suggestedQuery, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : paperSearchQuery.isLoading ? (
        <>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={140} style={{ marginBottom: 10 }} />)}</>
      ) : paperSearchQuery.isError ? (
        <ErrorState detail={(paperSearchQuery.error as Error).message} onRetry={() => paperSearchQuery.refetch()} />
      ) : paperSearchQuery.data?.data?.length === 0 ? (
        <Empty icon="text-search" title="No papers found" detail="Try a different keyword, remove filters, or check spelling." />
      ) : (
        <View>
          <Text style={[s.resultsCount, { color: colors.muted }]}>
            About {paperSearchQuery.data?.total?.toLocaleString()} results
          </Text>
          {paperSearchQuery.data?.data?.map((paper, idx) => (
            <PaperCard
              key={paper.paperId}
              paper={paper}
              index={idx}
              isSaved={savedPaperIds.has(paper.paperId)}
            />
          ))}
        </View>
      )}
    </View>
  );

  // ─── LIBRARY TAB ──────────────────────────────────────────────────────────

  const LibraryTab = () => (
    <View style={{ gap: 16 }}>
      {/* Library sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {([
          { key: "saved", icon: "bookmark-outline", label: "Saved Papers" },
          { key: "collections", icon: "folder-multiple-outline", label: "Collections" },
          { key: "notes", icon: "note-text-outline", label: "My Notes" },
          { key: "history", icon: "history", label: "History" },
        ] as { key: LibrarySection; icon: string; label: string }[]).map((sec) => {
          const active = librarySection === sec.key;
          return (
            <Pressable
              key={sec.key}
              onPress={() => { triggerHaptic(); setLibrarySection(sec.key); }}
              style={[s.libTab, { backgroundColor: active ? `${colors.primary}18` : colors.surface2, borderColor: active ? colors.primary : colors.border }]}
            >
              <MaterialCommunityIcons name={sec.icon as any} size={14} color={active ? colors.primary : colors.muted} />
              <Text style={[s.libTabText, { color: active ? colors.primary : colors.text, fontWeight: active ? "800" : "600" }]}>{sec.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Saved Papers */}
      {librarySection === "saved" && (
        <View style={{ gap: 10 }}>
          {savedPapersQuery.isLoading ? (
            <>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={130} />)}</>
          ) : savedPapersQuery.data?.data?.length === 0 ? (
            <Empty
              icon="bookmark-outline"
              title="No saved papers yet"
              detail="Tap the bookmark icon on any paper to save it here for offline reference."
              actionTitle="Search Papers"
              onAction={() => setActiveTab("papers")}
            />
          ) : (
            savedPapersQuery.data?.data?.map((sp, idx) => (
              <Animated.View key={sp.id} entering={FadeInUp.delay(idx * 50).springify()}>
                <View style={[s.savedItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Pressable onPress={() => router.push(`/research/paper/${encodeURIComponent(sp.paper_id)}` as any)} style={{ flex: 1 }}>
                    <Text style={[s.savedTitle, { color: colors.text }]} numberOfLines={2}>
                      {sp.paper_data.title}
                    </Text>
                    <Text style={[s.savedMeta, { color: colors.muted }]} numberOfLines={1}>
                      {sp.paper_data.authors?.slice(0, 2).map((a: any) => a.name).join(", ")}
                      {sp.paper_data.year ? ` · ${sp.paper_data.year}` : ""}
                    </Text>
                    <Row style={{ marginTop: 6, gap: 6 }}>
                      {sp.paper_data.isOpenAccess ? <Pill tone="success">Open Access</Pill> : null}
                      {sp.paper_data.fieldsOfStudy?.[0] ? <Pill tone="primary">{sp.paper_data.fieldsOfStudy[0]}</Pill> : null}
                    </Row>
                  </Pressable>
                  <Pressable
                    onPress={() => unsavePaper.mutate(sp.paper_id)}
                    hitSlop={10}
                    style={{ padding: 8 }}
                  >
                    <MaterialCommunityIcons name="bookmark-remove-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              </Animated.View>
            ))
          )}
        </View>
      )}

      {/* Collections */}
      {librarySection === "collections" && (
        <View style={{ gap: 10 }}>
          <Button title="+ New Collection" onPress={() => setShowNewCollectionModal(true)} compact icon="folder-plus-outline" />
          {collectionsQuery.isLoading ? (
            <>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={90} />)}</>
          ) : collectionsQuery.data?.data?.length === 0 ? (
            <Empty
              icon="folder-multiple-outline"
              title="No collections yet"
              detail="Create collections to organise your saved papers by topic or project."
            />
          ) : (
            collectionsQuery.data?.data?.map((col, idx) => (
              <Animated.View key={col.id} entering={FadeInUp.delay(idx * 60).springify()}>
                <Card
                  onPress={() => router.push(`/research/collection/${col.id}` as any)}
                  style={{ gap: 4 }}
                >
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Row style={{ alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[s.collectionIcon, { backgroundColor: `${colors.accent}18` }]}>
                        <MaterialCommunityIcons name="folder-outline" size={18} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.collectionName, { color: colors.text }]}>{col.name}</Text>
                        {col.description ? <Muted style={{ fontSize: 12 }}>{col.description}</Muted> : null}
                      </View>
                    </Row>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <Text style={[s.collectionCount, { color: colors.muted }]}>
                        {(col.papers as any)?.[0]?.count ?? 0} papers
                      </Text>
                      <Pressable
                        onPress={() =>
                          Alert.alert("Delete Collection", `Delete "${col.name}"?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteCollection.mutate(col.id) },
                          ])
                        }
                        hitSlop={8}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.muted} />
                      </Pressable>
                    </Row>
                  </Row>
                </Card>
              </Animated.View>
            ))
          )}
        </View>
      )}

      {/* Notes */}
      {librarySection === "notes" && (
        <View style={{ gap: 10 }}>
          <Button title="+ New Note" onPress={() => setShowNewNoteModal(true)} compact icon="note-plus-outline" />
          {notesQuery.isLoading ? (
            <>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={100} />)}</>
          ) : notesQuery.data?.data?.length === 0 ? (
            <Empty
              icon="note-text-outline"
              title="No research notes yet"
              detail="Jot down ideas, key findings, and insights while reading papers."
            />
          ) : (
            notesQuery.data?.data?.map((note, idx) => (
              <Animated.View key={note.id} entering={FadeInUp.delay(idx * 50).springify()}>
                <Pressable
                  onPress={() => router.push(`/research/note/${note.id}` as any)}
                  style={[s.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[s.noteTitle, { color: colors.text }]} numberOfLines={1}>
                        {note.title || "Untitled Note"}
                      </Text>
                      {note.paper_title ? (
                        <Row style={{ alignItems: "center", gap: 4 }}>
                          <MaterialCommunityIcons name="file-document-outline" size={12} color={colors.primary} />
                          <Text style={[s.noteLinked, { color: colors.primary }]} numberOfLines={1}>{note.paper_title}</Text>
                        </Row>
                      ) : null}
                      {note.body ? (
                        <Text style={[s.notePreview, { color: colors.muted }]} numberOfLines={2}>{note.body}</Text>
                      ) : null}
                      {note.tags.length > 0 ? (
                        <Row style={{ gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                          {note.tags.slice(0, 3).map((tag) => <Pill key={tag} tone="accent">#{tag}</Pill>)}
                        </Row>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() =>
                        Alert.alert("Delete Note", "Delete this note permanently?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteNote.mutate(note.id) },
                        ])
                      }
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.muted} />
                    </Pressable>
                  </Row>
                  <Text style={[s.noteDate, { color: colors.muted }]}>
                    {new Date(note.updated_at).toLocaleDateString()}
                  </Text>
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>
      )}

      {/* Reading History */}
      {librarySection === "history" && (
        <View style={{ gap: 10 }}>
          {historyQuery.isLoading ? (
            <>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={70} />)}</>
          ) : historyQuery.data?.data?.length === 0 ? (
            <Empty
              icon="history"
              title="No reading history"
              detail="Papers you open will appear here so you can pick up where you left off."
            />
          ) : (
            historyQuery.data?.data?.map((entry, idx) => (
              <Animated.View key={entry.id} entering={FadeInUp.delay(idx * 40).springify()}>
                <Pressable
                  onPress={() => router.push(`/research/paper/${encodeURIComponent(entry.paper_id)}` as any)}
                  style={[s.historyItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="book-open-outline" size={18} color={colors.primary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.historyTitle, { color: colors.text }]} numberOfLines={2}>{entry.paper_title}</Text>
                    <Row style={{ gap: 8 }}>
                      {entry.paper_year ? <Text style={[s.historyMeta, { color: colors.muted }]}>{entry.paper_year}</Text> : null}
                      {entry.paper_authors.length > 0 ? (
                        <Text style={[s.historyMeta, { color: colors.muted }]} numberOfLines={1}>
                          {entry.paper_authors.slice(0, 2).join(", ")}
                        </Text>
                      ) : null}
                    </Row>
                  </View>
                  <Text style={[s.historyDate, { color: colors.muted }]}>
                    {new Date(entry.read_at).toLocaleDateString()}
                  </Text>
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>
      )}
    </View>
  );

  // ─── PROJECTS TAB (preserved from original) ───────────────────────────────

  const ProjectsTab = () => (
    <View style={{ gap: 12 }}>
      {/* Header */}
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <H2>Research & Innovation Hub 🔬</H2>
          <Muted>Collaborate with campus scholars, publish preprints, and join funded research projects.</Muted>
        </View>
        <Button title="+ New" compact icon="plus" onPress={() => { triggerHaptic(); setShowCreateModal(true); }} />
      </Row>

      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[
          { key: "projects", label: "📚 All Projects" },
          { key: "calls", label: "🤝 Co-Author Calls" },
          { key: "people", label: "👥 Scholars" },
          { key: "desk", label: "📬 Collab Desk" },
        ].map((t) => {
          const active = projectsTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { triggerHaptic(); setProjectsTab(t.key as any); }}
              style={[s.tabBtn, { backgroundColor: active ? colors.primary : colors.surface2, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[s.tabLabel, { color: active ? colors.white : colors.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Discipline filter for projects/calls */}
      {(projectsTab === "projects" || projectsTab === "calls") && (
        <View style={{ gap: 8 }}>
          <Field placeholder="Search projects, topics..." value={projectSearchQuery} onChangeText={setProjectSearchQuery} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            {RESEARCH_DISCIPLINES.map((d) => {
              const selected = selectedDiscipline === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => { triggerHaptic(); setSelectedDiscipline(d); }}
                  style={[s.filterChip, { backgroundColor: selected ? colors.primary : colors.surface2, borderColor: selected ? colors.primary : colors.border }]}
                >
                  <Text style={[s.filterChipText, { color: selected ? colors.white : colors.text, fontWeight: selected ? "800" : "600" }]}>{d}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Projects / Calls list */}
      {(projectsTab === "projects" || projectsTab === "calls") && (
        <View style={{ gap: 12 }}>
          {projectsQuery.isLoading ? <><Skeleton height={140} /><Skeleton height={140} /></> : null}
          {projectsQuery.isError ? (
            <ErrorState detail={(projectsQuery.error as Error).message} onRetry={() => projectsQuery.refetch()} />
          ) : null}
          {projectsQuery.data?.data?.map((p, idx) => {
            const isMyProject = p.owner_id === session?.user.id || p.owner?.id === session?.user.id;
            return (
              <Animated.View key={p.id} entering={FadeInUp.delay(idx * 70).springify()}>
                <Card
                  tone={p.looking_for_collaborators ? "glow" : "soft"}
                  onPress={() => router.push(`/research/${p.id}` as any)}
                >
                  <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Row style={{ alignItems: "center", flex: 1 }}>
                      {p.owner?.avatar_url ? (
                        <Image source={{ uri: p.owner.avatar_url }} style={s.authorAvatar} />
                      ) : (
                        <View style={[s.authorAvatar, { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }]}>
                          <Text style={{ color: colors.primary, fontWeight: "800" }}>{p.owner?.full_name?.[0] || "U"}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>{p.owner?.full_name || "Lead Researcher"}</Text>
                        <Muted style={{ fontSize: 11 }}>{p.owner?.university ? `${p.owner.university} · ` : ""}{p.owner?.department || "Academic Scholar"}</Muted>
                      </View>
                    </Row>
                    <Pill tone={p.status === "completed" ? "success" : "primary"}>{p.status.toUpperCase()}</Pill>
                  </Row>
                  <Text style={[s.projectTitle, { color: colors.text }]}>{p.title}</Text>
                  {p.description ? <Muted numberOfLines={2}>{p.description}</Muted> : null}
                  {p.research_areas?.length ? (
                    <Row style={{ marginTop: 4, flexWrap: "wrap" }}>
                      {p.research_areas.map((area) => <Pill key={area} tone="accent">{area}</Pill>)}
                    </Row>
                  ) : null}
                  {p.looking_for_collaborators && (
                    <View style={[s.collabBox, { backgroundColor: colors.surface2, borderColor: colors.primary }]}>
                      <Row style={{ alignItems: "center" }}>
                        <MaterialCommunityIcons name="bullhorn-outline" size={15} color={colors.primary} />
                        <Text style={[s.collabTitle, { color: colors.primary }]}>RECRUITING CO-AUTHORS / TEAM</Text>
                      </Row>
                      {p.collaboration_requirements ? <Muted style={{ fontSize: 12 }}>{p.collaboration_requirements}</Muted> : null}
                    </View>
                  )}
                  <Row style={{ justifyContent: "flex-end", marginTop: 6 }}>
                    {isMyProject ? (
                      <Button
                        title="Delete"
                        variant="ghost"
                        compact
                        onPress={() =>
                          Alert.alert("Delete project", "Remove this research project?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteProject.mutate(p.id) },
                          ])
                        }
                      />
                    ) : (
                      <Button
                        title="🤝 Request Collaboration"
                        compact
                        variant="primary"
                        onPress={() => { triggerHaptic(); setSelectedProjectForCollab(p); }}
                      />
                    )}
                  </Row>
                </Card>
              </Animated.View>
            );
          })}
          {projectsQuery.data?.data?.length === 0 && !projectsQuery.isLoading ? (
            <Empty icon="flask-outline" title="No research projects found" detail="Be the first scholar to publish a project in this discipline!" />
          ) : null}
        </View>
      )}

      {/* Scholars tab */}
      {projectsTab === "people" && (
        <View style={{ gap: 12 }}>
          <Field placeholder="Filter scholars by topic, skills..." value={projectSearchQuery} onChangeText={setProjectSearchQuery} />
          {peopleQuery.isLoading ? <Skeleton height={140} /> : null}
          {peopleQuery.data?.topics?.length ? (
            <Row style={{ flexWrap: "wrap" }}>
              {peopleQuery.data.topics.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}
            </Row>
          ) : null}
          {peopleQuery.data?.people?.map((p, idx) => (
            <Animated.View key={p.id} entering={FadeInUp.delay(idx * 60).springify()}>
              <ProfileCard profile={p} />
            </Animated.View>
          ))}
          {peopleQuery.data?.people?.length === 0 && !peopleQuery.isLoading ? (
            <Empty title="No scholars found" detail="Try searching with a broader topic name or department." />
          ) : null}
        </View>
      )}

      {/* Collab Desk */}
      {projectsTab === "desk" && (
        <View style={{ gap: 12 }}>
          {requestsQuery.isLoading ? <><Skeleton height={100} /><Skeleton height={100} /></> : null}
          {requestsQuery.data?.data?.map((req, idx) => {
            const isOwner = req.project?.owner_id === session?.user.id;
            return (
              <Animated.View key={req.id} entering={FadeInUp.delay(idx * 60).springify()}>
                <Card>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[s.projectTitle, { color: colors.text, fontSize: 15 }]}>{req.project?.title || "Research Project"}</Text>
                    <Pill tone={req.status === "accepted" ? "success" : req.status === "rejected" ? "danger" : "accent"}>
                      {req.status.toUpperCase()}
                    </Pill>
                  </Row>
                  <Muted>Requester: <Text style={{ color: colors.text, fontWeight: "700" }}>{req.requester?.full_name}</Text> (@{req.requester?.username})</Muted>
                  {req.message ? <Text style={{ color: colors.text, marginTop: 4 }}>"{req.message}"</Text> : null}
                  {req.status === "pending" && isOwner && (
                    <Row style={{ marginTop: 8 }}>
                      <Button title="Accept" compact onPress={() => updateRequestStatus.mutate({ id: req.id, status: "accepted" })} />
                      <Button title="Decline" compact variant="secondary" onPress={() => updateRequestStatus.mutate({ id: req.id, status: "rejected" })} />
                    </Row>
                  )}
                  {req.status === "pending" && !isOwner && (
                    <Button title="Cancel Request" compact variant="ghost" onPress={() => updateRequestStatus.mutate({ id: req.id, status: "cancelled" })} />
                  )}
                </Card>
              </Animated.View>
            );
          })}
          {requestsQuery.data?.data?.length === 0 && !requestsQuery.isLoading ? (
            <Empty title="No collaboration requests" detail="Incoming and outgoing collaboration proposals will appear here." />
          ) : null}
        </View>
      )}
    </View>
  );

  // ─── DISCOVER TAB ─────────────────────────────────────────────────────────

  const DiscoverTab = () => (
    <View style={{ gap: 24 }}>
      {/* Trending Topics grid */}
      <View style={{ gap: 12 }}>
        <H2>🌐 Research Topics</H2>
        <View style={s.topicsGrid}>
          {(trendingQuery.data?.allTopics ?? []).map((topic, idx) => {
            const colors2 = [
              colors.primary, colors.accent, colors.success, colors.warning,
              colors.info, colors.primary2, colors.danger, colors.primary,
              colors.accent, colors.success,
            ];
            const c = colors2[idx % colors2.length];
            return (
              <Pressable
                key={topic}
                onPress={() => {
                  triggerHaptic();
                  setPaperQuery(topic.split(" & ")[0]);
                  setSearchSubmitted(true);
                  setActiveTab("papers");
                }}
                style={[s.topicCard, { backgroundColor: `${c}12`, borderColor: `${c}25` }]}
              >
                <MaterialCommunityIcons name="atom" size={18} color={c} />
                <Text style={[s.topicCardText, { color: colors.text }]} numberOfLines={2}>{topic}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Research Toolkit */}
      <View style={{ gap: 12 }}>
        <H2>🛠️ Research Toolkit</H2>
        <View style={s.toolsGrid}>
          {RESEARCH_TOOLS.map((tool, idx) => (
            <Animated.View key={tool.name} entering={FadeInUp.delay(idx * 40).springify()} style={{ width: "48%" }}>
              <Pressable
                style={[s.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => triggerHaptic()}
              >
                <View style={[s.toolIcon, { backgroundColor: `${tool.color}18` }]}>
                  <MaterialCommunityIcons name={tool.icon as any} size={22} color={tool.color} />
                </View>
                <Text style={[s.toolName, { color: colors.text }]}>{tool.name}</Text>
                <Text style={[s.toolDesc, { color: colors.muted }]} numberOfLines={2}>{tool.desc}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* Datasets */}
      <View style={{ gap: 12 }}>
        <H2>📊 Open Datasets</H2>
        {DATASETS.map((ds, idx) => (
          <Animated.View key={ds.name} entering={FadeInUp.delay(idx * 50).springify()}>
            <Pressable
              style={[s.datasetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => triggerHaptic()}
            >
              <View style={[s.datasetIcon, { backgroundColor: `${ds.color}18` }]}>
                <MaterialCommunityIcons name={ds.icon as any} size={20} color={ds.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.datasetName, { color: colors.text }]}>{ds.name}</Text>
                <Text style={[s.datasetDesc, { color: colors.muted }]} numberOfLines={1}>{ds.desc}</Text>
              </View>
              <MaterialCommunityIcons name="open-in-new" size={16} color={colors.muted} />
            </Pressable>
          </Animated.View>
        ))}
      </View>

      {/* Opportunities */}
      <View style={{ gap: 12 }}>
        <H2>🎯 Funding & Opportunities</H2>
        {OPPORTUNITIES.map((opp, idx) => (
          <Animated.View key={opp.name} entering={FadeInUp.delay(idx * 60).springify()}>
            <Pressable
              style={[s.datasetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => triggerHaptic()}
            >
              <View style={[s.datasetIcon, { backgroundColor: `${opp.color}18` }]}>
                <MaterialCommunityIcons name={opp.icon as any} size={20} color={opp.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.datasetName, { color: colors.text }]}>{opp.name}</Text>
                <Text style={[s.datasetDesc, { color: colors.muted }]} numberOfLines={1}>{opp.desc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Screen>
      <View style={s.pageHeader}>
        <H1>Research Hub 🔬</H1>
        <Muted>Academic papers, projects, library & discovery</Muted>
      </View>

      <TabBar />

      <Animated.View key={activeTab} entering={FadeIn.duration(200)}>
        {activeTab === "home" && <HomeTab />}
        {activeTab === "papers" && <PapersTab />}
        {activeTab === "library" && <LibraryTab />}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "discover" && <DiscoverTab />}
      </Animated.View>

      {/* ── Create Project Modal ───────────────────────────────────────────── */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <H2>Publish Research Project 📑</H2>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10, paddingVertical: 8 }}>
                <Field placeholder="Project / Paper Title *" value={newTitle} onChangeText={setNewTitle} />
                <Field placeholder="Abstract / Objective description..." value={newDesc} onChangeText={setNewDesc} multiline numberOfLines={4} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, marginTop: 4 }}>Research Areas:</Text>
                <Row style={{ flexWrap: "wrap" }}>
                  {RESEARCH_DISCIPLINES.filter((d) => d !== "All").map((area) => {
                    const selected = newAreas.includes(area);
                    return (
                      <Pill key={area} tone={selected ? "primary" : "default"} onPress={() => toggleArea(area)}>
                        {selected ? `✓ ${area}` : `+ ${area}`}
                      </Pill>
                    );
                  })}
                </Row>
                <Field placeholder="Methodologies (e.g. PyTorch, LaTeX, Survey)" value={newMethods} onChangeText={setNewMethods} />
                <Pressable
                  onPress={() => { triggerHaptic(); setLookingForCollabs(!lookingForCollabs); }}
                  style={[s.collabToggle, { backgroundColor: colors.surface2, borderColor: lookingForCollabs ? colors.primary : colors.border }]}
                >
                  <MaterialCommunityIcons
                    name={lookingForCollabs ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={22}
                    color={lookingForCollabs ? colors.primary : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>Looking for Co-Authors / Research Assistants</Text>
                    <Muted style={{ fontSize: 11 }}>Display open call tag on project card</Muted>
                  </View>
                </Pressable>
                {lookingForCollabs && (
                  <Field
                    placeholder="Specific collaborator requirements..."
                    value={collabRequirements}
                    onChangeText={setCollabRequirements}
                    multiline
                    numberOfLines={3}
                  />
                )}
              </View>
            </ScrollView>
            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowCreateModal(false)} />
              <Button
                title={createProject.isPending ? "Publishing…" : "Publish Project 🚀"}
                disabled={createProject.isPending || !newTitle.trim()}
                loading={createProject.isPending}
                onPress={() => createProject.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>

      {/* ── Collaboration Request Modal ──────────────────────────────────────── */}
      <Modal visible={Boolean(selectedProjectForCollab)} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <H2>Request Collaboration 🤝</H2>
            <Muted numberOfLines={2}>Project: <Text style={{ color: colors.text, fontWeight: "700" }}>{selectedProjectForCollab?.title}</Text></Muted>
            <Field
              placeholder="Introduce your skills, background, and how you'd like to contribute..."
              value={collabMessage}
              onChangeText={setCollabMessage}
              multiline
              numberOfLines={4}
            />
            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button title="Cancel" variant="ghost" onPress={() => { setSelectedProjectForCollab(null); setCollabMessage(""); }} />
              <Button
                title={sendCollabRequest.isPending ? "Sending…" : "Send Proposal 🚀"}
                disabled={sendCollabRequest.isPending}
                loading={sendCollabRequest.isPending}
                onPress={() => sendCollabRequest.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>

      {/* ── New Collection Modal ──────────────────────────────────────────────── */}
      <Modal visible={showNewCollectionModal} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <H2>New Collection 📁</H2>
              <Pressable onPress={() => setShowNewCollectionModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>
            <Field label="Collection Name *" placeholder="e.g. ML Papers, Final Year Project..." value={newColName} onChangeText={setNewColName} />
            <Field label="Description (optional)" placeholder="What is this collection for?" value={newColDesc} onChangeText={setNewColDesc} multiline numberOfLines={2} />
            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowNewCollectionModal(false)} />
              <Button
                title={createCollection.isPending ? "Creating…" : "Create Collection"}
                disabled={createCollection.isPending || !newColName.trim()}
                loading={createCollection.isPending}
                onPress={() => createCollection.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>

      {/* ── New Note Modal ────────────────────────────────────────────────────── */}
      <Modal visible={showNewNoteModal} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <H2>New Research Note 📝</H2>
              <Pressable onPress={() => setShowNewNoteModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>
            <Field label="Title" placeholder="Note title..." value={newNoteTitle} onChangeText={setNewNoteTitle} />
            <Field label="Content" placeholder="Start writing..." value={newNoteBody} onChangeText={setNewNoteBody} multiline numberOfLines={5} />
            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowNewNoteModal(false)} />
              <Button
                title={createNote.isPending ? "Creating…" : "Create & Edit 📝"}
                disabled={createNote.isPending}
                loading={createNote.isPending}
                onPress={() => createNote.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  pageHeader: { gap: 2, marginBottom: 8 },
  tabBar: { marginBottom: 14 },
  tabBarContent: { gap: 6, paddingRight: 4 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  tabLabel: { fontSize: 12, fontWeight: "800" },

  // Hero
  heroCard: { borderRadius: radius.xl, padding: 20, gap: 10 },
  heroTitle: { fontSize: 22, fontWeight: "900" },
  heroSubtitle: { fontSize: 13, lineHeight: 19 },
  heroSearchBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, marginTop: 4 },
  heroSearchText: { fontSize: 14 },

  // Stats
  statStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1 },
  statItem: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  statDivider: { width: 1, height: 30 },

  // Quick actions
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickActionBtn: { width: "30.5%", alignItems: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, gap: 8 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },

  // Trending
  trendingSection: { borderRadius: radius.lg, borderWidth: 1, padding: 14 },
  trendingSectionTitle: { fontSize: 14, fontWeight: "800" },
  topicDot: { width: 8, height: 8, borderRadius: 4 },

  // History chip
  historyChip: { width: 140, padding: 12, borderRadius: radius.md, borderWidth: 1, gap: 6 },
  historyChipText: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
  historyChipYear: { fontSize: 11 },

  // Search bar
  searchBox: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 12, fontSize: 14 },
  searchBtn: { paddingHorizontal: 14, paddingVertical: 13, margin: 0 },

  // Filters
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  filterChipText: { fontSize: 12 },
  filterToggle: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  filterToggleText: { fontSize: 12, fontWeight: "600" },
  suggestedQuery: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  resultsCount: { fontSize: 12, marginBottom: 8 },

  // Library
  libTab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  libTabText: { fontSize: 12 },
  savedItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  savedTitle: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  savedMeta: { fontSize: 12, marginTop: 2 },

  // Collections
  collectionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  collectionName: { fontSize: 14, fontWeight: "800" },
  collectionCount: { fontSize: 12 },

  // Notes
  noteCard: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 6 },
  noteTitle: { fontSize: 15, fontWeight: "800" },
  noteLinked: { fontSize: 11, fontWeight: "600" },
  notePreview: { fontSize: 13, lineHeight: 18 },
  noteDate: { fontSize: 11, marginTop: 2 },

  // History
  historyItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  historyTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  historyMeta: { fontSize: 11 },
  historyDate: { fontSize: 11, minWidth: 70, textAlign: "right" },

  // Projects (preserved original)
  authorAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 8 },
  authorName: { fontWeight: "800", fontSize: 14 },
  projectTitle: { fontSize: 17, fontWeight: "800", marginTop: 6 },
  collabBox: { padding: 10, borderRadius: 10, borderWidth: 1, gap: 4, marginTop: 6 },
  collabTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1, marginLeft: 6 },
  collabToggle: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, marginTop: 4 },

  // Discover
  topicsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  topicCard: { width: "47%", borderRadius: radius.md, borderWidth: 1, padding: 12, gap: 6 },
  topicCardText: { fontSize: 12, fontWeight: "700" },
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolCard: { padding: 12, borderRadius: radius.md, borderWidth: 1, gap: 8 },
  toolIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  toolName: { fontSize: 13, fontWeight: "800" },
  toolDesc: { fontSize: 11, lineHeight: 15 },
  datasetCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  datasetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  datasetName: { fontSize: 14, fontWeight: "700" },
  datasetDesc: { fontSize: 12 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.md },
  modalContent: { borderRadius: radius.lg, padding: 18, borderWidth: 1, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
});
