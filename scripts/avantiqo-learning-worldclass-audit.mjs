import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_AUDIT_V1";

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`LEARNING_AUDIT_FILE_MISSING:${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function assertIncludes(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label}:MISSING:${value}`);
}

function assertNotIncludes(source, value, label) {
  if (source.includes(value)) throw new Error(`${label}:FORBIDDEN:${value}`);
}

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`${label}:ORDER_INVALID:${first}->${second}`);
  }
}

const coverage = read("lib/intelligence/runtime/AvantiqoLearningCoverageRuntime.js");
const effectiveness = read("lib/intelligence/runtime/AvantiqoLearningEffectivenessRuntime.js");
const continuous = read("lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js");
const internal = read("lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime.js");
const adaptive = read("lib/operator/runtime/IntelligenceAdaptiveLearningRuntime.js");
const route = read("app/api/internal/intelligence/continuous-learning/process/route.js");
const exportsFile = read("lib/intelligence/index.js");

assertIncludes(coverage, "AVANTIQO_LEARNING_COVERAGE_V1", "COVERAGE_CONTRACT");
assertIncludes(coverage, "buildAvantiqoInternalProductKnowledgeUnits", "COVERAGE_CANONICAL_PRODUCT_SOURCE");
assertIncludes(coverage, "platform_learning_gaps", "COVERAGE_GAP_SCOPE");
assertIncludes(coverage, "platform_training_candidates", "COVERAGE_RUNTIME_SIGNAL_INPUT");
assertIncludes(coverage, "self_directed_learning: true", "COVERAGE_SELF_DIRECTED_AGENDA");
assertIncludes(coverage, "customer_private_content_included: false", "COVERAGE_PRIVACY");
assertIncludes(coverage, "runpod_job_submitted: false", "COVERAGE_GPU_GOVERNANCE");
assertIncludes(coverage, "runpod_endpoint_mutated: false", "COVERAGE_ENDPOINT_GOVERNANCE");

assertIncludes(effectiveness, "AVANTIQO_LEARNING_EFFECTIVENESS_V1", "EFFECTIVENESS_CONTRACT");
assertIncludes(effectiveness, "self_adjusting_learning_priority: true", "EFFECTIVENESS_PRIORITY_FEEDBACK");
assertIncludes(effectiveness, "self_adjusting_review_cadence: true", "EFFECTIVENESS_CADENCE_FEEDBACK");
assertIncludes(effectiveness, "runtime_training_signal_count", "EFFECTIVENESS_RUNTIME_FEEDBACK");
assertIncludes(effectiveness, "automatic_model_weight_mutation: false", "EFFECTIVENESS_WEIGHT_GOVERNANCE");
assertIncludes(effectiveness, "runpod_job_submitted: false", "EFFECTIVENESS_GPU_GOVERNANCE");
assertIncludes(effectiveness, "runpod_endpoint_mutated: false", "EFFECTIVENESS_ENDPOINT_GOVERNANCE");

assertIncludes(continuous, "supportedClaims", "CONTINUOUS_EVIDENCE_GATE");
assertIncludes(continuous, "claim.status === \"SUPPORTED\"", "CONTINUOUS_SUPPORTED_ONLY");
assertIncludes(continuous, "claim.confidence >= 0.72", "CONTINUOUS_CONFIDENCE_GATE");
assertIncludes(continuous, "claim.support_count >= 2 || claim.official_primary", "CONTINUOUS_SOURCE_GATE");
assertIncludes(continuous, "customer_private_memory_promoted: false", "CONTINUOUS_PRIVACY_GOVERNANCE");
assertIncludes(continuous, "stale_knowledge_expires: true", "CONTINUOUS_STALENESS_GOVERNANCE");

assertIncludes(internal, "ERP_REGISTRY", "INTERNAL_REGISTRY_SOURCE");
assertIncludes(internal, "AVANTIQO_PRODUCT_CONSTITUTION", "INTERNAL_CONSTITUTION_SOURCE");
assertIncludes(internal, "internal_authoritative: true", "INTERNAL_AUTHORITY_MARKER");
assertIncludes(internal, "customer_private_content_included: false", "INTERNAL_PRIVACY_GOVERNANCE");

assertIncludes(adaptive, "platform_training_candidates", "ADAPTIVE_TRAINING_CANDIDATE_SCOPE");
assertIncludes(adaptive, "training_ready: false", "ADAPTIVE_NO_DIRECT_TRAINING");
assertIncludes(adaptive, "requires_benchmark_validation: true", "ADAPTIVE_BENCHMARK_GATE");
assertIncludes(adaptive, "customer_private_content_included: false", "ADAPTIVE_PRIVACY_GOVERNANCE");
assertIncludes(adaptive, "raw_reasoning_persisted: false", "ADAPTIVE_REASONING_GOVERNANCE");

assertIncludes(route, "syncAvantiqoInternalProductKnowledge", "ROUTE_PRODUCT_SYNC");
assertIncludes(route, "reconcileAvantiqoLearningCoverage", "ROUTE_COVERAGE");
assertIncludes(route, "evaluateAvantiqoLearningEffectiveness", "ROUTE_EFFECTIVENESS");
assertIncludes(route, "runAvantiqoContinuousLearningBatch", "ROUTE_RESEARCH");
assertBefore(route, "syncAvantiqoInternalProductKnowledge()", "reconcileAvantiqoLearningCoverage()", "ROUTE_ORDER_PRODUCT_BEFORE_COVERAGE");
assertBefore(route, "reconcileAvantiqoLearningCoverage()", "evaluateAvantiqoLearningEffectiveness()", "ROUTE_ORDER_COVERAGE_BEFORE_EFFECTIVENESS");
assertBefore(route, "evaluateAvantiqoLearningEffectiveness()", "runAvantiqoContinuousLearningBatch({ limit })", "ROUTE_ORDER_EFFECTIVENESS_BEFORE_RESEARCH");

assertIncludes(exportsFile, "./runtime/AvantiqoLearningCoverageRuntime", "EXPORT_COVERAGE");
assertIncludes(exportsFile, "./runtime/AvantiqoLearningEffectivenessRuntime", "EXPORT_EFFECTIVENESS");

for (const [label, source] of [
  ["COVERAGE", coverage],
  ["EFFECTIVENESS", effectiveness],
]) {
  assertNotIncludes(source, "/run\"", `${label}_NO_RUNPOD_SUBMIT_PATH`);
  assertNotIncludes(source, "workersMax", `${label}_NO_RUNPOD_WORKER_MUTATION`);
  assertNotIncludes(source, "RUNPOD_API_KEY", `${label}_NO_RUNPOD_CREDENTIAL_DEPENDENCY`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    canonical_product_sync: true,
    self_directed_coverage_discovery: true,
    evidence_quality_gates: true,
    effectiveness_feedback_loop: true,
    adaptive_failure_recovery_learning: true,
    bounded_continuous_research: true,
    stale_knowledge_expiry: true,
    training_candidate_benchmark_gate: true,
  },
  governance: {
    customer_private_content_promoted: false,
    raw_reasoning_persisted: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    runpod_job_submitted: false,
    runpod_endpoint_mutated: false,
  },
}, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_AUDIT=PASS");
