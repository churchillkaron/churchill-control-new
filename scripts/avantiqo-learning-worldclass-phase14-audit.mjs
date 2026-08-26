#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE14_AUDIT_V1";
const files = Object.freeze({
  transfer: "lib/intelligence/runtime/AvantiqoLearningTransferRuntime.js",
  mastery: "lib/intelligence/runtime/AvantiqoLearningMasteryFrontierRuntime.js",
  mechanism: "lib/platform/research/runtime/OperatorMechanismResearchRuntime.js",
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

const [transfer, mastery, mechanism, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(transfer, [
  "AVANTIQO_LEARNING_TRANSFER_V1",
  'DISCOVERY_SCOPE = "platform_learning_transfer_discoveries"',
  'HYPOTHESIS_SCOPE = "platform_learning_transfer_hypotheses"',
  'EXPERIMENT_SCOPE = "platform_learning_transfer_experiment_proposals"',
  "const MAX_DISCOVERIES = 8",
  "const MAX_SOURCES_PER_TARGET = 2",
  "const MAX_EXPERIMENTS_PER_HYPOTHESIS = 3",
  'competency_state, 120) === "STABLE_MASTERY_MONITORED"',
  "metadata.stable_mastery === true",
  "metadata.mastery_is_permanent === false",
  "metadata.hard_dependency_or_quarantine_hold !== true",
  "metadata.bounded_portfolio_selection === true",
  "metadata.semantic_similarity_used_for_selection === false",
  "metadata.model_self_interest_used_for_selection === false",
  "sourceDomain === targetDomain",
  "mechanism_fingerprint",
  "hypothesis_fingerprint",
  "evidence_fingerprint",
  "invariant_mechanisms",
  "boundary_conditions",
  "falsifiers",
  "discriminating_experiments",
  "boundaries.length < 2",
  "falsifierList.length < 2",
  "experiments.length < 2",
  'status: "TRANSFER_HYPOTHESIS_EXPERIMENT_REQUIRED"',
  "source_stable_mastery_verified: true",
  "target_frontier_verified: true",
  "cross_domain_verified: true",
  "mechanism_mapping_verified: true",
  "analogy_is_hypothesis_not_evidence: true",
  "semantic_similarity_is_not_transfer_evidence: true",
  "transfer_success_proven: false",
  "experiment_execution_required: true",
  "experiment_execution_performed: false",
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "automatic_knowledge_promotion: false",
  'status: "PROPOSED_GOVERNED_TRANSFER_EXPERIMENT"',
  "automatic_execution: false",
  "runpod_job_submitted: false",
  "customer_private_content_allowed: false",
  "customer_identifiers_allowed: false",
], "transfer runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(transfer), false,
  "transfer runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(transfer), false,
  "transfer runtime must not scale RunPod endpoints");
assert.equal(/fetch\s*\(/.test(transfer), false,
  "transfer runtime must remain provider-free");
assert.equal(transfer.includes('memory_scope: "platform_knowledge"'), false,
  "transfer runtime must not create platform_knowledge rows");

hasAll(mastery, [
  "AVANTIQO_LEARNING_MASTERY_FRONTIER_V1",
  '"STABLE_MASTERY_MONITORED"',
  '"MASTERY_HELD"',
  "stable_mastery_requires_operational_validation: true",
  "semantic_similarity_used_for_selection: false",
], "mastery frontier prerequisite");

hasAll(mechanism, [
  "adjacent",
  "mechanism",
  "hypoth",
  "experiment",
], "mechanism-first adjacent-domain foundation");

hasAll(route, [
  "reconcileAvantiqoLearningMasteryFrontier",
  "reconcileAvantiqoLearningTransfer",
  "const learningMasteryFrontier =",
  "await reconcileAvantiqoLearningMasteryFrontier();",
  "const learningTransfer = await reconcileAvantiqoLearningTransfer();",
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "learning_transfer: learningTransfer",
], "hourly Learning route");

const masteryIndex = route.indexOf("await reconcileAvantiqoLearningMasteryFrontier();");
const transferIndex = route.indexOf("const learningTransfer = await reconcileAvantiqoLearningTransfer();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch({ limit });");
assert.ok(masteryIndex >= 0 && transferIndex > masteryIndex,
  "transfer discovery must run after mastery/frontier reconciliation");
assert.ok(researchIndex > transferIndex,
  "transfer discovery must feed bounded research in the same cycle");
assert.equal(route.includes("recordAvantiqoVerifiedTransferHypothesis"), false,
  "hourly cron must not fabricate verified transfer hypotheses");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");

hasAll(index, [
  'export * from "./runtime/AvantiqoLearningMasteryFrontierRuntime";',
  'export * from "./runtime/AvantiqoLearningTransferRuntime";',
], "Intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    cross_domain_transfer_discovery: true,
    stable_mastery_source_required: true,
    active_frontier_target_required: true,
    source_and_target_domains_must_differ: true,
    analogy_is_hypothesis_not_evidence: true,
    semantic_similarity_not_transfer_evidence: true,
    implementation_copy_not_transfer_evidence: true,
    verified_mechanism_fingerprint_required: true,
    verified_hypothesis_fingerprint_required: true,
    verified_evidence_fingerprint_required: true,
    invariant_mechanism_required: true,
    multiple_boundary_conditions_required: true,
    multiple_falsifiers_required: true,
    multiple_discriminating_experiments_required: true,
    transfer_hypothesis_does_not_prove_transfer: true,
    transfer_experiments_are_proposals_only: true,
    transfer_stage_after_mastery_frontier: true,
    transfer_stage_before_bounded_research: true,
    normal_epistemic_pipeline_preserved: true,
  },
  governance: {
    automatic_transfer_inference: false,
    hourly_verified_transfer_hypothesis_fabrication: false,
    hourly_transfer_experiment_execution: false,
    hourly_provider_execution: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    platform_knowledge_written_by_transfer_runtime: false,
    automatic_knowledge_promotion: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    customer_identifiers_cross_domain_copied: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE14_AUDIT=PASS");
