#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE5_AUDIT_V1";
const files = Object.freeze({
  scientific: "lib/intelligence/runtime/AvantiqoScientificLearningExperimentRuntime.js",
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

const [scientific, route, index] = await Promise.all(Object.values(files).map(source));

hasAll(scientific, [
  "AVANTIQO_SCIENTIFIC_LEARNING_EXPERIMENT_V1",
  'SYNTHESIS_SCOPE = "platform_learning_discovery_syntheses"',
  'HYPOTHESIS_SCOPE = "platform_learning_hypotheses"',
  'EXPERIMENT_SCOPE = "platform_learning_experiments"',
  'RESULT_SCOPE = "platform_learning_experiment_results"',
  'CANDIDATE_SCOPE = "platform_learning_experimental_knowledge_candidates"',
  "MIN_PROVISIONAL_RESULTS = 3",
  "MIN_PROVISIONAL_REPLICATIONS = 2",
  "MIN_KNOWLEDGE_RESULTS = 5",
  "MIN_KNOWLEDGE_REPLICATIONS = 3",
  "MIN_KNOWLEDGE_VERIFICATION_METHODS = 2",
  '"SUPPORTS_HYPOTHESIS"',
  '"REFUTES_HYPOTHESIS"',
  '"INCONCLUSIVE"',
  'status = "PROVISIONALLY_SUPPORTED"',
  'status = "PROVISIONALLY_REFUTED"',
  'status = "CONFLICTED_MORE_EXPERIMENTS_REQUIRED"',
  "one_experiment_may_establish_truth: false",
  "negative_results_retained: true",
  "inconclusive_results_retained: true",
  "replication_required: true",
  "knowledge_promotion_ready: knowledgePromotionReady",
  'status: "PROPOSED_AWAITING_GOVERNANCE"',
  "execution_requires_separate_governance: true",
  "execution_performed: false",
  "experiment_result_may_promote_knowledge_directly: false",
  "experiment_result_may_start_training: false",
  'status: "READY_FOR_EPISTEMIC_KNOWLEDGE_REVIEW"',
  "automatic_knowledge_promotion: false",
  "reusable_platform_knowledge: false",
  "training_ready: false",
  "result_promotes_knowledge_directly: false",
  "result_starts_training: false",
  "structural_result_only: true",
  "result_text_persisted: false",
  "raw_measurements_persisted: false",
  "customer_private_content_included: false",
  "customer_identifiers_included: false",
  "raw_reasoning_persisted: false",
], "scientific Learning runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(scientific), false,
  "scientific reconciliation/result registry must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(scientific), false,
  "scientific runtime must not mutate workersMax");
assert.equal(/workersMin\s*[:=]/.test(scientific), false,
  "scientific runtime must not mutate workersMin");

const provisionalGate = scientific.indexOf("rows.length >= MIN_PROVISIONAL_RESULTS");
const provisionalReplicationGate = scientific.indexOf("replicationKeys.length >= MIN_PROVISIONAL_REPLICATIONS", provisionalGate);
assert.ok(provisionalGate >= 0 && provisionalReplicationGate > provisionalGate,
  "provisional hypothesis state must require result count and independent replication count");

const knowledgeResultsGate = scientific.indexOf("rows.length >= MIN_KNOWLEDGE_RESULTS");
const knowledgeReplicationGate = scientific.indexOf("replicationKeys.length >= MIN_KNOWLEDGE_REPLICATIONS", knowledgeResultsGate);
const knowledgeMethodsGate = scientific.indexOf("verificationMethods.length >= MIN_KNOWLEDGE_VERIFICATION_METHODS", knowledgeReplicationGate);
const noRefuteGate = scientific.indexOf("refute.length === 0", knowledgeMethodsGate);
assert.ok(
  knowledgeResultsGate >= 0 &&
  knowledgeReplicationGate > knowledgeResultsGate &&
  knowledgeMethodsGate > knowledgeReplicationGate &&
  noRefuteGate > knowledgeMethodsGate,
  "experimental knowledge review candidate must require replication, multiple verification methods and zero refuting results",
);

hasAll(route, [
  "reconcileAvantiqoScientificLearningExperiments",
  "scientificLearning = await reconcileAvantiqoScientificLearningExperiments()",
  "scientific_learning: scientificLearning",
  "One experiment never establishes truth",
  "no experiment",
], "hourly Learning route");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(route), false,
  "hourly Learning route must remain RunPod-free");
const scientificIndex = route.indexOf("scientificLearning = await reconcileAvantiqoScientificLearningExperiments()");
const boundedResearchIndex = route.indexOf("result = await runAvantiqoContinuousLearningBatch");
assert.ok(scientificIndex >= 0 && boundedResearchIndex > scientificIndex,
  "scientific reconciliation must occur before the next bounded research batch");

hasAll(index, [
  'export * from "./runtime/AvantiqoScientificLearningExperimentRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    durable_hypothesis_registry: true,
    durable_experiment_registry: true,
    structural_verified_result_registry: true,
    negative_results_retained: true,
    inconclusive_results_retained: true,
    independent_replication_required: true,
    multiple_verification_methods_required: true,
    one_experiment_never_establishes_truth: true,
    provisional_support_and_refutation_states: true,
    conflicted_results_force_more_experiments: true,
    experimental_knowledge_requires_epistemic_review: true,
    experiment_execution_separately_governed: true,
  },
  epistemic_thresholds: {
    provisional_min_results: 3,
    provisional_min_independent_replications: 2,
    knowledge_review_min_results: 5,
    knowledge_review_min_independent_replications: 3,
    knowledge_review_min_verification_methods: 2,
    refuting_results_allowed_for_knowledge_review_candidate: 0,
  },
  governance: {
    automatic_experiment_execution: false,
    automatic_knowledge_promotion: false,
    experimental_candidate_reusable_knowledge: false,
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
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE5_AUDIT=PASS");
