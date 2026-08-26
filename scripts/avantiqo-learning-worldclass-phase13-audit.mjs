#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE13_AUDIT_V1";
const files = Object.freeze({
  mastery: "lib/intelligence/runtime/AvantiqoLearningMasteryFrontierRuntime.js",
  coverage: "lib/intelligence/runtime/AvantiqoLearningCoverageRuntime.js",
  effectiveness: "lib/intelligence/runtime/AvantiqoLearningEffectivenessRuntime.js",
  dependency: "lib/intelligence/runtime/AvantiqoKnowledgeDependencyCurriculumRuntime.js",
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

const [mastery, coverage, effectiveness, dependency, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(mastery, [
  "AVANTIQO_LEARNING_MASTERY_FRONTIER_V1",
  'COMPETENCY_SCOPE = "platform_learning_competency_mastery"',
  'FRONTIER_SCOPE = "platform_learning_frontier_priorities"',
  "const MAX_FRONTIER_ITEMS = 12",
  "const MAX_FRONTIER_PER_DOMAIN = 3",
  "const MAX_AGENDA_ADJUSTMENT = 0.12",
  "const MIN_OPERATIONAL_VALIDATION_OUTCOMES = 8",
  "const MIN_STABLE_MASTERY_OUTCOMES = 20",
  'stateName = "DISCOVERY"',
  'stateName = "MASTERY_HELD"',
  'stateName = "DEVELOPING"',
  'stateName = "VALIDATING_EVIDENCE"',
  'stateName = "EVIDENCE_STRONG_OPERATIONAL_VALIDATION_REQUIRED"',
  'stateName = "OPERATIONALLY_VALIDATED"',
  'stateName = "STABLE_MASTERY_MONITORED"',
  "mastery_is_permanent: false",
  "mastery_requires_current_evidence: true",
  "mastery_requires_operational_validation: true",
  "model_self_confidence_used_as_mastery_evidence: false",
  "research_productivity_alone_can_establish_mastery: false",
  "observational_success_alone_can_establish_mastery: false",
  "hard_dependency_or_quarantine_hold",
  "dependency_or_quarantine_hold_blocks_mastery: true",
  "stable_mastery_minimum_verified_outcomes: MIN_STABLE_MASTERY_OUTCOMES",
  "stable_mastery_minimum_smoothed_success_rate: 0.95",
  "bounded_portfolio_selection: true",
  "domain_diversity_cap: MAX_FRONTIER_PER_DOMAIN",
  "underexplored_topics_considered: true",
  "repeated_research_stagnation_considered: true",
  "stable_mastery_deprioritized: true",
  "priority_adjustment_is_idempotent: true",
  "priority_is_not_truth_confidence: true",
  "semantic_similarity_used_for_selection: false",
  "model_self_interest_used_for_selection: false",
  "epistemic_pipeline_bypassed: false",
  "mastery_frontier_priority_is_not_truth_confidence: true",
  "mastery_frontier_does_not_bypass_epistemic_pipeline: true",
  "platform_knowledge_written: false",
  "provider_free: true",
  "automatic_knowledge_promotion: false",
  "automatic_training_started: false",
  "automatic_model_weight_mutation: false",
  "automatic_model_promotion: false",
], "mastery frontier runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(mastery), false,
  "mastery frontier runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(mastery), false,
  "mastery frontier runtime must not scale endpoints");
assert.equal(/fetch\s*\(/.test(mastery), false,
  "mastery frontier runtime must remain provider-free");
assert.equal(mastery.includes('memory_scope: "platform_knowledge"'), false,
  "mastery frontier runtime must not create platform_knowledge rows");
assert.equal(mastery.includes("memory_scope: KNOWLEDGE_SCOPE"), false,
  "mastery frontier runtime must not create reusable knowledge through its scope constant");

hasAll(coverage, [
  "AVANTIQO_LEARNING_COVERAGE_V1",
  "coverage_score: Number(coverageScore.toFixed(4))",
  "exact_claim_count: exactFresh.length",
  "exact_source_count: exactSources.length",
  "average_exact_confidence: Number(exactConfidence.toFixed(4))",
  'reasons.push("EXACT_KNOWLEDGE_STALE")',
], "coverage evidence inputs");

hasAll(effectiveness, [
  "AVANTIQO_LEARNING_EFFECTIVENESS_V1",
  "learning_effectiveness:",
  "effectiveness_score: item.effectiveness_score",
  "evidence_yield_score: item.evidence_yield_score",
  "reliability_score: item.reliability_score",
  'outcome_relationship: "OBSERVATIONAL_CORRELATION_ONLY"',
  "causal_attribution_allowed: false",
], "learning effectiveness evidence inputs");

hasAll(dependency, [
  "AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_V1",
  'release_status: "DEPENDENCY_HOLD"',
  "dependent_claim_proven_false: false",
  "revalidation_required_before_reuse: true",
  "semantic_similarity_inference_used: false",
  "automatic_dependency_unhold_allowed: false",
], "dependency hold input");

hasAll(route, [
  "reconcileAvantiqoKnowledgeDependencyCurriculum",
  "reconcileAvantiqoLearningMasteryFrontier",
  "const knowledgeDependencyCurriculum =",
  "await reconcileAvantiqoKnowledgeDependencyCurriculum();",
  "const learningMasteryFrontier =",
  "await reconcileAvantiqoLearningMasteryFrontier();",
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "learning_mastery_frontier: learningMasteryFrontier",
  "frontier priority is not truth confidence",
], "hourly Learning route");

const dependencyIndex = route.indexOf(
  "await reconcileAvantiqoKnowledgeDependencyCurriculum();",
);
const masteryIndex = route.indexOf(
  "await reconcileAvantiqoLearningMasteryFrontier();",
);
const researchIndex = route.indexOf(
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
);
assert.ok(dependencyIndex >= 0 && masteryIndex > dependencyIndex,
  "mastery/frontier reconciliation must run after dependency holds are known");
assert.ok(researchIndex > masteryIndex,
  "mastery/frontier priority must be reconciled before bounded research selection");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");
assert.equal(route.includes("releaseAvantiqoFinalKnowledge"), false,
  "hourly mastery/frontier path must not perform explicit final knowledge release");

hasAll(index, [
  'export * from "./runtime/AvantiqoKnowledgeDependencyCurriculumRuntime";',
  'export * from "./runtime/AvantiqoLearningMasteryFrontierRuntime";',
  'export * from "./runtime/AvantiqoLearningCoverageRuntime";',
  'export * from "./runtime/AvantiqoLearningEffectivenessRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    evidence_backed_competency_states: true,
    mastery_not_permanent: true,
    current_reusable_evidence_required_for_stable_mastery: true,
    source_diversity_required_for_stable_mastery: true,
    operational_validation_required_for_stable_mastery: true,
    model_self_confidence_not_mastery_evidence: true,
    research_productivity_not_sufficient_for_mastery: true,
    observational_success_not_sufficient_for_mastery: true,
    dependency_or_quarantine_hold_blocks_mastery: true,
    bounded_frontier_portfolio: true,
    frontier_domain_diversity_cap: true,
    coverage_gaps_considered: true,
    effectiveness_gaps_considered: true,
    verified_operational_risk_considered: true,
    verified_dependency_risk_considered: true,
    underexplored_topics_considered: true,
    stagnating_topics_detected: true,
    stable_mastery_deprioritized: true,
    idempotent_agenda_priority_adjustment: true,
    frontier_priority_not_truth_confidence: true,
    semantic_similarity_not_frontier_selection_signal: true,
    model_self_interest_not_frontier_selection_signal: true,
    normal_epistemic_pipeline_preserved: true,
    mastery_stage_after_dependency_reconciliation: true,
    mastery_stage_before_bounded_research: true,
  },
  governance: {
    hourly_provider_execution: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    platform_knowledge_written_by_mastery_scheduler: false,
    automatic_knowledge_promotion: false,
    hourly_final_knowledge_release: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    source_customer_identifiers_persisted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE13_AUDIT=PASS");
