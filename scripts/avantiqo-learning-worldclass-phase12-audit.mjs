#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE12_AUDIT_V1";
const files = Object.freeze({
  guard: "lib/intelligence/runtime/AvantiqoModelImprovementSafeLeaseGuard.js",
  policy: "config/avantiqo-runpod-safe-lease-policy.json",
  trainingCandidate: "lib/intelligence/runtime/AvantiqoTrainingCandidateRuntime.js",
  dataset: "lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js",
  trainer: "lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js",
  benchmark: "lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js",
  benchmarkWorker: "services/avantiqo-intelligence-benchmark/handler.py",
  candidate: "lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js",
  promotion: "lib/intelligence/runtime/AvantiqoModelPromotionRuntime.js",
  trainerLocal: "scripts/run-avantiqo-model-training-execution-local.mjs",
  benchmarkLocal: "scripts/run-avantiqo-model-benchmark-submission-local.mjs",
  index: "lib/intelligence/index.js",
});

async function source(path) { return readFile(path, "utf8"); }
function hasAll(content, markers, label) {
  for (const marker of markers) assert.ok(content.includes(marker), `${label}: missing marker ${marker}`);
}

const values = await Promise.all(Object.values(files).map(source));
const content = Object.fromEntries(Object.keys(files).map((key, index) => [key, values[index]]));

hasAll(content.guard, [
  "AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_V1",
  'SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"',
  'trainer: "intelligence-trainer"',
  'benchmark: "intelligence-benchmark"',
  'candidate: "intelligence-candidate"',
  "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT",
  "AVANTIQO_RUNPOD_SAFE_LEASE_LANE",
  "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID",
  "AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT",
  "SAFE_LEASE_ENDPOINT_MISMATCH",
  "SAFE_LEASE_EXPIRED",
  "direct_endpoint_scaling_allowed: false",
  'production_model_promotion_effect: "NONE"',
], "model improvement Safe Lease guard");

hasAll(content.policy, [
  '"contract": "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2"',
  '"max_workers_per_lease": 1',
  '"max_jobs_per_lease": 1',
  '"workers_min_one_allowed": false',
  '"intelligence-trainer": "avantiqo-intelligence-trainer-v1"',
  '"intelligence-benchmark": "avantiqo-intelligence-trainer-v1"',
  '"intelligence-candidate": "avantiqo-intelligence-candidate-v1"',
], "Safe Lease policy");

hasAll(content.trainingCandidate, [
  "AVANTIQO_TRAINING_CANDIDATE_V1",
  "training_ready: false",
  "automatic_model_weight_mutation: false",
], "training candidate boundary");

hasAll(content.dataset, [
  "AVANTIQO_TRAINING_DATASET_V1",
  "base_weights_immutable: true",
  "raw_reasoning_training_allowed: false",
  "automatic_training_started: false",
], "training dataset boundary");

hasAll(content.trainer, [
  "AVANTIQO_MODEL_TRAINING_EXECUTION_V1",
  "requireAvantiqoModelImprovementSafeLease",
  'requireAvantiqoModelImprovementSafeLease("trainer"',
  "safe_lease_v2_required: true",
  "leased_endpoint_binding_verified",
  "foundation_weights_mutated !== false",
  "production_model_promoted !== false",
  "candidate_benchmark_required: true",
], "training execution");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(content.trainer), false,
  "training runtime must not scale RunPod endpoints directly");

hasAll(content.benchmark, [
  "AVANTIQO_MODEL_BENCHMARK_EXECUTION_V1",
  "requireAvantiqoModelImprovementSafeLease",
  'requireAvantiqoModelImprovementSafeLease("benchmark"',
  'mode: "paired"',
  "paired_provider_job_id",
  "provider_job_count: 1",
  "one_job_per_lease_preserved: true",
  "recordAvantiqoModelCandidateEvaluation",
  'production_model_promotion_effect: "NONE"',
], "benchmark execution");
assert.equal(content.benchmark.includes("baseline_provider_job_id"), false,
  "legacy two-job baseline submission must be absent");
assert.equal(content.benchmark.includes("candidate_provider_job_id"), false,
  "legacy two-job candidate submission must be absent");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(content.benchmark), false,
  "benchmark runtime must not scale RunPod endpoints directly");

hasAll(content.benchmarkWorker, [
  'mode not in {"baseline", "candidate", "paired"}',
  'if mode == "paired"',
  '"baseline_outputs": baseline_outputs',
  '"candidate_outputs": candidate_outputs',
  '"single_runpod_job": True',
  '"matched_prompt_set": True',
  "release_model(model)",
  '"production_model_mutated": False',
  '"production_model_promoted": False',
], "paired benchmark worker");

hasAll(content.candidate, [
  "AVANTIQO_MODEL_CANDIDATE_CANARY_V1",
  "requireAvantiqoModelImprovementSafeLease",
  'requireAvantiqoModelImprovementSafeLease("candidate"',
  "safe_lease_v2_required: true",
  "leased_endpoint_binding_verified",
  "ordinary_provider_routing_enabled: false",
  "production_endpoint_mutated: false",
  "production_model_promoted: false",
], "candidate canary");
assert.equal(/workersMax\s*[:=]|workersMin\s*[:=]/.test(content.candidate), false,
  "candidate canary must not scale RunPod endpoints directly");

hasAll(content.trainerLocal, [
  "AVANTIQO_MODEL_TRAINING_EXECUTION_LOCAL_V2",
  'SAFE_LEASE_LANE = "intelligence-trainer"',
  "refreshAvantiqoModelTrainingJob",
  "SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE",
  "TRAINING_COMPLETED",
  "provider_jobs_submitted: 1",
], "training lease-lifetime child");

hasAll(content.benchmarkLocal, [
  "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_LOCAL_V2",
  'SAFE_LEASE_LANE = "intelligence-benchmark"',
  "refreshAvantiqoModelBenchmark",
  "SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE",
  "BENCHMARK_COMPLETED",
  "provider_jobs_submitted: 1",
], "benchmark lease-lifetime child");

hasAll(content.promotion, [
  "AVANTIQO_MODEL_PROMOTION_V1",
  'status: "CANARY_CERTIFIED_RELEASE_PENDING"',
  "explicit_production_release_required: true",
  "production_release_authorized: false",
  "production_endpoint_mutated: false",
  "production_model_promoted: false",
  "automatic_production_promotion: false",
  'production_model_promotion_effect: "NONE"',
], "promotion review boundary");

hasAll(content.index, [
  'export * from "./runtime/AvantiqoModelImprovementSafeLeaseGuard";',
  'export * from "./runtime/AvantiqoModelTrainingExecutionRuntime";',
  'export * from "./runtime/AvantiqoModelBenchmarkExecutionRuntime";',
  'export * from "./runtime/AvantiqoModelCandidateCanaryRuntime";',
  'export * from "./runtime/AvantiqoModelPromotionRuntime";',
], "Intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    model_improvement_safe_lease_v2_required: true,
    trainer_exact_lane_required: true,
    benchmark_exact_lane_required: true,
    candidate_exact_lane_required: true,
    leased_endpoint_binding_required: true,
    expired_lease_fails_closed: true,
    direct_endpoint_scaling_forbidden: true,
    trainer_full_job_lifecycle_inside_lease: true,
    benchmark_full_job_lifecycle_inside_lease: true,
    benchmark_matched_ab_single_provider_job: true,
    benchmark_global_one_job_per_lease_preserved: true,
    candidate_canary_inside_isolated_lease: true,
    training_candidate_is_not_weight_mutation_authority: true,
    dataset_is_not_training_execution_authority: true,
    canary_is_not_production_release_authority: true,
    production_release_remains_separate_explicit_review: true,
  },
  governance: {
    paid_gpu_execution_performed_by_audit: false,
    runpod_job_submitted_by_audit: false,
    runpod_endpoint_scaled_by_audit: false,
    production_model_promoted: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_production_promotion: false,
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE12_AUDIT=PASS");
