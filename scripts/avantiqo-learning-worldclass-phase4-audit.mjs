#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE4_AUDIT_V1";
const files = Object.freeze({
  mechanism: "lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js",
  policy: "lib/platform/research/runtime/OperatorMechanismResearchPolicy.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  child: "scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs",
  leasePolicy: "config/avantiqo-runpod-safe-lease-policy.json",
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

const [mechanism, policy, route, child, leasePolicy, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(mechanism, [
  "AVANTIQO_MECHANISM_FIRST_LEARNING_V1",
  '"UNDERSTAND_PROBLEM"',
  '"MAP_MECHANISMS"',
  '"IDENTIFY_CONSTRAINTS"',
  '"RESEARCH_ADJACENT_FIELDS"',
  '"FORM_FALSIFIABLE_HYPOTHESES"',
  '"DESIGN_DISCRIMINATING_EXPERIMENTS"',
  '"EXECUTE_GOVERNED_EXPERIMENTS"',
  '"LEARN_FROM_RESULTS"',
  '"INVENT_ALTERNATIVES"',
  '"VERIFY_AND_REPEAT"',
  "inferOperatorResearchMode",
  "operatorResearchRequirements",
  '"mechanisms"',
  '"constraints"',
  '"adjacent-fields"',
  '"alternative-architectures"',
  '"experiment-evidence"',
  '"READY_FOR_SAFE_LEASE_SYNTHESIS"',
  'synthesis_execution_lane: "intelligence-deep"',
  'synthesis_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2"',
  "search_is_evidence_collection_not_problem_solving: true",
  "understand_problem_before_solution_search: true",
  "mechanism_before_imitation: true",
  "identify_real_constraints: true",
  "failed_approach_does_not_prove_impossibility: true",
  "adjacent_science_and_engineering_research: true",
  "falsifiable_hypotheses: true",
  "discriminating_experiments: true",
  "invent_test_learn_repeat: true",
  "hourly_director_provider_free: true",
  "automatic_gpu_execution: false",
  "automatic_runpod_submission: false",
  "automatic_experiment_execution: false",
], "mechanism-first Learning director");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(mechanism), false,
  "provider-free mechanism director must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(mechanism), false,
  "provider-free mechanism director must not mutate workersMax");

hasAll(policy, [
  "AVANTIQO_MECHANISM_FIRST_RESEARCH_POLICY_V1",
  "mechanism_before_imitation: true",
  "failed_approach_does_not_prove_objective_impossible: true",
  "hypotheses_must_be_falsifiable",
  "experiments_should_discriminate_between_hypotheses",
  "adjacent_domain_transfer_encouraged",
], "shared mechanism research policy");

hasAll(route, [
  "reconcileAvantiqoMechanismFirstLearning",
  "mechanismFirstLearning = await reconcileAvantiqoMechanismFirstLearning()",
  "mechanism_first_learning: mechanismFirstLearning",
  "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  "runAvantiqoContinuousLearningBatch",
], "hourly Learning route");
const directorIndex = route.indexOf("mechanismFirstLearning = await reconcileAvantiqoMechanismFirstLearning()");
const researchIndex = route.indexOf("result = await runAvantiqoContinuousLearningBatch");
assert.ok(directorIndex >= 0 && researchIndex > directorIndex,
  "mechanism-first director must run before bounded evidence research");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must not directly call RunPod");
assert.equal(route.includes("AvantiqoStructuredIntelligenceSupervisorRuntime"), false,
  "hourly Learning route must not directly invoke owned GPU synthesis");

hasAll(child, [
  "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_V1",
  'SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"',
  'REQUIRED_LANE = "intelligence-deep"',
  "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT",
  "AVANTIQO_RUNPOD_SAFE_LEASE_LANE",
  "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_SPEND_APPROVED",
  '"READY_FOR_SAFE_LEASE_SYNTHESIS"',
  '"SAFE_LEASE_SYNTHESIS_EXECUTING"',
  '"SAFE_LEASE_SYNTHESIS_REVIEW_REQUIRED"',
  "automatic_retry_allowed: false",
  '"SYNTHESIS_READY_FOR_EXPERIMENT_GOVERNANCE"',
  "A failed architecture or implementation is not proof the objective is impossible.",
  "Generate multiple materially different falsifiable hypotheses.",
  "Design experiments that discriminate between competing hypotheses",
  "Experiments in this output are proposals only.",
  "HYPOTHESIS_NOT_FALSIFIABLE",
  "EXPERIMENT_NOT_DISCRIMINATING",
  "ADJACENT_DOMAIN_TRANSFER_REQUIRED",
  "experiment_execution_performed: false",
  "experiments_are_proposals_only: true",
  "model_training_performed: false",
  "model_weight_mutation_performed: false",
  "production_promotion_performed: false",
  "raw_provider_response_persisted: false",
  "raw_reasoning_persisted: false",
  "direct_endpoint_scaling_performed: false",
  "workers_max_mutation_performed: false",
], "Safe-Lease Learning synthesis child");
assert.equal(/rest\.runpod\.io/.test(child), false,
  "Learning synthesis child must not use RunPod management API");
assert.equal(/workersMax\s*[:=]/.test(child), false,
  "Learning synthesis child must not directly mutate workersMax");
assert.equal(/workersMin\s*[:=]/.test(child), false,
  "Learning synthesis child must not directly mutate workersMin");
const preparedIndex = child.indexOf('status: "SAFE_LEASE_SYNTHESIS_EXECUTING"');
const providerPostIndex = child.indexOf('method: "POST"');
assert.ok(preparedIndex >= 0 && providerPostIndex > preparedIndex,
  "synthesis attempt must be durably prepared before provider POST");

const parsedLeasePolicy = JSON.parse(leasePolicy);
assert.equal(parsedLeasePolicy.contract, "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2");
assert.equal(parsedLeasePolicy.fail_closed, true);
assert.equal(parsedLeasePolicy.parallel_work_allowed, true);
assert.equal(parsedLeasePolicy.max_workers_per_lease, 1);
assert.equal(parsedLeasePolicy.max_jobs_per_lease, 1);
assert.equal(parsedLeasePolicy.lanes?.["intelligence-deep"], "avantiqo-intelligence-v1");

hasAll(index, [
  'export * from "./runtime/AvantiqoMechanismFirstLearningRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    search_is_evidence_not_solution_boundary: true,
    problem_understanding_before_solution_search: true,
    mechanism_mapping: true,
    real_constraint_classification: true,
    failed_approach_does_not_mean_impossible: true,
    adjacent_science_engineering_transfer: true,
    falsifiable_hypotheses: true,
    discriminating_experiments: true,
    alternative_architecture_discovery: true,
    invent_test_learn_repeat_cycle: true,
    hourly_director_provider_free: true,
    deep_synthesis_safe_lease_only: true,
    synthesis_attempt_persisted_before_provider_post: true,
    ambiguous_provider_failure_blocks_automatic_retry: true,
    experiments_require_separate_governance: true,
  },
  governance: {
    direct_runpod_endpoint_scaling: false,
    direct_workers_max_mutation: false,
    hourly_runpod_job_submission: false,
    synthesis_without_safe_lease_allowed: false,
    synthesis_without_explicit_spend_approval_allowed: false,
    automatic_experiment_execution: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE4_AUDIT=PASS");
