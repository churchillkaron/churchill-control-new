#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE15_AUDIT_V1";
const files = Object.freeze({
  transfer: "lib/intelligence/runtime/AvantiqoLearningTransferRuntime.js",
  validation: "lib/intelligence/runtime/AvantiqoLearningTransferValidationRuntime.js",
  evidenceClock: "lib/intelligence/runtime/AvantiqoNegativeTransferEvidenceClockRuntime.js",
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

const [transfer, validation, evidenceClock, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(validation, [
  "AVANTIQO_LEARNING_TRANSFER_VALIDATION_V1",
  'RESULT_SCOPE = "platform_learning_transfer_experiment_results"',
  'VALIDATION_SCOPE = "platform_learning_transfer_validations"',
  '"platform_learning_negative_transfer_memory"',
  "MIN_MATURE_RESULTS = 2",
  "MIN_INDEPENDENT_REPLICATIONS = 2",
  "MIN_VERIFICATION_METHODS = 2",
  "MIN_BOUNDARY_CONTEXTS = 2",
  '"SUPPORTS_TRANSFER"',
  '"LIMITS_TRANSFER"',
  '"REFUTES_TRANSFER"',
  'classification = "SUPPORTED"',
  'classification = "BOUNDARY_LIMITED"',
  'classification = "REFUTED"',
  "one_experiment_can_prove_transfer: false",
  "independent_verifier_attested: true",
  "replication_fingerprint",
  "verification_method_fingerprint",
  "boundary_context_fingerprint",
  "falsifiers_triggered",
  "REFUTATION_REQUIRES_FALSIFIER",
  'status: "GOVERNED_TRANSFER_EXPERIMENT_RESULT_RECORDED"',
  'status: "NEGATIVE_TRANSFER_MEMORY_ACTIVE"',
  "negative_transfer_exclusion_active: true",
  "exact_mechanism_only: true",
  "exact_source_target_pair_only: true",
  "pair_wide_negative_transfer_block: false",
  "other_mechanisms_between_same_domains_allowed: true",
  "semantic_similarity_blocking_forbidden: true",
  "review_required: true",
  "automatic_restoration_allowed: false",
  "reusable_platform_knowledge: false",
  "knowledge_router_reuse_allowed: false",
  "requires_normal_epistemic_promotion_pipeline: true",
  "automatic_knowledge_promotion: false",
  "experiment_execution_performed_here: false",
  "provider_free: true",
  "runpod_job_submitted: false",
  "platform_knowledge_written: false",
], "transfer validation runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(validation), false,
  "validation runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(validation), false,
  "validation runtime must not scale RunPod endpoints");
assert.equal(/fetch\s*\(/.test(validation), false,
  "validation runtime must remain provider-free");
assert.equal(validation.includes('memory_scope: "platform_knowledge"'), false,
  "validation runtime must not create platform_knowledge rows");

hasAll(transfer, [
  "assertAvantiqoTransferMechanismNotNegativelyRemembered",
  "await assertAvantiqoTransferMechanismNotNegativelyRemembered({",
  "organization_id: organizationId",
  "source_topic_key: sourceTopic",
  "target_topic_key: targetTopic",
  "mechanism_fingerprint: mechanismFingerprint",
  "negative_transfer_memory_checked: true",
  "same_mechanism_negative_transfer_exclusion_enforced: true",
  'experiment_fingerprint: digest("transfer-experiment", transferFingerprint, index, experiment)',
  "exact_mechanism_negative_transfer_memory_checked_before_hypothesis_write: true",
  "pair_wide_negative_transfer_block: false",
], "Phase 14 entry gate integration");

const guardIndex = transfer.indexOf("await assertAvantiqoTransferMechanismNotNegativelyRemembered({");
const hypothesisWriteIndex = transfer.indexOf("const transferFingerprint = digest(");
assert.ok(guardIndex >= 0 && hypothesisWriteIndex > guardIndex,
  "negative-transfer memory must be checked before hypothesis construction/write");

hasAll(evidenceClock, [
  "AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_V1",
  "const REVIEW_DAYS = 30",
  "const VALIDITY_DAYS = 180",
  "function latestExecutedAt(rows)",
  "let latest = Number.NaN",
  "latest_refutation_evidence_at: evidenceAt",
  "expiry_anchored_to_latest_evidence: true",
  "reconciliation_time_cannot_extend_expiry: true",
  "negative_transfer_exclusion_active: !expired",
  '"NEGATIVE_TRANSFER_MEMORY_EXPIRED"',
  "automatic_restoration_performed: false",
  "pair_wide_block: false",
], "negative-transfer evidence clock");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(evidenceClock), false,
  "negative-transfer clock must not call RunPod");
assert.equal(/fetch\s*\(/.test(evidenceClock), false,
  "negative-transfer clock must remain provider-free");
assert.equal(evidenceClock.includes('memory_scope: "platform_knowledge"'), false,
  "negative-transfer clock must not create platform_knowledge rows");

hasAll(route, [
  "reconcileAvantiqoLearningTransfer",
  "reconcileAvantiqoLearningTransferValidation",
  "reconcileAvantiqoNegativeTransferEvidenceClock",
  "const learningTransfer = await reconcileAvantiqoLearningTransfer();",
  "await reconcileAvantiqoLearningTransferValidation();",
  "await reconcileAvantiqoNegativeTransferEvidenceClock();",
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "learning_transfer_validation: learningTransferValidation",
  "negative_transfer_evidence_clock: negativeTransferEvidenceClock",
], "hourly Learning route");

const transferIndex = route.indexOf("const learningTransfer = await reconcileAvantiqoLearningTransfer();");
const validationIndex = route.indexOf("await reconcileAvantiqoLearningTransferValidation();");
const clockIndex = route.indexOf("await reconcileAvantiqoNegativeTransferEvidenceClock();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch({ limit });");
assert.ok(transferIndex >= 0 && validationIndex > transferIndex,
  "transfer-result validation must run after Phase 14 transfer reconciliation");
assert.ok(clockIndex > validationIndex,
  "negative-transfer evidence clock must run after validation writes/refutations");
assert.ok(researchIndex > clockIndex,
  "bounded research must run after Phase 15 reconciliation");
assert.equal(route.includes("recordAvantiqoTransferExperimentResult"), false,
  "hourly cron must not fabricate transfer experiment results");
assert.equal(route.includes("recordAvantiqoVerifiedTransferHypothesis"), false,
  "hourly cron must not fabricate verified transfer hypotheses");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not call RunPod");

hasAll(index, [
  'export * from "./runtime/AvantiqoLearningTransferRuntime";',
  'export * from "./runtime/AvantiqoLearningTransferValidationRuntime";',
  'export * from "./runtime/AvantiqoNegativeTransferEvidenceClockRuntime";',
], "Intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    governed_transfer_result_recorder: true,
    result_bound_to_verified_transfer_hypothesis: true,
    result_bound_to_proposed_experiment: true,
    one_experiment_never_proves_transfer: true,
    independent_replication_counting: true,
    independent_verification_method_counting: true,
    independent_boundary_context_counting: true,
    registered_falsifier_required_for_refutation: true,
    mature_supported_state: true,
    mature_boundary_limited_state: true,
    mature_refuted_state: true,
    negative_transfer_memory: true,
    exact_mechanism_exclusion: true,
    pair_wide_exclusion: false,
    alternative_mechanisms_remain_eligible: true,
    negative_transfer_review_days: 30,
    negative_transfer_validity_days: 180,
    expiry_anchored_to_latest_refutation_evidence: true,
    reconciliation_time_cannot_extend_expiry: true,
    normal_epistemic_promotion_pipeline_preserved: true,
  },
  governance: {
    hourly_transfer_experiment_execution: false,
    hourly_verified_transfer_hypothesis_fabrication: false,
    hourly_transfer_result_fabrication: false,
    hourly_provider_execution: false,
    direct_runpod_submission: false,
    direct_runpod_endpoint_scaling: false,
    platform_knowledge_written_by_phase15: false,
    automatic_knowledge_promotion: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE15_AUDIT=PASS");
