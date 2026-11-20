import test from "node:test";
import assert from "node:assert";
import {
  getAvailableSources,
  resolvePaper,
  searchAcademicPapers,
  getLatestRealtimePapers,
} from "./paperSources.js";

test("Real-Time Paper Sources Service Test Suite", async (t) => {
  await t.test("getAvailableSources returns all active academic paper APIs", () => {
    const sources = getAvailableSources();
    assert.ok(Array.isArray(sources));
    assert.strictEqual(sources.length, 6);

    const ids = sources.map((s) => s.id);
    assert.ok(ids.includes("all"));
    assert.ok(ids.includes("arxiv"));
    assert.ok(ids.includes("openalex"));
    assert.ok(ids.includes("europepmc"));
    assert.ok(ids.includes("crossref"));
    assert.ok(ids.includes("semanticscholar"));
  });

  await t.test("resolvePaper handles arXiv IDs correctly", async () => {
    const paper = await resolvePaper("arxiv:2310.06825");
    assert.strictEqual(paper.source, "arxiv");
    assert.strictEqual(paper.pdfUrl, "https://arxiv.org/pdf/2310.06825.pdf");
    assert.ok(paper.readUrl?.includes("arxiv.org/abs/2310.06825"));
    assert.strictEqual(paper.isOpenAccess, true);
    assert.strictEqual(paper.isRealTime, true);
  });

  await t.test("resolvePaper handles Europe PMC IDs correctly", async () => {
    const paper = await resolvePaper("pmc:PMC7153335");
    assert.strictEqual(paper.source, "europepmc");
    assert.ok(paper.pdfUrl?.includes("PMC7153335"));
    assert.ok(paper.readUrl?.includes("PMC7153335"));
    assert.strictEqual(paper.isOpenAccess, true);
    assert.strictEqual(paper.isRealTime, true);
  });

  await t.test("resolvePaper handles DOI IDs correctly", async () => {
    const paper = await resolvePaper("doi:10.1038/s41586-020-2649-2");
    assert.ok(paper.title);
    assert.ok(paper.readUrl || paper.pdfUrl);
    assert.ok(paper.source);
  });

  await t.test("getLatestRealtimePapers returns papers for default discipline", async () => {
    const papers = await getLatestRealtimePapers("AI & Machine Learning");
    assert.ok(Array.isArray(papers));
    if (papers.length > 0 && papers[0]) {
      const first = papers[0];
      assert.ok(first.paperId);
      assert.ok(first.title);
      assert.ok(first.source);
      assert.ok(first.readUrl || first.pdfUrl);
    }
  });

  await t.test("searchAcademicPapers searches arXiv and returns papers", async () => {
    const result = await searchAcademicPapers("quantum computing", {
      source: "arxiv",
      limit: 3,
    });
    assert.ok(Array.isArray(result.data));
    assert.ok(result.sources.includes("arXiv"));
    if (result.data.length > 0 && result.data[0]) {
      const first = result.data[0];
      assert.strictEqual(first.source, "arxiv");
      assert.strictEqual(first.isOpenAccess, true);
      assert.ok(first.readUrl?.includes("arxiv.org"));
    }
  });
});
