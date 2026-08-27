#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const CONTRACT = "AVANTIQO_INTELLIGENCE_POST48_GAP_REPAIR_AUDIT_V1";

function file(relative) {
  const absolute = path.join(root, relative);
  assert.ok(fs.existsSync(absolute), `${CONTRACT}_MISSING_FILE:${relative}`);
  return absolute;
}

function read(relative) {
  return fs.readFileSync(file(relative), "utf8");
}

function has(source, marker, code) {
  assert.ok(source.includes(marker), `${CONTRACT}_${code}_MISSING:${marker}`);
}

function forbid(source, marker, code) {
  assert.ok(!source.includes(marker), `${CONTRACT}_${code}_FORBIDDEN:${marker}`);
}

function syntax(relative) {
  const result = spawnSync(process.execPath, ["--check", file(relative)], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${CONTRACT}_SYNTAX_FAILED:${relative}\n${result.stderr || result.stdout || ""}`);
}

const paths = {
  dataset: "lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js",
  improvement: "lib/intelligence/runtime/AvantiqoModelImprovementRuntime.js",
  execution: "lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js",
  providerRegistration:
    "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js",
  reasoning: "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  readinessRoute:
    "app/api/internal/intelligence/model-improvement/readiness/process/route.js",
  healthRuntime: "lib/intelligence/runtime/AvantiqoIntelligenceOperationalHealthRuntime.js",
  healthRoute: "app/api/internal/intelligence/operational-health/route.js",
  continuousRoute: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
  vercel: "vercel.json",
  gapLedger: "audits/avantiqo-intelligence-post48-gap-audit-20260827.json",
  experienceAudit: "scripts/operator-experience-learning-audit.mjs",
  trainingAudit: "scripts/avantiqo-intelligence-training-pipeline-audit.mjs",
  reasoningTest: "tests/avantiqo-intelligence-reasoning-loop-contract.test.mjs",
};

for (const relative of Object.values(paths)) file(relative);
for (const relative of [
  paths.dataset,
  paths.improvement,
  paths.execution,
  paths.providerRegistration,
  paths.reasoning,
  paths.readinessRoute,
  paths.healthRuntime,
  paths.healthRoute,
  paths.continuousRoute,
  paths.experienceAudit,
  paths.trainingAudit,
  paths.reasoningTest,
]) syntax(relative);

const dataset = read(paths.dataset);
const improvement = read(paths.improvement);
const execution = read(paths.execution);
const providerRegistration = read(paths.providerRegistration);
const reasoning = read(paths.reasoning);
const readinessRoute = read(paths.readinessRoute);
const healthRuntime = read(paths.healthRuntime);
const healthRoute = read(paths.healthRoute);
const continuousRoute = read(paths.continuousRoute);
const index = read(paths.index);
const vercel = JSON.parse(read(paths.vercel));
const gapLedger = JSON.parse(read(paths.gapLedger));

has(dataset, 'TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"', "DATASET_METHOD");
has(dataset, 'TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"', "DATASET_BACKEND");
has(dataset, 'base_precision: "BF16"', "DATASET_BF16");
has(dataset, "base_quantized: false", "DATASET_UNQUANTIZED");
has(dataset, "preferred_method: TRAINING_METHOD", "DATASET_METHOD_BINDING");
has(dataset, "execution_backend: TRAINING_BACKEND", "DATASET_BACKEND_BINDING");
has(dataset, "explicit_training_execution_required: true", "DATASET_EXPLICIT_EXECUTION");
has(dataset, "base_weights_immutable: true", "DATASET_IMMUTABLE_BASE");
forbid(dataset, "QLORA_OR_LORA", "DATASET_LEGACY_QLORA");

has(improvement, 'TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"', "IMPROVEMENT_METHOD");
has(improvement, 'TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"', "IMPROVEMENT_BACKEND");
has(improvement, "base_quantized: false", "IMPROVEMENT_UNQUANTIZED");
forbid(improvement, "QLORA_OR_LORA", "IMPROVEMENT_LEGACY_QLORA");
forbid(improvement, "UNBOUND_UNTIL_TRAINING_WORKER_CONFIGURED", "IMPROVEMENT_UNBOUND_BACKEND");
has(execution, 'TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"', "EXECUTION_METHOD");
has(execution, "approved !== true", "EXECUTION_EXPLICIT_APPROVAL");

has(reasoning, 'const OWNED_PROVIDER = "avantiqo-intelligence"', "OWNED_PROVIDER");
has(reasoning, "allowed_providers: [OWNED_PROVIDER]", "OWNED_PROVIDER_PIN");
has(reasoning, "intelligence_execution_lane: executionLane", "OWNED_LANE_TELEMETRY");
has(providerRegistration, "external_provider_fallback_allowed: false", "OWNED_FALLBACK_FALSE");
has(providerRegistration, 'supplier_type: "OWNED_INFERENCE"', "OWNED_SUPPLIER_TYPE");
has(providerRegistration, 'data_control: "AVANTIQO"', "OWNED_DATA_CONTROL");
has(providerRegistration, 'inference_control: "AVANTIQO"', "OWNED_INFERENCE_CONTROL");

has(readinessRoute, "AVANTIQO_MODEL_IMPROVEMENT_READINESS_RECONCILIATION_V1", "READINESS_CONTRACT");
has(readinessRoute, "assembleAvantiqoTrainingDataset", "READINESS_DATASET_ASSEMBLY");
has(readinessRoute, "CRON_SECRET", "READINESS_CRON_AUTH");
has(readinessRoute, "preparation_only: true", "READINESS_PREPARATION_ONLY");
has(readinessRoute, "provider_call_performed: false", "READINESS_NO_PROVIDER");
has(readinessRoute, "spend_authorized: false", "READINESS_NO_SPEND");
has(readinessRoute, "runpod_job_submitted: false", "READINESS_NO_RUNPOD");
has(readinessRoute, "synthetic_example_compilation_started: false", "READINESS_NO_COMPILER");
has(readinessRoute, "model_benchmark_started: false", "READINESS_NO_BENCHMARK");
has(readinessRoute, "model_canary_started: false", "READINESS_NO_CANARY");
has(readinessRoute, "automatic_training_started: false", "READINESS_NO_TRAINING");
has(readinessRoute, "automatic_model_weight_mutation: false", "READINESS_NO_WEIGHT_MUTATION");
has(readinessRoute, "production_model_promoted: false", "READINESS_NO_PROMOTION");
for (const forbidden of [
  "AvantiqoTrainingExampleCompilerRuntime",
  "compileAvantiqoTrainingExamples",
  "AvantiqoModelTrainingExecutionRuntime",
  "executeAvantiqoModelTraining",
  "AvantiqoModelBenchmarkExecutionRuntime",
  "AvantiqoModelCandidateCanaryRuntime",
  "certifyAvantiqoModelCandidateCanary",
  "AvantiqoModelPromotionRuntime",
  "prepareAvantiqoModelPromotionReview",
]) forbid(readinessRoute, forbidden, "READINESS_EXPENSIVE_OR_MUTATING_STAGE");

has(healthRuntime, "AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_V1", "HEALTH_CONTRACT");
has(healthRuntime, 'const USAGE_TABLE = "platform_service_usage"', "HEALTH_EXISTING_USAGE_LEDGER");
has(healthRuntime, 'const PROVIDER = "avantiqo-intelligence"', "HEALTH_OWNED_PROVIDER");
has(healthRuntime, "metadata.intelligence_execution_lane", "HEALTH_LANE_TELEMETRY");
has(healthRuntime, "provider_latency_p95_ms", "HEALTH_PROVIDER_P95");
has(healthRuntime, "total_latency_p95_ms", "HEALTH_TOTAL_P95");
has(healthRuntime, "INTELLIGENCE_FAILURE_RATE_SLO_BREACH", "HEALTH_FAILURE_ALERT");
has(healthRuntime, "INTELLIGENCE_FAST_PROVIDER_P95_SLO_BREACH", "HEALTH_FAST_ALERT");
has(healthRuntime, "INTELLIGENCE_DEEP_PROVIDER_P95_SLO_BREACH", "HEALTH_DEEP_ALERT");
has(healthRuntime, "INTELLIGENCE_PENDING_AGE_SLO_BREACH", "HEALTH_PENDING_ALERT");
has(healthRuntime, "aggregate_only: true", "HEALTH_AGGREGATE_ONLY");
has(healthRuntime, "prompts_returned: false", "HEALTH_NO_PROMPTS");
has(healthRuntime, "transcripts_returned: false", "HEALTH_NO_TRANSCRIPTS");
has(healthRuntime, "raw_errors_returned: false", "HEALTH_NO_RAW_ERRORS");
has(healthRuntime, "organization_ids_returned: false", "HEALTH_NO_ORG_IDS");
has(healthRuntime, "customer_content_returned: false", "HEALTH_NO_CUSTOMER_CONTENT");
has(healthRuntime, "provider_call_performed: false", "HEALTH_NO_PROVIDER_CALL");
has(healthRuntime, "wallet_write_performed: false", "HEALTH_NO_WALLET_WRITE");
has(healthRuntime, "runpod_job_submitted: false", "HEALTH_NO_RUNPOD");
has(healthRuntime, "model_weight_mutation: false", "HEALTH_NO_WEIGHT_MUTATION");
has(healthRoute, "CRON_SECRET", "HEALTH_AUTH");
has(healthRoute, "getAvantiqoIntelligenceOperationalHealth", "HEALTH_ROUTE_RUNTIME");
has(healthRoute, 'status: result.status === "SLO_ATTENTION_REQUIRED" ? 207 : 200', "HEALTH_ROUTE_SLO_STATUS");
has(index, "AvantiqoIntelligenceOperationalHealthRuntime", "HEALTH_INDEX_EXPORT");

// The final Phase48 scientific orchestration is intentionally untouched by this post-48 repair.
forbid(continuousRoute, "model-improvement/readiness", "PHASE48_ROUTE_CROSS_WIRING");
forbid(continuousRoute, "assembleAvantiqoTrainingDataset", "PHASE48_ROUTE_DATASET_ASSEMBLY");
forbid(continuousRoute, "AvantiqoIntelligenceOperationalHealthRuntime", "PHASE48_ROUTE_HEALTH_CROSS_WIRING");

const readinessPath = "/api/internal/intelligence/model-improvement/readiness/process";
const readinessCron = Array.isArray(vercel.crons)
  ? vercel.crons.find((item) => item.path === readinessPath)
  : null;
assert.ok(readinessCron, `${CONTRACT}_READINESS_CRON_MISSING`);
assert.equal(readinessCron.schedule, "27 * * * *", `${CONTRACT}_READINESS_CRON_SCHEDULE_INVALID`);
assert.equal(
  vercel.functions?.["app/api/internal/intelligence/model-improvement/readiness/process/route.js"]?.maxDuration,
  300,
  `${CONTRACT}_READINESS_MAX_DURATION_INVALID`,
);
const learningCron = vercel.crons.find(
  (item) => item.path === "/api/internal/intelligence/continuous-learning/process",
);
assert.equal(learningCron?.schedule, "17 * * * *", `${CONTRACT}_LEARNING_CRON_CHANGED`);

assert.equal(gapLedger.contract, "AVANTIQO_INTELLIGENCE_POST48_GAP_AUDIT_V1");
assert.equal(gapLedger.phase_model, "POST_PHASE48_GAP_AUDIT_NOT_PHASE49");
assert.equal(gapLedger.safety.phase49_created, false);
assert.equal(gapLedger.safety.provider_call_performed_by_gap_audit, false);
assert.equal(gapLedger.safety.wallet_write_performed_by_gap_audit, false);
assert.equal(gapLedger.safety.runpod_job_submitted_by_gap_audit, false);
assert.equal(gapLedger.safety.automatic_training_started, false);
assert.equal(gapLedger.safety.automatic_model_weight_mutation, false);
assert.equal(gapLedger.safety.production_model_promoted, false);

console.log("AVANTIQO_INTELLIGENCE_POST48_GAP_REPAIR_AUDIT=PASS");
console.log(`AVANTIQO_INTELLIGENCE_POST48_GAP_REPAIR_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_INTELLIGENCE_TRAINING_RECIPE_CONVERGED=true");
console.log("AVANTIQO_INTELLIGENCE_OWNED_PROVIDER_FALLBACK=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_HOURLY=true");
console.log("AVANTIQO_INTELLIGENCE_READINESS_PREPARATION_ONLY=true");
console.log("AVANTIQO_INTELLIGENCE_READINESS_PROVIDER_CALL=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_SPEND_AUTHORIZED=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_RUNPOD_JOB=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_SYNTHETIC_COMPILATION=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_TRAINING=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_MODEL_BENCHMARK=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_MODEL_CANARY=false");
console.log("AVANTIQO_INTELLIGENCE_READINESS_MODEL_PROMOTION=false");
console.log("AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_AGGREGATION=true");
console.log("AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_FAST_DEEP_SLO=true");
console.log("AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_CUSTOMER_CONTENT=false");
console.log("AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_PROVIDER_CALL=false");
console.log("AVANTIQO_INTELLIGENCE_PHASE48_ROUTE_UNCHANGED=true");
console.log("AVANTIQO_INTELLIGENCE_PHASE49_CREATED=false");
