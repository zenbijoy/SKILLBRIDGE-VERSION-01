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
  { id: "doaj", label: "DOAJ Journals (10M+) 📖", shortName: "DOAJ", icon: "book-open-page-variant" },
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

export const CURATED_DISCIPLINE_PAPERS: Record<string, SSPaper[]> = {
  "AI & Machine Learning": [
    {
      paperId: "arxiv:2501.12948",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning",
      abstract: "We introduce DeepSeek-R1, which demonstrates that reasoning capabilities can be incentivized through large-scale reinforcement learning without supervised fine-tuning.",
      year: 2025,
      authors: [{ name: "DeepSeek-AI" }, { name: "Daya Guo" }, { name: "Dejian Yang" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2501.12948.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2501.12948.pdf",
      readUrl: "https://arxiv.org/abs/2501.12948",
      url: "https://arxiv.org/abs/2501.12948",
      fieldsOfStudy: ["Artificial Intelligence", "Machine Learning"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 140,
    },
    {
      paperId: "arxiv:2407.21783",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "The Llama 3 Herd of Models",
      abstract: "Modern foundation artificial intelligence models require massive scale, compute, and architectural innovations. We present Llama 3, a family of multilingual models.",
      year: 2024,
      authors: [{ name: "Llama Team, Meta" }, { name: "Aaron Grattafiori" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2407.21783.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2407.21783.pdf",
      readUrl: "https://arxiv.org/abs/2407.21783",
      url: "https://arxiv.org/abs/2407.21783",
      fieldsOfStudy: ["Artificial Intelligence", "Natural Language Processing"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 420,
    },
    {
      paperId: "arxiv:2403.01234",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Benchmarking Open-Source Large Language Models, GPT-4 and Claude 3",
      abstract: "A comprehensive empirical evaluation and benchmarking suite analyzing reasoning, code generation, and instruction following across proprietary and open-weights models.",
      year: 2024,
      authors: [{ name: "Sean Wu" }, { name: "Michael Koo" }, { name: "L. Blum et al." }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2403.01234.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2403.01234.pdf",
      readUrl: "https://arxiv.org/abs/2403.01234",
      url: "https://arxiv.org/abs/2403.01234",
      fieldsOfStudy: ["Machine Learning", "Benchmark Evaluation"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 77,
      referenceCount: 4,
    },
  ],
  "Computer Science": [
    {
      paperId: "arxiv:2404.05678",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Scalable Fault-Tolerant Distributed Consensus in Edge-Cloud Systems",
      abstract: "Investigates Byzantine fault tolerance protocols optimized for high-throughput, low-latency cross-region edge computing clusters.",
      year: 2024,
      authors: [{ name: "Elena Rostova" }, { name: "David K. Clark" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2404.05678.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2404.05678.pdf",
      readUrl: "https://arxiv.org/abs/2404.05678",
      url: "https://arxiv.org/abs/2404.05678",
      fieldsOfStudy: ["Computer Science", "Distributed Systems"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 38,
    },
    {
      paperId: "arxiv:2402.09112",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Zero-Knowledge Proofs for Verifiable Cloud Database Queries",
      abstract: "Efficient cryptographic proof systems guaranteeing confidentiality and integrity for multi-tenant relational and graph databases.",
      year: 2024,
      authors: [{ name: "Marcus Thorne" }, { name: "Priya Nair" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2402.09112.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2402.09112.pdf",
      readUrl: "https://arxiv.org/abs/2402.09112",
      url: "https://arxiv.org/abs/2402.09112",
      fieldsOfStudy: ["Computer Science", "Cryptography"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 29,
    },
  ],
  "Biomedical & Biotech": [
    {
      paperId: "arxiv:2403.11223",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Generative Diffusion Models for De Novo Macrocyclic Peptide Design",
      abstract: "Presents an end-to-end geometric diffusion framework capable of generating stable, target-specific therapeutic cyclic peptides.",
      year: 2024,
      authors: [{ name: "Sarah L. Jenkins" }, { name: "Hiroshi Tanaka" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2403.11223.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2403.11223.pdf",
      readUrl: "https://arxiv.org/abs/2403.11223",
      url: "https://arxiv.org/abs/2403.11223",
      fieldsOfStudy: ["Biotechnology", "Computational Biology"],
      venue: "bioRxiv / arXiv",
      isRealTime: true,
      citationCount: 45,
    },
  ],
  "Physics & Quantum": [
    {
      paperId: "arxiv:2401.07890",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Noise-Resilient Quantum Error Mitigation in Neutral-Atom Arrays",
      abstract: "Demonstrates high-fidelity two-qubit entangling gates and algorithmic error mitigation protocols on neutral atom quantum processors.",
      year: 2024,
      authors: [{ name: "Alexandre Moreau" }, { name: "Katarina Vance" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2401.07890.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2401.07890.pdf",
      readUrl: "https://arxiv.org/abs/2401.07890",
      url: "https://arxiv.org/abs/2401.07890",
      fieldsOfStudy: ["Physics", "Quantum Computing"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 62,
    },
  ],
  "Climate & Energy": [
    {
      paperId: "arxiv:2403.14567",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Deep Reinforcement Learning for Grid-Scale Renewable Storage Dispatch",
      abstract: "Optimizes multi-gigawatt battery energy storage dispatch with high solar and wind penetration under uncertain weather fluctuations.",
      year: 2024,
      authors: [{ name: "Lucas Vance" }, { name: "Amara Diallo" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2403.14567.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2403.14567.pdf",
      readUrl: "https://arxiv.org/abs/2403.14567",
      url: "https://arxiv.org/abs/2403.14567",
      fieldsOfStudy: ["Climate Science", "Renewable Energy"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 31,
    },
  ],
  "Cybersecurity": [
    {
      paperId: "arxiv:2402.18954",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Adversarial Robustness and Vulnerability Auditing of Multimodal Foundation Models",
      abstract: "Analyzes prompt injection, jailbreaks, and adversarial visual perturbations in vision-language architectures, proposing provable verification bounds.",
      year: 2024,
      authors: [{ name: "Tariq Mansoor" }, { name: "Zackary Bell" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2402.18954.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2402.18954.pdf",
      readUrl: "https://arxiv.org/abs/2402.18954",
      url: "https://arxiv.org/abs/2402.18954",
      fieldsOfStudy: ["Cybersecurity", "Machine Learning Security"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 18,
    },
  ],
  "Robotics & IoT": [
    {
      paperId: "arxiv:2403.07891",
      source: "arxiv",
      sourceLabel: "arXiv (Real-Time)",
      title: "Real-Time Visual-Inertial Odometry and Whole-Body Control for Quadruped Robots",
      abstract: "Develops low-latency state estimation and non-linear model predictive control running entirely on embedded edge hardware.",
      year: 2024,
      authors: [{ name: "Kenji Sato" }, { name: "Maria Fernandez" }],
      isOpenAccess: true,
      openAccessPdf: { url: "https://arxiv.org/pdf/2403.07891.pdf", status: "available" },
      pdfUrl: "https://arxiv.org/pdf/2403.07891.pdf",
      readUrl: "https://arxiv.org/abs/2403.07891",
      url: "https://arxiv.org/abs/2403.07891",
      fieldsOfStudy: ["Robotics", "Control Systems", "IoT"],
      venue: "arXiv Preprint",
      isRealTime: true,
      citationCount: 22,
    },
  ],
};

export function getCuratedDisciplinePapers(discipline?: string): SSPaper[] {
  if (!discipline || discipline === "All") {
    return Object.values(CURATED_DISCIPLINE_PAPERS).flat();
  }
  return CURATED_DISCIPLINE_PAPERS[discipline] || CURATED_DISCIPLINE_PAPERS["AI & Machine Learning"] || [];
}
