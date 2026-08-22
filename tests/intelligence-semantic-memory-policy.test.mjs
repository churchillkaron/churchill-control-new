import { test } from "node:test";
import assert from "node:assert/strict";

import {
  semanticMemorySimilarity,
  semanticMemoryRelevance,
} from "../lib/operator/runtime/IntelligenceSemanticMemoryPolicy.js";

test("matches deploy and release as the same operational concept", () => {
  const result = semanticMemorySimilarity({
    query: "Do not release this to production yet",
    content: "Never deploy production unless I explicitly ask.",
  });

  assert.ok(result.score >= 0.2);
  assert.ok(result.concept_score > 0);
  assert.equal(result.mode, "deterministic_sparse");
});

test("matches resume language to continuation memory", () => {
  const result = semanticMemorySimilarity({
    query: "pick up where we left off",
    content: "Continue the active project from the next unfinished step.",
  });

  assert.ok(result.score >= 0.2);
  assert.ok(result.concept_score > 0);
});

test("matches verification synonyms", () => {
  const result = semanticMemorySimilarity({
    query: "check that the change really worked",
    content: "Verify the business effect after execution.",
  });

  assert.ok(result.score >= 0.2);
  assert.ok(result.concept_score > 0);
});

test("matches invoice and bill wording", () => {
  const result = semanticMemoryRelevance(
    {
      subject: "finance.vendor_bill.create",
      content: "Supplier invoices require verification after posting.",
    },
    "what did we decide about vendor bills?",
  );

  assert.ok(result.score >= 0.15);
  assert.ok(result.concept_score > 0);
});

test("supports Swedish and English concept equivalence", () => {
  const result = semanticMemorySimilarity({
    query: "lansera inte till produktion",
    content: "Never deploy production unless I explicitly ask.",
  });

  assert.ok(result.score >= 0.15);
  assert.ok(result.concept_score > 0);
});

test("unrelated content stays low relevance", () => {
  const result = semanticMemorySimilarity({
    query: "deploy production",
    content: "I prefer concise answers when discussing menu design.",
  });

  assert.ok(result.score < 0.2);
});

test("future owned vectors can blend with deterministic semantics", () => {
  const deterministic = semanticMemorySimilarity({
    query: "resume this work",
    content: "Continue the active project.",
  });
  const hybrid = semanticMemorySimilarity({
    query: "resume this work",
    content: "Continue the active project.",
    vectorScore: 0.95,
  });

  assert.equal(hybrid.mode, "hybrid_vector");
  assert.equal(hybrid.vector_score, 0.95);
  assert.ok(hybrid.score >= deterministic.score);
});
