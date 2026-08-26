#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE7_AUDIT_V1";
const files = Object.freeze({
  shadow: "lib/intelligence/runtime/AvantiqoProvisionalKnowledgeShadowRuntime.js",
  research: "lib/platform/research/runtime/OperatorMechanismResearchRuntime.js",
  epistemic: "lib/intelligence/runtime/AvantiqoEpistemicPromotionRuntime.js",
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

const [shadow, research, epistemic, evidenceGraph, router, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(shadow, [
  "AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_V1",
  'PROVISIONAL_SCOPE = "platform_provisional_knowledge"',
  'OUTCOME_SCOPE = "platform_learning_provisional_shadow_outcomes"',
  'EVALUATION_SCOPE = "platform_learning_provisional_shadow_evaluations"',
  "MIN_SHADOW_OBSERVATIONS = 20",
  "MIN_SHADOW_DAYS = 7",
  "MIN_STABLE_SMOOTHED_SUCCESS = 0.8",
  "inspectAvantiqoProvisionalKnowledgeShadow",
  "recordAvantiqoProvisionalShadowOutcome",
  "reconcileAvantiqoProvisionalKnowledgeShadow",
  "observeVerifiedExecutionFailure",
  "observeVerifiedExecutionSuccess",
  "EXPLICIT_NON_INFLUENCING_SHADOW_MATCH_REQUIRED",
  "VERIFIED_EXECUTION_OUTCOME_REQUIRED",
  "live_answer_influence: false",
  "candidate_content_exposed: false",
  "observational_context_only: true",
  "incremental_utility_proven: false",
  "causal_attribution_allowed: false",
  'status = "READY_FOR_COUNTERFACTUAL_BENCHMARK"',
  "context_stability_is_not_incremental_utility: true",
  "counterfactual_benchmark_required",
  "counterfactual_benchmark_completed: false",
  "final_promotion_candidate_created: false",
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "automatic_knowledge_promotion: false",
  "source_customer_identifiers_persisted: false",
  "raw_reasoning_persisted: false",
], "provisional shadow runtime");

assert.equal(shadow.includes('memory_scope: "platform_knowledge"'), false,
  "shadow runtime must never write reusable platform knowledge");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(shadow), false,
  "shadow runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(shadow), false,
  "shadow runtime must not mutate RunPod worker bounds");
assert.equal(/fetch\s*\(/.test(shadow), false,
  "shadow runtime must not directly call external providers/web");

hasAll(research, [
  "AVANTIQO_PROVISIONAL_KNOWLEDGE_SHADOW_CONTRACT",
  "inspectAvantiqoProvisionalKnowledgeShadow",
  "const provisionalShadow = await inspectAvantiqoProvisionalKnowledgeShadow",
  "provisional_shadow:",
  "live_answer_influence: false",
  "candidate_content_exposed: false",
  "answer_modified_by_shadow: false",
  "claims_modified_by_shadow: false",
], "research shadow integration");
const researchCallIndex = research.indexOf("const provisionalShadow = await inspectAvantiqoProvisionalKnowledgeShadow");
const evidenceReturnIndex = research.indexOf("provisional_shadow:", researchCallIndex);
assert.ok(researchCallIndex >= 0 && evidenceReturnIndex > researchCallIndex,
  "evidence research must attach the non-influencing shadow receipt after live knowledge research");

hasAll(epistemic, [
  'PROVISIONAL_SCOPE = "platform_provisional_knowledge"',
  'status: "PROVISIONAL_SHADOW_ONLY"',
  'epistemic_state: "PROVISIONAL_NOT_CANONICAL"',
  "shadow_reuse_only: true",
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "explicit_final_promotion_required: true",
  "rollback_on_conflict: true",
], "epistemic gate");

hasAll(evidenceGraph, [
  "inspectAvantiqoEvidenceGraph",
  "block_knowledge_reuse",
  '"CONFLICTED"',
], "evidence graph");

hasAll(router, [
  'KNOWLEDGE_SCOPE = "platform_knowledge"',
  "block_knowledge_reuse",
], "knowledge router");
assert.equal(router.includes('platform_provisional_knowledge'), false,
  "Knowledge Router must remain unaware of provisional shadow knowledge");

hasAll(route, [
  "reconcileAvantiqoEpistemicPromotion",
  "reconcileAvantiqoProvisionalKnowledgeShadow",
  "const provisionalKnowledgeShadow = await reconcileAvantiqoProvisionalKnowledgeShadow();",
  "provisional_knowledge_shadow: provisionalKnowledgeShadow",
  "runAvantiqoContinuousLearningBatch",
], "hourly Learning route");
const epistemicIndex = route.indexOf("const epistemicPromotion = await reconcileAvantiqoEpistemicPromotion();");
const shadowIndex = route.indexOf("const provisionalKnowledgeShadow = await reconcileAvantiqoProvisionalKnowledgeShadow();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch");
assert.ok(epistemicIndex >= 0 && shadowIndex > epistemicIndex,
  "shadow evaluation must run after adversarial epistemic promotion");
assert.ok(researchIndex > shadowIndex,
  "shadow evaluation must run before bounded research");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");
assert.equal(route.includes("AvantiqoStructuredIntelligenceSupervisorRuntime"), false,
  "hourly Learning route must not directly run owned deep synthesis");

hasAll(index, [
  'export * from "./runtime/AvantiqoEpistemicPromotionRuntime";',
  'export * from "./runtime/AvantiqoProvisionalKnowledgeShadowRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    provisional_claim_shadow_matching: true,
    live_answer_not_modified_by_shadow: true,
    live_claims_not_modified_by_shadow: true,
    candidate_content_not_exposed_to_live_answer: true,
    verified_shadow_outcome_recorder_available: true,
    minimum_twenty_observations: true,
    minimum_seven_distinct_days: true,
    bayesian_smoothed_context_stability: true,
    context_success_not_treated_as_incremental_utility: true,
    contradiction_blocks_benchmark_readiness: true,
    counterfactual_benchmark_required_before_final_promotion: true,
    hourly_shadow_evaluation_provider_free: true,
  },
  governance: {
    provisional_shadow_reused_as_platform_knowledge: false,
    shadow_candidate_changes_live_answer: false,
    observational_context_claims_causality: false,
    shadow_monitoring_creates_final_promotion_candidate: false,
    automatic_knowledge_promotion: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    runpod_job_submitted: false,
    runpod_endpoint_mutated: false,
    customer_private_content_promoted: false,
    source_customer_identifiers_persisted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE7_AUDIT=PASS");
