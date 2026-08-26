import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

const runtime = fs.readFileSync(runtimePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

function assertContains(source, needle, code) {
  if (!source.includes(needle)) {
    throw new Error(`AVANTIQO_LEARNING_WORLDCLASS_PHASE17_AUDIT_${code}_MISSING`);
  }
}

function assertNotContains(source, needle, code) {
  if (source.includes(needle)) {
    throw new Error(`AVANTIQO_LEARNING_WORLDCLASS_PHASE17_AUDIT_${code}_FORBIDDEN`);
  }
}

assertContains(
  runtime,
  '"AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1"',
  "CONTRACT",
);
assertContains(runtime, "MIN_INDEPENDENT_ESTIMATES = 2", "TWO_ESTIMATORS");
assertContains(runtime, "MIN_ESTIMATION_METHODS = 2", "TWO_METHODS");
assertContains(
  runtime,
  "experiment_version_fingerprint",
  "EXACT_EXPERIMENT_VERSION_BINDING",
);
assertContains(
  runtime,
  "conservativeInformationGainBits = min(",
  "LOWEST_INFORMATION_GAIN",
);
assertContains(runtime, "conservativeCostUnits = max(", "HIGHEST_COST");
assertContains(
  runtime,
  "conservativeExecutionRisk = max(",
  "HIGHEST_EXECUTION_RISK",
);
assertContains(
  runtime,
  'primary_rank_metric: "RISK_ADJUSTED_INFORMATION_GAIN_PER_COST"',
  "INFORMATION_GAIN_PER_COST",
);
assertContains(
  runtime,
  "fake_precision_from_experiment_text_forbidden: true",
  "FAKE_PRECISION_FORBIDDEN",
);
assertContains(
  runtime,
  "one_experiment_per_uncertainty_group_per_cycle: true",
  "PORTFOLIO_DIVERSITY",
);
assertContains(
  runtime,
  "active_exact_mechanism_negative_transfer_memory_blocks_selection: true",
  "NEGATIVE_TRANSFER_BLOCK",
);
assertContains(
  runtime,
  "mature_transfer_states_are_not_reselected: true",
  "MATURE_TRANSFER_NOT_RESELECTED",
);
assertContains(
  runtime,
  "selection_is_not_execution_authorization: true",
  "SELECTION_NOT_EXECUTION",
);
assertContains(runtime, "execution_authorized: false", "NO_EXECUTION_AUTHORIZATION");
assertContains(runtime, "spend_authorized: false", "NO_SPEND_AUTHORIZATION");
assertContains(runtime, "runpod_job_submitted: false", "NO_RUNPOD_SUBMISSION");
assertContains(runtime, "platform_knowledge_written: false", "NO_PLATFORM_KNOWLEDGE");
assertContains(runtime, "automatic_training_started: false", "NO_AUTO_TRAINING");
assertContains(
  runtime,
  "automatic_model_weight_mutation: false",
  "NO_MODEL_WEIGHT_MUTATION",
);
assertContains(runtime, "result_fabricated: false", "NO_RESULT_FABRICATION");
assertContains(
  runtime,
  "reconcileAvantiqoActiveExperimentSelection",
  "RECONCILER_EXPORT",
);
assertContains(
  runtime,
  "recordAvantiqoExperimentInformationEstimate",
  "ESTIMATE_RECORDER",
);
assertContains(
  runtime,
  "assertAvantiqoExperimentSelectionCurrent",
  "CURRENT_SELECTION_GUARD",
);

assertContains(
  route,
  "reconcileAvantiqoLearningTransferRevisions();",
  "PHASE16_BEFORE_PHASE17",
);
assertContains(
  route,
  "reconcileAvantiqoActiveExperimentSelection();",
  "PHASE17_ROUTE_CALL",
);
assertContains(
  route,
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "RESEARCH_AFTER_PHASE17",
);
const phase16Index = route.indexOf("reconcileAvantiqoLearningTransferRevisions();");
const phase17Index = route.indexOf("reconcileAvantiqoActiveExperimentSelection();");
const researchIndex = route.indexOf(
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
);
if (!(phase16Index >= 0 && phase17Index > phase16Index && researchIndex > phase17Index)) {
  throw new Error("AVANTIQO_LEARNING_WORLDCLASS_PHASE17_AUDIT_ROUTE_ORDER_INVALID");
}
assertContains(
  route,
  "active_experiment_selection: activeExperimentSelection",
  "ROUTE_RESULT_EXPOSED",
);
assertNotContains(
  route,
  "recordAvantiqoExperimentInformationEstimate(",
  "CRON_CANNOT_FABRICATE_ESTIMATES",
);
assertNotContains(
  route,
  "recordAvantiqoScientificExperimentResult(",
  "CRON_CANNOT_FABRICATE_SCIENTIFIC_RESULTS",
);
assertNotContains(
  route,
  "recordAvantiqoTransferExperimentResult(",
  "CRON_CANNOT_FABRICATE_TRANSFER_RESULTS",
);

assertContains(
  index,
  'export * from "./runtime/AvantiqoActiveExperimentSelectionRuntime";',
  "INDEX_EXPORT",
);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE17_AUDIT=PASS");
console.log("AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_CONTRACT=AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1");
console.log("AVANTIQO_PHASE17_MIN_INDEPENDENT_ESTIMATES=2");
console.log("AVANTIQO_PHASE17_MIN_ESTIMATION_METHODS=2");
console.log("AVANTIQO_PHASE17_SELECTION_IS_EXECUTION_AUTHORIZATION=false");
console.log("AVANTIQO_PHASE17_RUNPOD_JOB_SUBMITTED=false");
console.log("AVANTIQO_PHASE17_PLATFORM_KNOWLEDGE_WRITTEN=false");
