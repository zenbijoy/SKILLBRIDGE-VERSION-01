import test from "node:test";
import assert from "node:assert";
import { getOrGeneratePaperInsights, askPaperQuestion } from "./paperAiService.js";
import type { UnifiedPaper } from "./paperSources.js";

test("AI Research Paper Assistant Test Suite", async (t) => {
  const samplePaper: UnifiedPaper = {
    paperId: "test:ai-transformer-paper",
    source: "arxiv",
    sourceLabel: "arXiv (Real-Time ⚡)",
    title: "Scalable Multi-Head Latent Attention for Autonomous Agents",
    abstract: "We introduce a novel latent attention mechanism that dramatically reduces memory footprint during multi-step inference. Our benchmarks show a 4x reduction in KV cache size while maintaining 99.4% of baseline accuracy on reasoning benchmarks. This framework enables real-time deployment on edge devices and long-context agentic reasoning.",
    authors: [{ name: "Elena Rostova" }, { name: "Marcus Chen" }],
    year: 2026,
    venue: "ICLR 2026",
    fieldsOfStudy: ["Computer Science", "Artificial Intelligence"],
  };

  await t.test("getOrGeneratePaperInsights returns structured breakdown", async () => {
    const insights = await getOrGeneratePaperInsights(samplePaper);
    assert.strictEqual(insights.paperId, samplePaper.paperId);
    assert.ok(insights.tldr);
    assert.ok(Array.isArray(insights.keyFindings));
    assert.ok(insights.keyFindings.length > 0);
    assert.ok(insights.methodology);
    assert.ok(Array.isArray(insights.practicalTakeaways));
    assert.ok(insights.practicalTakeaways.length > 0);
  });

  await t.test("askPaperQuestion returns direct answer", async () => {
    const qa = await askPaperQuestion(samplePaper, "How much does this reduce memory usage?");
    assert.strictEqual(qa.paperId, samplePaper.paperId);
    assert.ok(qa.answer.length > 10);
  });
});
