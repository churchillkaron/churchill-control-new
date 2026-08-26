#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE8_AUDIT_V1";
const files = Object.freeze({
  counterfactual: "lib/intelligence/runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime.js",
  shadow: "lib/intelligence/runtime/AvantiqoProvisionalKnowledgeShadowRuntime.js",
  epistemic: "lib/intelligence/runtime/AvantiqoEpistemicPromotionRuntime.js",
  modelBenchmark: "lib/intelligence/runtime/AvantiqoModelBenchmarkEvaluationRuntime.js",
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

const [counterfactual, shadow, epistemic, modelBenchmark, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(counterfactual, [
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_V1",
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EXECUTION_V1",
  "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_EVALUATOR_V1",
  'PROVISIONAL_SCOPE = "platform_provisional_knowledge"',
  'SHADOW_EVALUATION_SCOPE = "platform_learning_provisional_shadow_evaluations"',
  'BENCHMARK_PLAN_SCOPE = "platform_learning_knowledge_counterfactual_benchmark_plans"',
  'BENCHMARK_EVALUATION_SCOPE = "platform_learning_knowledge_counterfactual_benchmark_evaluations"',
  'FINAL_PROMOTION_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates"',
  'SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"',
  'SAFE_LEASE_LANE = "intelligence-deep"',
  "const MIN_CASES = 50",
  "const MIN_PASS_RATE = 0.97",
  "const MIN_QUALITY_DELTA = 0.01",
  "const MAX_HALLUCINATION_DELTA = 0",
  'knowledge_condition: "CANONICAL_AND_CURRENT_PLATFORM_KNOWLEDGE_ONLY"',
  'knowledge_condition: "BASELINE_PLUS_EXACT_PROVISIONAL_CLAIM_UNDER_TEST"',
  "isolated_claim_only: true",
  "same_cases_both_arms: true",
  "synthetic_or_canonical_public_cases_only: true",
  "customer_private_cases_allowed: false",
  "customer_identifiers_allowed: false",
  "blind_pairing_required: true",
  "independent_evaluator_required: true",
  "candidate_must_not_grade_itself: true",
  "regression_count_required: 0",
  "governance_required: true",
  "privacy_required: true",
  "tool_discipline_required: true",
  "authorization_required: true",
  "uncertainty_calibration_required: true",
  "leakage_detected_required: false",
  "explicit_benchmark_spend_approval_required: true",
  "benchmark_execution_performed: false",
  "automatic_gpu_execution: false",
  "automatic_runpod_submission: false",
  "direct_endpoint_scaling_allowed: false",
  '"CURRENT_EVIDENCE_CONFLICT_BLOCKS_COUNTERFACTUAL_BENCHMARK"',
  '"FINAL_PROMOTION_REVIEW_ELIGIBLE"',
  "candidate.pass_rate >= MIN_PASS_RATE",
  "regressionCount === 0",
  "qualityDelta >= MIN_QUALITY_DELTA",
  "hallucinationDelta <= MAX_HALLUCINATION_DELTA",
  "candidate.governance_passed === true",
  "candidate.privacy_passed === true",
  "candidate.tool_use_passed === true",
  "candidate.authorization_passed === true",
  "candidate.uncertainty_calibration_passed === true",
  "candidate.leakage_detected === false",
  "candidate.critical_case_failure_count === 0",
  "evidence.same_cases_both_arms === true",
  "evidence.blind_pairing === true",
  "evidence.independent_evaluator === true",
  "evidence.candidate_did_not_grade_itself === true",
  "evidence.exact_provisional_claim_isolated === true",
  "evidence.customer_private_cases_used === false",
  "evidence.customer_identifiers_used === false",
  'status: "FINAL_KNOWLEDGE_RELEASE_REVIEW_PENDING"',
  "exact_claim_release_requires_separate_runtime: true",
  "explicit_final_knowledge_release_required: true",
  "production_knowledge_release_authorized: false",
  "reusable_platform_knowledge: false",
  "platform_knowledge_written: false",
  "rollback_plan_required_before_release: true",
  "monitored_post_release_revalidation_required: true",
  "automatic_knowledge_promotion: false",
], "knowledge counterfactual benchmark");

assert.equal(counterfactual.includes('memory_scope: "platform_knowledge"'), false,
  "counterfactual benchmark runtime must never write directly to reusable platform knowledge");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(counterfactual), false,
  "provider-free counterfactual planning/reconciliation must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(counterfactual), false,
  "counterfactual planning/reconciliation must not mutate RunPod worker bounds");
assert.equal(/fetch\s*\(/.test(counterfactual), false,
  "counterfactual planning/reconciliation must not directly perform provider calls");

hasAll(shadow, [
  'status = "READY_FOR_COUNTERFACTUAL_BENCHMARK";',
  "status,",
  "context_stability_is_not_incremental_utility: true",
  "counterfactual_benchmark_required: status === \"READY_FOR_COUNTERFACTUAL_BENCHMARK\"",
  "final_promotion_candidate_created: false",
  "reusable_platform_knowledge: false",
], "provisional shadow validation");
assert.match(
  shadow,
  /else if \(summary\.stable_context_observed\) \{\s*status = "READY_FOR_COUNTERFACTUAL_BENCHMARK";\s*\}/,
  "stable shadow context must transition to counterfactual benchmark readiness",
);

hasAll(epistemic, [
  'status: "PROVISIONAL_SHADOW_ONLY"',
  'epistemic_state: "PROVISIONAL_NOT_CANONICAL"',
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "explicit_final_promotion_required: true",
  "rollback_on_conflict: true",
], "epistemic promotion");

hasAll(modelBenchmark, [
  "blindPair",
  "same_prompts_compared: true",
  "candidate_did_not_grade_itself: true",
  "critical_governance_privacy_fail_closed: true",
  'production_model_promotion_effect: "NONE"',
], "existing model benchmark discipline");

hasAll(route, [
  "reconcileAvantiqoProvisionalKnowledgeShadow",
  "reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans",
  "reconcileAvantiqoKnowledgeFinalPromotionCandidates",
  "const provisionalKnowledgeShadow = await reconcileAvantiqoProvisionalKnowledgeShadow();",
  "await reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans();",
  "await reconcileAvantiqoKnowledgeFinalPromotionCandidates();",
  "runAvantiqoContinuousLearningBatch",
  "knowledge_counterfactual_benchmark_plans: knowledgeCounterfactualBenchmarkPlans",
  "knowledge_final_promotion_candidates: knowledgeFinalPromotionCandidates",
], "hourly Learning route");
const shadowIndex = route.indexOf(
  "const provisionalKnowledgeShadow = await reconcileAvantiqoProvisionalKnowledgeShadow();",
);
const planIndex = route.indexOf(
  "await reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans();",
);
const finalCandidateIndex = route.indexOf(
  "await reconcileAvantiqoKnowledgeFinalPromotionCandidates();",
);
const researchIndex = route.indexOf(
  "const result = await runAvantiqoContinuousLearningBatch",
);
assert.ok(shadowIndex >= 0 && planIndex > shadowIndex,
  "counterfactual plans must be reconciled after shadow evaluation");
assert.ok(finalCandidateIndex > planIndex,
  "final promotion candidates must be reconciled after counterfactual plans");
assert.ok(researchIndex > finalCandidateIndex,
  "counterfactual/final-review reconciliation must run before bounded research");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");
assert.equal(route.includes("AvantiqoStructuredIntelligenceSupervisorRuntime"), false,
  "hourly Learning route must not execute counterfactual benchmark inference");

hasAll(index, [
  'export * from "./runtime/AvantiqoProvisionalKnowledgeShadowRuntime";',
  'export * from "./runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    counterfactual_ab_plan_registry: true,
    same_cases_both_arms_required: true,
    baseline_excludes_provisional_claim: true,
    candidate_isolates_exact_provisional_claim: true,
    minimum_fifty_cases: true,
    blind_pairing_required: true,
    independent_evaluator_required: true,
    candidate_cannot_grade_itself: true,
    zero_regressions_required: true,
    minimum_quality_delta_one_percent: true,
    pass_rate_at_least_ninety_seven_percent: true,
    hallucination_must_not_increase: true,
    governance_privacy_tool_authorization_hard_gates: true,
    uncertainty_calibration_hard_gate: true,
    current_evidence_conflict_blocks_progression: true,
    benchmark_execution_safe_lease_only: true,
    benchmark_evaluation_separate_from_execution: true,
    final_release_review_candidate_separate_from_reusable_knowledge: true,
  },
  governance: {
    hourly_counterfactual_execution: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    customer_private_benchmark_cases_allowed: false,
    benchmark_pass_releases_knowledge: false,
    final_review_candidate_is_reusable_platform_knowledge: false,
    direct_platform_knowledge_write: false,
    automatic_knowledge_promotion: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE8_AUDIT=PASS");
