/**
 * Semantic Scholar API adapter
 * Docs: https://api.semanticscholar.org/api-docs/
 * Free tier — no API key required, rate limit: ~100 req/5min
 */

const BASE = "https://api.semanticscholar.org/graph/v1";

const PAPER_FIELDS =
  "paperId,externalIds,title,abstract,year,citationCount,referenceCount,openAccessPdf,authors,fieldsOfStudy,publicationTypes,publicationDate,journal,venue,s2FieldsOfStudy,isOpenAccess,url";

const AUTHOR_FIELDS =
  "authorId,name,affiliations,homepage,paperCount,citationCount,hIndex,papers.title,papers.year,papers.citationCount,papers.paperId";

// Simple in-memory cache (TTL: 10 minutes)
const cache = new Map<string, { data: unknown; expires: number }>();

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = 10 * 60 * 1000) {
  // Keep cache bounded
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

async function ssGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));

  const cacheKey = url.toString();
  const cached = getCache<T>(cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Semantic Scholar API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as T;
  setCache(cacheKey, data);
  return data;
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchPapers(
  query: string,
  opts: { offset?: number; limit?: number; fieldsOfStudy?: string; year?: string; openAccess?: boolean } = {},
): Promise<{ total: number; offset: number; next?: number; data: SSPaper[] }> {
  const params: Record<string, string> = {
    query: query.trim(),
    fields: PAPER_FIELDS,
    offset: String(opts.offset ?? 0),
    limit: String(Math.min(opts.limit ?? 10, 25)),
  };
  if (opts.fieldsOfStudy) params.fieldsOfStudy = opts.fieldsOfStudy;
  if (opts.year) params.year = opts.year;
  if (opts.openAccess) params.openAccessPdf = "true";

  return ssGet("/paper/search", params);
}

// ─── Paper Detail ─────────────────────────────────────────────────────────────

export async function getPaper(paperId: string): Promise<SSPaper> {
  return ssGet(`/paper/${encodeURIComponent(paperId)}`, { fields: PAPER_FIELDS });
}

// ─── References ──────────────────────────────────────────────────────────────

export async function getPaperReferences(
  paperId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<{ offset: number; next?: number; data: { paperId: string; title: string; year?: number; citationCount?: number; authors: { name: string }[] }[] }> {
  const res = await ssGet<{ offset: number; next?: number; data: { citedPaper: SSPaper }[] }>(
    `/paper/${encodeURIComponent(paperId)}/references`,
    {
      fields: "paperId,title,year,citationCount,authors",
      offset: String(opts.offset ?? 0),
      limit: String(Math.min(opts.limit ?? 10, 25)),
    },
  );
  return {
    offset: res.offset,
    next: res.next,
    data: res.data.map((d) => ({
      paperId: d.citedPaper.paperId,
      title: d.citedPaper.title,
      year: d.citedPaper.year,
      citationCount: d.citedPaper.citationCount,
      authors: d.citedPaper.authors,
    })),
  };
}

// ─── Citations ────────────────────────────────────────────────────────────────

export async function getPaperCitations(
  paperId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<{ offset: number; next?: number; data: { paperId: string; title: string; year?: number; citationCount?: number; authors: { name: string }[] }[] }> {
  const res = await ssGet<{ offset: number; next?: number; data: { citingPaper: SSPaper }[] }>(
    `/paper/${encodeURIComponent(paperId)}/citations`,
    {
      fields: "paperId,title,year,citationCount,authors",
      offset: String(opts.offset ?? 0),
      limit: String(Math.min(opts.limit ?? 10, 25)),
    },
  );
  return {
    offset: res.offset,
    next: res.next,
    data: res.data.map((d) => ({
      paperId: d.citingPaper.paperId,
      title: d.citingPaper.title,
      year: d.citingPaper.year,
      citationCount: d.citingPaper.citationCount,
      authors: d.citingPaper.authors,
    })),
  };
}

// ─── Author ───────────────────────────────────────────────────────────────────

export async function getAuthor(authorId: string): Promise<SSAuthor> {
  return ssGet(`/author/${encodeURIComponent(authorId)}`, { fields: AUTHOR_FIELDS });
}

// ─── Trending / Recommended ───────────────────────────────────────────────────

const TRENDING_QUERIES = [
  { label: "Machine Learning & Deep Learning", q: "deep learning neural networks 2024" },
  { label: "Large Language Models", q: "large language models GPT 2024" },
  { label: "Computer Vision", q: "computer vision image recognition 2024" },
  { label: "Cybersecurity", q: "network security intrusion detection 2024" },
  { label: "Biomedical Engineering", q: "biomedical signal processing health 2024" },
  { label: "Renewable Energy", q: "solar energy renewable sustainability 2024" },
  { label: "Data Science", q: "data analysis machine learning applications 2024" },
  { label: "Robotics & IoT", q: "robotics autonomous systems IoT 2024" },
  { label: "Climate Science", q: "climate change environmental modeling 2024" },
  { label: "Quantum Computing", q: "quantum computing algorithms 2024" },
];

export async function getTrendingPapers(
  topic?: string,
): Promise<{ topic: string; papers: SSPaper[] }[]> {
  const queries = topic
    ? TRENDING_QUERIES.filter((q) => q.label.toLowerCase().includes(topic.toLowerCase()))
    : TRENDING_QUERIES.slice(0, 5);

  const results = await Promise.allSettled(
    queries.map(async (t) => {
      const res = await searchPapers(t.q, { limit: 5 });
      return { topic: t.label, papers: res.data };
    }),
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value.papers.length > 0)
    .map((r) => (r as PromiseFulfilledResult<{ topic: string; papers: SSPaper[] }>).value);
}

// ─── Citation Formatting ──────────────────────────────────────────────────────

export function formatAPA(paper: SSPaper): string {
  const authors = paper.authors
    .slice(0, 6)
    .map((a) => {
      const parts = a.name.trim().split(" ");
      if (parts.length < 2) return a.name;
      const last = parts[parts.length - 1];
      const initials = parts
        .slice(0, -1)
        .map((p) => `${p[0]}.`)
        .join(" ");
      return `${last}, ${initials}`;
    })
    .join(", ");
  const etAl = paper.authors.length > 6 ? " et al." : "";
  const year = paper.year ? ` (${paper.year}).` : ".";
  const title = ` ${paper.title}.`;
  const venue = paper.journal?.name || paper.venue || "";
  const venueStr = venue ? ` *${venue}*.` : "";
  const doi = paper.externalIds?.DOI ? ` https://doi.org/${paper.externalIds.DOI}` : paper.url ? ` ${paper.url}` : "";
  return `${authors}${etAl}${year}${title}${venueStr}${doi}`;
}

export function formatBibtex(paper: SSPaper): string {
  const key = (paper.authors[0]?.name?.split(" ").pop() ?? "Unknown") + (paper.year ?? "0000");
  const authorStr = paper.authors.map((a) => a.name).join(" and ");
  const doi = paper.externalIds?.DOI ?? "";
  return `@article{${key},
  title = {${paper.title}},
  author = {${authorStr}},
  year = {${paper.year ?? ""}},
  journal = {${paper.journal?.name ?? paper.venue ?? ""}},
  doi = {${doi}},
  url = {${paper.url ?? ""}}
}`;
}

export const TRENDING_TOPICS = TRENDING_QUERIES.map((q) => q.label);
