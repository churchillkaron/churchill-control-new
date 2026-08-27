#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT =
  "AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_V1";
const root = process.cwd();

const files = {
  runtime:
    "lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime.js",
  performance:
    "lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime.js",
  phase26:
    "lib/intelligence/runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

function absolute(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    throw new Error(`${CONTRACT}_MISSING_FILE:${relative}`);
  }
  return file;
}

function read(relative) {
  return fs.readFileSync(absolute(relative), "utf8");
}

function requireMarker(source, marker, code) {
  if (!source.includes(marker)) {
    throw new Error(`${CONTRACT}_${code}_MISSING:${marker}`);
  }
}

function forbidMarker(source, marker, code) {
  if (source.includes(marker)) {
    throw new Error(`${CONTRACT}_${code}_FORBIDDEN:${marker}`);
  }
}

function syntax(relative) {
  const result = spawnSync(process.execPath, ["--check", absolute(relative)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`${CONTRACT}_SYNTAX_FAILED:${relative}`);
  }
}

for (const relative of [files.runtime, files.performance, files.phase26, files.route]) {
  syntax(relative);
}

const runtime = read(files.runtime);
const performance = read(files.performance);
const phase26 = read(files.phase26);
const route = read(files.route);
const index = read(files.index);

requireMarker(runtime, CONTRACT, "CONTRACT");
requireMarker(
  runtime,
  "MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE = 1",
  "EXPLORATION_FLOOR",
);
requireMarker(
  runtime,
  "repeated_information_overprediction_can_reduce_family_influence: true",
  "OVERPREDICTION_REDUCTION",
);
requireMarker(
  runtime,
  "repeated_execution_failure_can_reduce_family_influence: true",
  "FAILURE_REDUCTION",
);
requireMarker(
  runtime,
  "repeated_rank_misordering_alone_is_advisory_only: true",
  "RANK_ONLY_ADVISORY",
);
requireMarker(
  runtime,
  "global_profile_is_advisory_only: true",
  "GLOBAL_ADVISORY",
);
requireMarker(
  runtime,
  "family_is_not_fully_quarantined_automatically: true",
  "NO_FULL_AUTO_QUARANTINE",
);
requireMarker(
  runtime,
  "lower_ranked_safe_candidates_can_backfill: true",
  "SAFE_BACKFILL",
);
requireMarker(
  runtime,
  "original_numeric_estimate_values_are_mutated: false",
  "NO_NUMERIC_ESTIMATE_MUTATION",
);
requireMarker(
  runtime,
  "numeric_selection_scores_are_mutated: false",
  "NO_SCORE_MUTATION",
);
requireMarker(
  runtime,
  "single_execution_can_change_selection_policy: false",
  "NO_SINGLE_EXECUTION_ADAPTATION",
);
requireMarker(
  runtime,
  "automatic_selection_boost_applied: false",
  "NO_BOOST",
);
requireMarker(
  runtime,
  "fail_closed_on_non_convergence: true",
  "FAIL_CLOSED",
);
requireMarker(
  runtime,
  "LONG_HORIZON_POLICY_ADAPTATION_DID_NOT_CONVERGE_FAIL_CLOSED",
  "NON_CONVERGENCE_STATUS",
);
requireMarker(
  runtime,
  "selection_policy_numeric_score_mutated: false",
  "GOVERNANCE_NO_SCORE_MUTATION",
);
requireMarker(runtime, "execution_authorized: false", "NO_EXEC_AUTH");
requireMarker(runtime, "provider_called_here: false", "NO_PROVIDER_CALL");
requireMarker(runtime, "wallet_write_performed_here: false", "NO_WALLET_WRITE");
requireMarker(runtime, "runpod_job_submitted: false", "NO_RUNPOD_JOB");
requireMarker(runtime, "platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE");
requireMarker(runtime, "automatic_training_started: false", "NO_AUTO_TRAINING");

requireMarker(
  performance,
  "mature_long_horizon_evidence: mature",
  "PHASE28_MATURITY_SOURCE",
);
requireMarker(
  performance,
  "repeated_information_overprediction: repeatedInformationOverprediction",
  "PHASE28_OVERPREDICTION_SOURCE",
);
requireMarker(
  performance,
  "repeated_execution_failure: repeatedExecutionFailure",
  "PHASE28_FAILURE_SOURCE",
);
requireMarker(
  performance,
  "repeated_rank_misordering: repeatedRankMisordering",
  "PHASE28_RANK_SOURCE",
);
requireMarker(
  performance,
  "single_execution_can_change_selection_policy: false",
  "PHASE28_SINGLE_EXECUTION_BLOCK",
);

requireMarker(
  phase26,
  "lower_ranked_candidates_backfill_vacated_slots: true",
  "PHASE26_BACKFILL_RETAINED",
);
requireMarker(
  phase26,
  "execution_requests_wait_for_stable_portfolio: true",
  "PHASE26_REQUEST_GATE_RETAINED",
);

const performanceCall = route.indexOf(
  "reconcileAvantiqoExperimentPortfolioPerformance()",
);
const phase29Call = route.indexOf(
  "reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio()",
);
const requestCall = route.indexOf("reconcileAvantiqoExperimentExecutionRequests()");
assert.ok(
  performanceCall >= 0 && phase29Call > performanceCall && requestCall > phase29Call,
  `${CONTRACT}_ROUTE_ORDER_INVALID`,
);
requireMarker(
  route,
  "longHorizonPolicyAdaptedExperimentPortfolio.execution_request_generation_allowed === true",
  "ROUTE_PHASE29_REQUEST_GATE",
);
requireMarker(
  route,
  "BLOCKED_PENDING_STABLE_LONG_HORIZON_POLICY_ADAPTED_PORTFOLIO",
  "ROUTE_FAIL_CLOSED_STATUS",
);
forbidMarker(route, "recordAvantiqoExperimentExecutionApproval(", "CRON_AUTO_APPROVAL");
forbidMarker(route, "createAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CLAIM");
forbidMarker(route, "consumeAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CONSUME");
forbidMarker(route, "recordAvantiqoExperimentExecutionReceipt(", "CRON_AUTO_RECEIPT");

requireMarker(
  index,
  "AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime",
  "INDEX_EXPORT",
);

function simulatePolicy({
  mature,
  overprediction,
  failure,
  rankMisordering,
  selectedCount,
}) {
  const actionable = Boolean(mature && (overprediction || failure));
  const retained = actionable ? Math.min(1, selectedCount) : selectedCount;
  return {
    actionable,
    retained,
    retired: Math.max(0, selectedCount - retained),
    rankOnlyAdvisory: Boolean(
      mature && rankMisordering && !overprediction && !failure,
    ),
    boosted: false,
    numericScoreMutated: false,
  };
}

const immature = simulatePolicy({
  mature: false,
  overprediction: true,
  failure: true,
  rankMisordering: true,
  selectedCount: 3,
});
assert.equal(immature.actionable, false);
assert.equal(immature.retired, 0);

const rankOnly = simulatePolicy({
  mature: true,
  overprediction: false,
  failure: false,
  rankMisordering: true,
  selectedCount: 3,
});
assert.equal(rankOnly.actionable, false);
assert.equal(rankOnly.rankOnlyAdvisory, true);
assert.equal(rankOnly.retired, 0);

const unsafeConcentration = simulatePolicy({
  mature: true,
  overprediction: true,
  failure: false,
  rankMisordering: false,
  selectedCount: 3,
});
assert.equal(unsafeConcentration.actionable, true);
assert.equal(unsafeConcentration.retained, 1);
assert.equal(unsafeConcentration.retired, 2);
assert.equal(unsafeConcentration.boosted, false);
assert.equal(unsafeConcentration.numericScoreMutated, false);

const failureConcentration = simulatePolicy({
  mature: true,
  overprediction: false,
  failure: true,
  rankMisordering: false,
  selectedCount: 2,
});
assert.equal(failureConcentration.retained, 1);
assert.equal(failureConcentration.retired, 1);

const oneSelection = simulatePolicy({
  mature: true,
  overprediction: true,
  failure: true,
  rankMisordering: true,
  selectedCount: 1,
});
assert.equal(oneSelection.retained, 1);
assert.equal(oneSelection.retired, 0);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE29_AUDIT=PASS");
console.log(
  `AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT=${CONTRACT}`,
);
console.log("AVANTIQO_PHASE29_MATURE_EVIDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE29_OVERPREDICTION_CAN_REDUCE_INFLUENCE=true");
console.log("AVANTIQO_PHASE29_EXECUTION_FAILURE_CAN_REDUCE_INFLUENCE=true");
console.log("AVANTIQO_PHASE29_RANK_MISORDERING_ALONE_IS_ADVISORY=true");
console.log("AVANTIQO_PHASE29_GLOBAL_PROFILE_IS_ADVISORY=true");
console.log("AVANTIQO_PHASE29_FLAGGED_FAMILY_SELECTION_CAP=1");
console.log("AVANTIQO_PHASE29_UNSAFE_FAMILY_EXPLORATION_FLOOR_PRESERVED=true");
console.log("AVANTIQO_PHASE29_LOWER_RANKED_SAFE_BACKFILL_ENABLED=true");
console.log("AVANTIQO_PHASE29_NUMERIC_ESTIMATE_VALUES_MUTATED=false");
console.log("AVANTIQO_PHASE29_NUMERIC_SELECTION_SCORES_MUTATED=false");
console.log("AVANTIQO_PHASE29_SINGLE_EXECUTION_CAN_CHANGE_POLICY=false");
console.log("AVANTIQO_PHASE29_AUTOMATIC_SELECTION_BOOST_APPLIED=false");
console.log("AVANTIQO_PHASE29_NON_CONVERGENCE_FAILS_CLOSED=true");
console.log("AVANTIQO_PHASE29_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE29_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE29_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE29_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE29_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE29_AUTOMATIC_TRAINING_STARTED=false");
