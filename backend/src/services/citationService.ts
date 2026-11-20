import type { UnifiedPaper } from "./paperSources.js";

export type CitationStyle = "apa" | "mla" | "ieee" | "chicago" | "harvard" | "bibtex";

/**
 * Normalizes author name into "Lastname, F. M." format
 */
function formatAuthorAPA(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] || "Author";
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((p) => `${p[0]?.toUpperCase()}.`).join(" ");
  return `${last}, ${initials}`;
}

/**
 * Formats authors according to citation style guidelines
 */
function formatAuthors(authors: { name: string }[] = [], style: CitationStyle): string {
  if (!authors || authors.length === 0) return "Anonymous";

  if (style === "apa") {
    if (authors.length === 1) return formatAuthorAPA(authors[0]?.name || "Author");
    if (authors.length === 2) {
      return `${formatAuthorAPA(authors[0]?.name || "Author")} & ${formatAuthorAPA(authors[1]?.name || "Author")}`;
    }
    return `${formatAuthorAPA(authors[0]?.name || "Author")} et al.`;
  }

  if (style === "mla") {
    if (authors.length === 1) {
      const parts = (authors[0]?.name || "Author").trim().split(/\s+/);
      return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}` : authors[0]?.name || "Author";
    }
    if (authors.length === 2) {
      const p1 = (authors[0]?.name || "Author").trim().split(/\s+/);
      const name1 = p1.length > 1 ? `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(" ")}` : authors[0]?.name;
      return `${name1}, and ${authors[1]?.name}`;
    }
    const p1 = (authors[0]?.name || "Author").trim().split(/\s+/);
    const name1 = p1.length > 1 ? `${p1[p1.length - 1]}, ${p1.slice(0, -1).join(" ")}` : authors[0]?.name;
    return `${name1}, et al.`;
  }

  if (style === "ieee") {
    if (authors.length === 1) return authors[0]?.name || "Author";
    if (authors.length === 2) return `${authors[0]?.name} and ${authors[1]?.name}`;
    return `${authors[0]?.name} et al.`;
  }

  // Chicago / Harvard
  if (authors.length === 1) return authors[0]?.name || "Author";
  if (authors.length === 2) return `${authors[0]?.name} and ${authors[1]?.name}`;
  return `${authors[0]?.name} et al.`;
}

/**
 * Universal Academic Citation Generator
 * Supports APA 7th, MLA 9th, IEEE, Chicago 17th, Harvard, and BibTeX.
 */
export function generateUniversalCitation(paper: UnifiedPaper, style: CitationStyle): string {
  const title = (paper.title || "Untitled Paper").replace(/\.$/, "");
  const year = paper.year || new Date().getFullYear();
  const venue = paper.venue || paper.journal?.name || (paper.source === "arxiv" ? "arXiv preprint" : "Academic Publications");
  const doi = paper.externalIds?.DOI;
  const url = paper.readUrl || (doi ? `https://doi.org/${doi}` : paper.url || "");

  switch (style) {
    case "apa": {
      const authors = formatAuthors(paper.authors, "apa");
      let out = `${authors} (${year}). ${title}. ${venue}.`;
      if (doi) out += ` https://doi.org/${doi}`;
      else if (url) out += ` ${url}`;
      return out;
    }

    case "mla": {
      const authors = formatAuthors(paper.authors, "mla");
      let out = `${authors}. "${title}." ${venue}, ${year}`;
      if (doi) out += `, doi:${doi}.`;
      else if (url) out += `, ${url}.`;
      else out += ".";
      return out;
    }

    case "ieee": {
      const authors = formatAuthors(paper.authors, "ieee");
      let out = `${authors}, "${title}," ${venue}, ${year}.`;
      if (doi) out += ` doi: ${doi}.`;
      else if (url) out += ` [Online]. Available: ${url}`;
      return out;
    }

    case "chicago": {
      const authors = formatAuthors(paper.authors, "chicago");
      let out = `${authors}. ${year}. "${title}." ${venue}.`;
      if (doi) out += ` https://doi.org/${doi}.`;
      return out;
    }

    case "harvard": {
      const authors = formatAuthors(paper.authors, "harvard");
      let out = `${authors}, ${year}. ${title}. ${venue}.`;
      if (url) out += ` Available at: <${url}>.`;
      return out;
    }

    case "bibtex": {
      const firstAuthor = (paper.authors?.[0]?.name || "Author").toLowerCase().replace(/[^a-z]/g, "");
      const firstWord = title.toLowerCase().replace(/[^a-z]/g, " ").trim().split(/\s+/)[0] || "paper";
      const key = `${firstAuthor}${year}${firstWord}`;
      const authorList = (paper.authors || [{ name: "Author" }]).map((a) => a.name).join(" and ");

      return `@article{${key},
  author    = {${authorList}},
  title     = {{${title}}},
  journal   = {${venue}},
  year      = {${year}}${doi ? `,\n  doi       = {${doi}}` : ""}${paper.externalIds?.ArXiv ? `,\n  eprint    = {${paper.externalIds.ArXiv}},\n  archivePrefix = {arXiv}` : ""}${url ? `,\n  url       = {${url}}` : ""}
}`;
    }
  }
}

/**
 * Returns citations formatted in all major academic styles simultaneously
 */
export function generateAllCitations(paper: UnifiedPaper): Record<CitationStyle, string> {
  return {
    apa: generateUniversalCitation(paper, "apa"),
    mla: generateUniversalCitation(paper, "mla"),
    ieee: generateUniversalCitation(paper, "ieee"),
    chicago: generateUniversalCitation(paper, "chicago"),
    harvard: generateUniversalCitation(paper, "harvard"),
    bibtex: generateUniversalCitation(paper, "bibtex"),
  };
}
