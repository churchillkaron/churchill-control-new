#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function forbid(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const certification = read("lib/intelligence/runtime/AvantiqoOwnedModelMissionLearningCertificationRuntime.mjs");
const training = read("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js");
const benchmark = read("lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js");
const canary = read("lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js");
const live = read("scripts/certify-avantiqo-owned-model-mission-learning-live.mjs");
const workflow = read(".github/workflows/avantiqo-intelligence-owned-model-mission-learning.yml");

requireText(certification, /AVANTIQO_LOCAL_NODE_V1/, "LOCAL_CERTIFICATION_INFRASTRUCTURE_REQUIRED");
requireText(training, /AVANTIQO_LOCAL_TRAINER_V1/, "LOCAL_TRAINER_REQUIRED");
requireText(training, /AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_EXECUTOR_REQUIRED/, "LOCAL_TRAINER_FAIL_CLOSED_REQUIRED");
requireText(benchmark, /AVANTIQO_MODEL_BENCHMARK_LOCAL_RUNTIME_REQUIRED/, "LOCAL_BENCHMARK_FAIL_CLOSED_REQUIRED");
requireText(canary, /AVANTIQO_MODEL_CANDIDATE_CANARY_LOCAL_RUNTIME_REQUIRED/, "LOCAL_CANARY_FAIL_CLOSED_REQUIRED");
requireText(live, /AVANTIQO_OWNED_MODEL_MISSION_LEARNING_LOCAL_RUNTIME_REQUIRED/, "LOCAL_LIVE_CERTIFICATION_STUB_REQUIRED");
requireText(workflow, /local-only|local only/i, "LOCAL_ONLY_WORKFLOW_REQUIRED");

for (const [name, source] of [
  ["certification", certification],
  ["training", training],
  ["benchmark", benchmark],
  ["canary", canary],
  ["live", live],
  ["workflow", workflow],
]) {
  forbid(source, /ModalClient|MODAL_TOKEN|RUNPOD_API_KEY|api\.runpod\.ai|modal run|modal deploy/i, `${name}:EXTERNAL_COMPUTE_REFERENCE_FORBIDDEN`);
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_OWNED_MODEL_MISSION_LEARNING_LOCAL_GUARD_V2",
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY",
  external_compute_allowed: false,
  external_provider_job_submitted: false,
  production_model_promoted: false,
}));
