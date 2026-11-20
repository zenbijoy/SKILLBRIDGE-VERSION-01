// Research Hub shared types

export interface SSPaper {
  paperId: string;
  source?: "arxiv" | "openalex" | "europepmc" | "crossref" | "semanticscholar" | string;
  sourceLabel?: string;
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string; PMCID?: string; OpenAlex?: string };
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  referenceCount?: number;
  openAccessPdf?: { url: string; status?: string } | null;
  pdfUrl?: string | null;
  readUrl?: string | null;
  isOpenAccess?: boolean;
  url?: string;
  authors: { authorId?: string; name: string }[];
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: { category: string; source: string }[];
  publicationTypes?: string[];
  publicationDate?: string;
  journal?: { name?: string; volume?: string; pages?: string } | null;
  venue?: string;
  isRealTime?: boolean;
}

export interface AcademicSource {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: string;
  isRealTime: boolean;
}

export const REALTIME_SOURCES = [
  { id: "all", label: "All Sources 🌐", shortName: "Unified", icon: "earth" },
  { id: "arxiv", label: "arXiv Preprints ⚡", shortName: "arXiv", icon: "lightning-bolt" },
  { id: "openalex", label: "OpenAlex (250M+) 📚", shortName: "OpenAlex", icon: "bookshelf" },
  { id: "europepmc", label: "Europe PMC 🧬", shortName: "Europe PMC", icon: "dna" },
  { id: "semanticscholar", label: "Semantic Scholar 📈", shortName: "Semantic Scholar", icon: "chart-timeline-variant" },
  { id: "crossref", label: "Crossref DOIs 🏛️", shortName: "Crossref", icon: "file-certificate" },
];

export interface SSAuthor {
  authorId: string;
  name: string;
  affiliations?: string[];
  homepage?: string | null;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  papers?: { paperId: string; title: string; year?: number; citationCount?: number }[];
}

export interface SavedPaper {
  id: string;
  user_id: string;
  paper_id: string;
  paper_data: SSPaper;
  saved_at: string;
}

export interface ResearchCollection {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  papers?: { count: number }[];
}

export interface CollectionPaper {
  id: string;
  collection_id: string;
  paper_id: string;
  paper_data: SSPaper;
  added_at: string;
}

export interface ResearchNote {
  id: string;
  user_id: string;
  title: string;
  body: string;
  paper_id?: string;
  paper_title?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ReadingHistoryEntry {
  id: string;
  user_id: string;
  paper_id: string;
  paper_title: string;
  paper_year?: number;
  paper_authors: string[];
  read_at: string;
}

export interface TrendingSection {
  topic: string;
  papers: SSPaper[];
}

export interface PaperSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: SSPaper[];
}

export const RESEARCH_FIELDS = [
  "All Fields",
  "Computer Science",
  "Mathematics",
  "Physics",
  "Medicine",
  "Biology",
  "Chemistry",
  "Engineering",
  "Economics",
  "Psychology",
  "Environmental Science",
];

export const RESEARCH_DISCIPLINES = [
  "All",
  "AI / Machine Learning",
  "Biomedical & Healthcare",
  "Cybersecurity & Networks",
  "Robotics & IoT",
  "Data Science & Analytics",
  "Algorithms & Theory",
  "Renewable Energy & Climate",
  "Economics & Social Sciences",
];

export interface PaperAiInsights {
  paperId: string;
  title: string;
  tldr: string;
  keyFindings: string[];
  methodology: string;
  practicalTakeaways: string[];
  futureDirections: string;
  source: string;
  generatedAt: string;
}

export interface PaperQuestionAnswer {
  paperId: string;
  question: string;
  answer: string;
  answeredAt: string;
}

export interface CitationFormats {
  citation: string;
  format: string;
  allFormats: {
    apa: string;
    mla: string;
    ieee: string;
    chicago: string;
    harvard: string;
    bibtex: string;
  };
  title?: string;
  authors?: { name: string }[];
  year?: number;
  doi?: string;
  url?: string;
}

export interface ResearchWorkspaceSummary {
  projectId: string;
  projectTitle: string;
  roomId: string;
  roomName: string;
  conversationId: string;
}
