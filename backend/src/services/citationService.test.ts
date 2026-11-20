import test from "node:test";
import assert from "node:assert";
import { generateUniversalCitation, generateAllCitations } from "./citationService.js";
import type { UnifiedPaper } from "./paperSources.js";

test("Universal Academic Citation Engine Test Suite", async (t) => {
  const samplePaper: UnifiedPaper = {
    paperId: "arxiv:2310.06825",
    source: "arxiv",
    sourceLabel: "arXiv (Real-Time)",
    title: "Attention Is All You Need",
    authors: [
      { name: "Ashish Vaswani" },
      { name: "Noam Shazeer" },
      { name: "Niki Parmar" },
    ],
    year: 2017,
    venue: "NeurIPS",
    isOpenAccess: true,
    pdfUrl: "https://arxiv.org/pdf/1706.03762.pdf",
    readUrl: "https://arxiv.org/abs/1706.03762",
    externalIds: {
      DOI: "10.5555/3295222.3295349",
      ArXiv: "1706.03762",
    },
  };

  await t.test("formats APA 7th edition correctly", () => {
    const apa = generateUniversalCitation(samplePaper, "apa");
    assert.ok(apa.includes("Vaswani, A. et al."));
    assert.ok(apa.includes("(2017)"));
    assert.ok(apa.includes("Attention Is All You Need"));
    assert.ok(apa.includes("https://doi.org/10.5555/3295222.3295349"));
  });

  await t.test("formats MLA 9th edition correctly", () => {
    const mla = generateUniversalCitation(samplePaper, "mla");
    assert.ok(mla.includes("Vaswani, Ashish, et al."));
    assert.ok(mla.includes('"Attention Is All You Need."'));
    assert.ok(mla.includes("NeurIPS, 2017"));
  });

  await t.test("formats IEEE style correctly", () => {
    const ieee = generateUniversalCitation(samplePaper, "ieee");
    assert.ok(ieee.includes("Ashish Vaswani et al."));
    assert.ok(ieee.includes('"Attention Is All You Need,"'));
    assert.ok(ieee.includes("NeurIPS, 2017"));
  });

  await t.test("formats BibTeX entry correctly", () => {
    const bibtex = generateUniversalCitation(samplePaper, "bibtex");
    assert.ok(bibtex.startsWith("@article{"));
    assert.ok(bibtex.includes("Ashish Vaswani and Noam Shazeer and Niki Parmar"));
    assert.ok(bibtex.includes("title     = {{Attention Is All You Need}}"));
    assert.ok(bibtex.includes("year      = {2017}"));
    assert.ok(bibtex.includes("archivePrefix = {arXiv}"));
  });

  await t.test("generateAllCitations produces all 6 styles", () => {
    const all = generateAllCitations(samplePaper);
    assert.ok(all.apa);
    assert.ok(all.mla);
    assert.ok(all.ieee);
    assert.ok(all.chicago);
    assert.ok(all.harvard);
    assert.ok(all.bibtex);
  });
});
