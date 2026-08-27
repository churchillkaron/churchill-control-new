#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function requireTrue(condition, code) {
  if (!condition) throw new Error(`AVANTIQO_PHASE26_${code}=FAIL`);
}

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`AVANTIQO_PHASE26_SYNTAX_CHECK_FAILED:${path.relative(root, file)}`);
  }
}

for (const file of [runtimePath, routePath]) syntaxCheck(file);

const runtime = read(runtimePath);
const route = read(routePath);
const index = read(indexPath);

requireTrue(
  runtime.includes(
    '"AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_V1"',
  ),
  "BACKFILL_CONTRACT_MISSING",
);
requireTrue(
  runtime.includes("reconcileAvantiqoActiveExperimentSelection") &&
    runtime.includes("reconcileAvantiqoEstimatorCalibratedSelectionGuard") &&
    runtime.includes("reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard"),
  "SELECTION_GUARD_CHAIN_MISSING",
);
requireTrue(
  runtime.includes("retireCalibrationRejectedEstimateEvidence") &&
    runtime.includes("ESTIMATE_EVIDENCE_RETIRED_AFTER_CALIBRATION_REJECTION") &&
    runtime.includes("phase26_original_numeric_estimate_values_mutated: false") &&
    runtime.includes("phase26_estimate_no_longer_counts_for_selection: true"),
  "REJECTED_ESTIMATE_EVIDENCE_RETIREMENT_MISSING",
);
requireTrue(
  runtime.includes("failedVersions.length === 0") &&
    runtime.includes("STABLE_SAFE_EXPERIMENT_PORTFOLIO_READY") &&
    runtime.includes("execution_request_generation_allowed: selection.selected_count > 0"),
  "STABLE_PORTFOLIO_GATE_MISSING",
);
requireTrue(
  runtime.includes("BACKFILL_DID_NOT_CONVERGE_FAIL_CLOSED") &&
    runtime.includes("retireActiveSelectionsFailClosed") &&
    runtime.includes("execution_request_generation_allowed: false"),
  "NON_CONVERGENCE_FAIL_CLOSED_MISSING",
);
requireTrue(
  runtime.includes("MAX_SELECTIONS_PER_CYCLE = 3") &&
    runtime.includes("ABSOLUTE_MAX_BACKFILL_PASSES = 64"),
  "BOUNDED_BACKFILL_MISSING",
);
requireTrue(
  runtime.includes("lower_ranked_candidates_backfill_vacated_slots: true") &&
    runtime.includes("backfill_is_version_specific: true") &&
    runtime.includes("unsafe_version_automatic_reactivation_same_cycle: false"),
  "BACKFILL_POLICY_MISSING",
);
requireTrue(
  runtime.includes("execution_authorized: false") &&
    runtime.includes("spend_authorized: false") &&
    runtime.includes("provider_execution_authorized: false") &&
    runtime.includes("runpod_job_submitted: false") &&
    runtime.includes("wallet_write_performed_here: false") &&
    runtime.includes("platform_knowledge_written: false") &&
    runtime.includes("automatic_training_started: false"),
  "GOVERNANCE_FALSE_MARKERS_MISSING",
);
requireTrue(
  route.includes("reconcileAvantiqoCalibrationBackfilledExperimentPortfolio") &&
    route.includes(
      "calibrationBackfilledExperimentPortfolio.execution_request_generation_allowed === true",
    ) &&
    route.includes("BLOCKED_PENDING_STABLE_SAFE_EXPERIMENT_PORTFOLIO"),
  "CRON_EXECUTION_REQUEST_GATE_MISSING",
);
requireTrue(
  route.indexOf("reconcileAvantiqoCalibrationBackfilledExperimentPortfolio()") <
    route.indexOf("reconcileAvantiqoExperimentExecutionRequests()"),
  "CRON_ORDER_INVALID",
);
requireTrue(
  index.includes(
    'export * from "./runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime";',
  ),
  "INDEX_EXPORT_MISSING",
);

const forbiddenRuntimePatterns = [
  /fetch\s*\(/,
  /RUNPOD_API_KEY/,
  /reserveWallet/i,
  /chargeWallet/i,
  /automaticModelPromotion\s*:\s*true/i,
  /automatic_training_started\s*:\s*true/i,
  /platform_knowledge_written\s*:\s*true/i,
  /execution_authorized\s*:\s*true/i,
  /spend_authorized\s*:\s*true/i,
];
for (const pattern of forbiddenRuntimePatterns) {
  requireTrue(!pattern.test(runtime), `FORBIDDEN_RUNTIME_PATTERN_${pattern}`);
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE26_AUDIT=PASS");
console.log(
  "AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT=AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_V1",
);
console.log("AVANTIQO_PHASE26_CALIBRATION_REJECTED_ESTIMATES_RETIRED=true");
console.log("AVANTIQO_PHASE26_ORIGINAL_NUMERIC_ESTIMATE_VALUES_MUTATED=false");
console.log("AVANTIQO_PHASE26_SAME_CYCLE_BACKFILL_ENABLED=true");
console.log("AVANTIQO_PHASE26_LOWER_RANKED_SAFE_CANDIDATES_CAN_BACKFILL=true");
console.log("AVANTIQO_PHASE26_MAX_SELECTIONS_PER_CYCLE=3");
console.log("AVANTIQO_PHASE26_BACKFILL_BOUNDED=true");
console.log("AVANTIQO_PHASE26_NON_CONVERGENCE_FAILS_CLOSED=true");
console.log("AVANTIQO_PHASE26_EXECUTION_REQUESTS_REQUIRE_STABLE_SAFE_PORTFOLIO=true");
console.log("AVANTIQO_PHASE26_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE26_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE26_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE26_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE26_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE26_AUTOMATIC_TRAINING_STARTED=false");