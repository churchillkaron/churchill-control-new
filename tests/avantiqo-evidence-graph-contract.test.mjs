import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime.js", import.meta.url),
  "utf8",
);
const router = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js", import.meta.url),
  "utf8",
);
const comparison = fs.readFileSync(
  new URL("../lib/platform/research/runtime/OperatorResearchEvidenceComparisonRuntime.js", import.meta.url),
  "utf8",
);
const index = fs.readFileSync(
  new URL("../lib/intelligence/index.js", import.meta.url),
  "utf8",
);

test("evidence graph preserves supported, conflicted and insufficient claims", () => {
  assert.match(graph, /AVANTIQO_EVIDENCE_GRAPH_V1/);
  assert.match(graph, /SUPPORTED/);
  assert.match(graph, /CONFLICTED/);
  assert.match(graph, /INSUFFICIENT/);
  assert.match(graph, /support_source_ids/);
  assert.match(graph, /contradict_source_ids/);
  assert.match(graph, /source_diversity/);
  assert.match(graph, /official_primary_source_count/);
  assert.match(graph, /conflicted_claims_never_promoted_as_consensus: true/);
});

test("relevant conflicts or stale evidence can block external knowledge reuse", () => {
  assert.match(graph, /UNRESOLVED_RELEVANT_EVIDENCE_CONFLICT/);
  assert.match(graph, /RELEVANT_EVIDENCE_GRAPH_STALE/);
  assert.match(graph, /block_knowledge_reuse: blockKnowledgeReuse/);
  assert.match(router, /AVANTIQO_KNOWLEDGE_ROUTER_V3/);
  assert.match(router, /inspectAvantiqoEvidenceGraph/);
  assert.match(router, /evidenceGraph\.block_knowledge_reuse === true/);
  assert.match(router, /force_refresh: forceRefresh/);
  assert.match(router, /forced_fresh_research/);
});

test("canonical internal product authority remains separate from external evidence conflict memory", () => {
  assert.match(router, /CANONICAL_INTERNAL_PRODUCT_AUTHORITY/);
  assert.match(router, /block_knowledge_reuse: false/);
  assert.match(router, /AVANTIQO_CANONICAL_PRODUCT/);
});

test("continuous-learning evidence comparison persists graph snapshots", () => {
  assert.match(comparison, /AVANTIQO_RESEARCH_EVIDENCE_COMPARISON_V2/);
  assert.match(comparison, /persistAvantiqoEvidenceGraphSnapshot/);
  assert.match(comparison, /context\?\.metadata\?\.continuous_learning === true/);
  assert.match(comparison, /conflicted_claim_count/);
  assert.match(comparison, /supported_claim_count/);
});

test("evidence graph is part of public Intelligence runtime exports", () => {
  assert.match(index, /AvantiqoEvidenceGraphRuntime/);
});
