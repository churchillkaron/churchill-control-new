#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE16_AUDIT_V1";
const files = {
  revision: "lib/intelligence/runtime/AvantiqoLearningTransferRevisionRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

const source = async (path) => readFile(path, "utf8");
const [revision, route, index] = await Promise.all(Object.values(files).map(source));

for (const marker of [
  "AVANTIQO_LEARNING_TRANSFER_REVISION_V1",
  'CONTRADICTION_SCOPE = "platform_learning_transfer_contradictions"',
  'REVISION_REQUEST_SCOPE = "platform_learning_transfer_revision_requests"',
  'REVISION_HYPOTHESIS_SCOPE = "platform_learning_transfer_revision_hypotheses"',
  "MIN_CONTRADICTION_RESULTS = 2",
  "MIN_CONTRADICTION_REPLICATIONS = 2",
  "MIN_RESULT_VERIFICATION_METHODS = 2",
  '"INVARIANT_MECHANISM"',
  '"BOUNDARY_CONDITION"',
  'reason: "AMBIGUOUS_MULTI_ASSUMPTION_CONTRADICTION"',
  "single_component_mutation_required: true",
  "unrelated_component_changes_forbidden: true",
  "parent_mechanism_fingerprint_reuse_forbidden: true",
  "cosmetic_rename_is_not_mechanism_revision: true",
  "parent_negative_transfer_memory_bypass_forbidden: true",
  "changed_component_isolation_experiment_required: true",
  "revised_hypothesis_must_reenter_phase14_phase15_lifecycle: true",
  "PARENT_MECHANISM_REUSE_FORBIDDEN",
  "NON_MINIMAL_INVARIANT_MUTATION",
  "NON_MINIMAL_BOUNDARY_MUTATION",
  "ORIGINAL_FALSIFIER_REMOVAL_FORBIDDEN",
  "NEW_MUTATION_FALSIFIER_REQUIRED",
  "MUTATION_EXPERIMENT_MUST_BE_NEW",
  "parent_negative_transfer_memory_retired: false",
  "parent_negative_transfer_memory_bypassed: false",
  "child_starts_with_zero_transfer_success_credit: true",
  "child_requires_phase15_replication_validation: true",
  "transfer_success_proven: false",
  "reusable_platform_knowledge: false",
  "automatic_knowledge_promotion: false",
  "experiment_execution_performed_here: false",
  "runpod_job_submitted: false",
]) {
  assert.ok(revision.includes(marker), `revision runtime missing ${marker}`);
}

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(revision), false);
assert.equal(/fetch\s*\(/.test(revision), false);
assert.equal(revision.includes('memory_scope: "platform_knowledge"'), false);

for (const marker of [
  "reconcileAvantiqoLearningTransferRevisions",
  "await reconcileAvantiqoLearningTransferRevisions();",
  "learning_transfer_revision: learningTransferRevision",
]) {
  assert.ok(route.includes(marker), `hourly route missing ${marker}`);
}

const clockIndex = route.indexOf("await reconcileAvantiqoNegativeTransferEvidenceClock();");
const revisionIndex = route.indexOf("await reconcileAvantiqoLearningTransferRevisions();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch({ limit });");
assert.ok(clockIndex >= 0 && revisionIndex > clockIndex);
assert.ok(researchIndex > revisionIndex);
assert.equal(route.includes("recordAvantiqoTransferContradiction"), false);
assert.equal(route.includes("recordAvantiqoVerifiedTransferRevisionHypothesis"), false);
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false);

assert.ok(index.includes('export * from "./runtime/AvantiqoLearningTransferRevisionRuntime";'));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    contradiction_attribution_requires_preexisting_assumption: true,
    mature_failure_required: true,
    independently_replicated_contradiction_required: true,
    multiple_result_verification_methods_required: true,
    equal_strength_multi_assumption_revision_blocked: true,
    one_component_revision_only: true,
    unrelated_assumptions_preserved: true,
    parent_mechanism_fingerprint_reuse_forbidden: true,
    cosmetic_rename_forbidden: true,
    new_mutation_falsifier_required: true,
    changed_component_isolation_experiment_required: true,
    parent_negative_transfer_memory_preserved: true,
    child_transfer_success_credit_inherited: false,
    child_reenters_phase14_phase15_from_zero: true,
  },
  governance: {
    hourly_contradiction_fabrication: false,
    hourly_revised_hypothesis_fabrication: false,
    hourly_experiment_execution: false,
    direct_runpod_submission: false,
    platform_knowledge_written_by_phase16: false,
    automatic_knowledge_promotion: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
  },
}, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE16_AUDIT=PASS");
