// Research Hub shared types

export interface SSPaper {
  paperId: string;
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string };
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  referenceCount?: number;
  openAccessPdf?: { url: string; status: string } | null;
  isOpenAccess?: boolean;
  url?: string;
  authors: { authorId?: string; name: string }[];
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: { category: string; source: string }[];
  publicationTypes?: string[];
  publicationDate?: string;
  journal?: { name?: string; volume?: string; pages?: string } | null;
  venue?: string;
}

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
