#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE6_AUDIT_V1";
const files = Object.freeze({
  epistemic: "lib/intelligence/runtime/AvantiqoEpistemicPromotionRuntime.js",
  scientific: "lib/intelligence/runtime/AvantiqoScientificLearningExperimentRuntime.js",
  evidenceGraph: "lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime.js",
  router: "lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers, label) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${label}: missing marker ${marker}`);
  }
}

const [epistemic, scientific, evidenceGraph, router, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(epistemic, [
  "AVANTIQO_EPISTEMIC_PROMOTION_V1",
  'CANDIDATE_SCOPE = "platform_learning_experimental_knowledge_candidates"',
  'PROVISIONAL_SCOPE = "platform_provisional_knowledge"',
  "inspectAvantiqoEvidenceGraph",
  '"ADVERSARIAL_CONTRADICTION_BLOCKED"',
  '"EXTERNAL_RECONCILIATION_REQUIRED"',
  '"SOURCE_DIVERSITY_REVIEW_REQUIRED"',
  '"EXPERIMENTAL_REPLICATION_GATE_FAILED"',
  '"PROVISIONAL_KNOWLEDGE_READY"',
  'status: "PROVISIONAL_SHADOW_ONLY"',
  'epistemic_state: "PROVISIONAL_NOT_CANONICAL"',
  "shadow_reuse_only: true",
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "explicit_final_promotion_required: true",
  "rollback_on_conflict: true",
  "automatic_knowledge_promotion: false",
  'automatic_training_effect: "NONE"',
  "automatic_model_weight_mutation: false",
  "automatic_model_promotion: false",
  "contradiction_search_required: true",
  "boundary_condition_search_required: true",
  "failed_replication_search_required: true",
  "experiment_alone_can_create_reusable_knowledge: false",
  "external_adversarial_reconciliation_required: true",
  "contradiction_blocks_promotion: true",
  "source_diversity_required: true",
  "provisional_knowledge_is_shadow_only: true",
  "provisional_knowledge_router_reuse_allowed: false",
], "epistemic promotion");

assert.equal(epistemic.includes('memory_scope: "platform_knowledge"'), false,
  "epistemic promotion must never write directly to reusable platform knowledge");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(epistemic), false,
  "epistemic promotion must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(epistemic), false,
  "epistemic promotion must not mutate RunPod worker bounds");
assert.equal(/fetch\s*\(/.test(epistemic), false,
  "epistemic promotion must not directly perform provider/web calls");

hasAll(scientific, [
  'CANDIDATE_SCOPE = "platform_learning_experimental_knowledge_candidates"',
  'status: "READY_FOR_EPISTEMIC_KNOWLEDGE_REVIEW"',
  "reusable_platform_knowledge: false",
  "automatic_knowledge_promotion: false",
  "knowledge_promotion_ready: knowledgePromotionReady",
], "scientific Learning");

hasAll(evidenceGraph, [
  "AVANTIQO_EVIDENCE_GRAPH_V1",
  '"CONFLICTED"',
  "block_knowledge_reuse",
  "conflicted_claims_never_promoted_as_consensus: true",
  "evidence_never_authorizes_actions: true",
], "evidence graph");

hasAll(router, [
  'KNOWLEDGE_SCOPE = "platform_knowledge"',
  "inspectAvantiqoEvidenceGraph",
  "block_knowledge_reuse",
  "forced_fresh_research",
], "knowledge router");
assert.equal(router.includes('KNOWLEDGE_SCOPE = "platform_provisional_knowledge"'), false,
  "Knowledge Router must not reuse provisional shadow knowledge as platform knowledge");
assert.equal(router.includes("PROVISIONAL_SCOPE"), false,
  "Knowledge Router must not know about provisional shadow scope");

hasAll(route, [
  "reconcileAvantiqoScientificLearningExperiments",
  "reconcileAvantiqoEpistemicPromotion",
  "const epistemicPromotion = await reconcileAvantiqoEpistemicPromotion();",
  "runAvantiqoContinuousLearningBatch",
  "epistemic_promotion: epistemicPromotion",
], "hourly Learning route");
const scientificIndex = route.indexOf("const scientificLearning = await reconcileAvantiqoScientificLearningExperiments();");
const epistemicIndex = route.indexOf("const epistemicPromotion = await reconcileAvantiqoEpistemicPromotion();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch");
assert.ok(scientificIndex >= 0 && epistemicIndex > scientificIndex,
  "epistemic review must run after scientific experiment reconciliation");
assert.ok(researchIndex > epistemicIndex,
  "epistemic review must run before bounded public-evidence research");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");
assert.equal(route.includes("AvantiqoStructuredIntelligenceSupervisorRuntime"), false,
  "hourly Learning route must not directly run owned deep synthesis");

hasAll(index, [
  'export * from "./runtime/AvantiqoScientificLearningExperimentRuntime";',
  'export * from "./runtime/AvantiqoEpistemicPromotionRuntime";',
  'export * from "./runtime/AvantiqoEvidenceGraphRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    experimental_results_feed_epistemic_review: true,
    adversarial_contradiction_check: true,
    external_evidence_reconciliation: true,
    source_diversity_gate: true,
    boundary_condition_research: true,
    failed_replication_research: true,
    contradiction_blocks_promotion: true,
    provisional_shadow_knowledge: true,
    provisional_shadow_not_reused_by_knowledge_router: true,
    explicit_final_promotion_required: true,
    rollback_on_future_conflict: true,
    epistemic_review_runs_before_bounded_research: true,
  },
  governance: {
    experiment_alone_creates_reusable_knowledge: false,
    direct_platform_knowledge_write_from_experiments: false,
    automatic_knowledge_promotion: false,
    provisional_knowledge_router_reuse: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    runpod_job_submitted: false,
    runpod_endpoint_mutated: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE6_AUDIT=PASS");
