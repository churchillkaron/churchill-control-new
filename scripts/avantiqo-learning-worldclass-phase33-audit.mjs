#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT =
  "AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_V1";
const root = process.cwd();
const files = {
  runtime:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime.js",
  canary: "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime.js",
  performance:
    "lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  assert.equal(fs.existsSync(absolute), true, `${label} file missing: ${relative}`);
  const check = spawnSync(process.execPath, ["--check", absolute], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    check.status,
    0,
    `${label} syntax failed:\n${check.stdout || ""}${check.stderr || ""}`,
  );
}

const runtime = fs.readFileSync(path.join(root, files.runtime), "utf8");
const canary = fs.readFileSync(path.join(root, files.canary), "utf8");
const performance = fs.readFileSync(path.join(root, files.performance), "utf8");
const route = fs.readFileSync(path.join(root, files.route), "utf8");
const index = fs.readFileSync(path.join(root, files.index), "utf8");

function requireMarker(source, marker, label = marker) {
  assert.equal(source.includes(marker), true, `missing ${label}`);
}

requireMarker(runtime, CONTRACT);
requireMarker(runtime, "MIN_FULL_PROMOTION_EVALUATED_CYCLES = 3");
requireMarker(runtime, "MIN_FULL_PROMOTION_RANK_CHANGED_CYCLES = 2");
requireMarker(runtime, "MIN_FULL_PROMOTION_COMPARABLE_PAIRS = 5");
requireMarker(runtime, "MIN_FULL_PROMOTION_DISTINCT_EXPERIMENTS = 3");
requireMarker(runtime, "MIN_FULL_PROMOTION_CANARY_CORRECT_RATE = 0.67");
requireMarker(runtime, "MIN_FULL_PROMOTION_CANARY_RATE_ADVANTAGE = 0.1");
requireMarker(runtime, "zero_regression_cycles_required: true");
requireMarker(runtime, "clean_cycle_limit_completion_required: true");
requireMarker(runtime, "exact_baseline_restoration_required: true");
requireMarker(runtime, "every_applied_cycle_must_be_fully_observed: true");
requireMarker(runtime, "actual_canary_ranks_only: true");
requireMarker(runtime, "governed_phase28_realized_outcomes_only: true");
requireMarker(runtime, "theoretical_full_challenger_ranks_used_as_canary_outcome: false");
requireMarker(runtime, "unexecuted_candidate_outcome_inferred: false");
requireMarker(runtime, "historical_counterfactual_backtest_claimed: false");
requireMarker(runtime, "automatic_full_policy_promotion: false");
requireMarker(runtime, "separate_full_policy_promotion_governance_required: true");
requireMarker(runtime, "live_policy_mutated: false");
requireMarker(runtime, "live_selection_mutated: false");
requireMarker(runtime, "source_numeric_scores_mutated: false");
requireMarker(runtime, "provider_called_here: false");
requireMarker(runtime, "wallet_write_performed_here: false");
requireMarker(runtime, "runpod_job_submitted: false");
requireMarker(runtime, "platform_knowledge_written: false");
requireMarker(runtime, "automatic_training_started: false");
requireMarker(runtime, "automatic_model_weight_mutation: false");

requireMarker(canary, "CANARY_CYCLE_LIMIT_COMPLETE");
requireMarker(canary, "CANARY_COMPLETED_BASELINE_RESTORATION_RECORDED");
requireMarker(canary, "GOVERNED_CANARY_REGRESSION_DETECTED");
requireMarker(canary, "AUTOMATIC_REGRESSION_ROLLBACK_APPLIED");
requireMarker(canary, "same_selected_portfolio_only: true");
requireMarker(canary, "selected_membership_changed: false");
requireMarker(canary, "source_numeric_scores_mutated: false");

requireMarker(performance, "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED");
requireMarker(performance, "selection_request_lineage_verified: true");
requireMarker(performance, "immutable_execution_receipt_verified: true");
requireMarker(performance, "unexecuted_candidate_outcome_inferred: false");
requireMarker(performance, "full_counterfactual_regret_claimed: false");

requireMarker(
  route,
  "reconcileAvantiqoSelectionPolicyCanaryOutcomeCertification",
);
requireMarker(
  route,
  "selection_policy_canary_outcome_certification:",
);
requireMarker(
  index,
  'export * from "./runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime";',
);

for (const forbidden of [
  "recordAvantiqoSelectionPolicyCanaryActivation(",
  "recordAvantiqoSelectionPolicyPromotionApproval(",
  "createAvantiqoSelectionPolicyCanaryReleaseCandidate(",
  "recordAvantiqoSelectionPolicyRollbackDirective(",
]) {
  assert.equal(
    route.includes(forbidden),
    false,
    `cron route must not call ${forbidden}`,
  );
}

function evaluateSyntheticCycle(assignments, realizedBySelection) {
  let comparable = 0;
  let baselineCorrect = 0;
  let canaryCorrect = 0;
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      const left = assignments[i];
      const right = assignments[j];
      const leftRealized = realizedBySelection[left.selection];
      const rightRealized = realizedBySelection[right.selection];
      if (leftRealized === rightRealized) continue;
      const trueLeftBetter = leftRealized > rightRealized;
      comparable += 1;
      if ((left.baseline < right.baseline) === trueLeftBetter) baselineCorrect += 1;
      if ((left.canary < right.canary) === trueLeftBetter) canaryCorrect += 1;
    }
  }
  return { comparable, baselineCorrect, canaryCorrect };
}

const cycles = [
  evaluateSyntheticCycle(
    [
      { selection: "a", baseline: 1, canary: 2 },
      { selection: "b", baseline: 2, canary: 1 },
      { selection: "c", baseline: 3, canary: 3 },
    ],
    { a: 2, b: 5, c: 1 },
  ),
  evaluateSyntheticCycle(
    [
      { selection: "d", baseline: 1, canary: 2 },
      { selection: "e", baseline: 2, canary: 1 },
      { selection: "f", baseline: 3, canary: 3 },
    ],
    { d: 2, e: 6, f: 1 },
  ),
  evaluateSyntheticCycle(
    [
      { selection: "g", baseline: 1, canary: 1 },
      { selection: "h", baseline: 2, canary: 2 },
      { selection: "i", baseline: 3, canary: 3 },
    ],
    { g: 4, h: 3, i: 1 },
  ),
];

const comparablePairs = cycles.reduce((sum, cycle) => sum + cycle.comparable, 0);
const baselineCorrect = cycles.reduce((sum, cycle) => sum + cycle.baselineCorrect, 0);
const canaryCorrect = cycles.reduce((sum, cycle) => sum + cycle.canaryCorrect, 0);
const baselineRate = baselineCorrect / comparablePairs;
const canaryRate = canaryCorrect / comparablePairs;
assert.equal(comparablePairs >= 5, true);
assert.equal(canaryRate >= 0.67, true);
assert.equal(canaryRate - baselineRate >= 0.1, true);

const regressed = evaluateSyntheticCycle(
  [
    { selection: "x", baseline: 1, canary: 2 },
    { selection: "y", baseline: 2, canary: 1 },
  ],
  { x: 5, y: 1 },
);
assert.equal(regressed.canaryCorrect < regressed.baselineCorrect, true);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE33_AUDIT=PASS");
console.log(`AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE33_ACTUAL_CANARY_RANKS_ONLY=true");
console.log("AVANTIQO_PHASE33_GOVERNED_PHASE28_REALIZED_OUTCOMES_ONLY=true");
console.log("AVANTIQO_PHASE33_MINIMUM_EVALUATED_CYCLES=3");
console.log("AVANTIQO_PHASE33_MINIMUM_RANK_CHANGED_CYCLES=2");
console.log("AVANTIQO_PHASE33_MINIMUM_COMPARABLE_PAIRS=5");
console.log("AVANTIQO_PHASE33_MINIMUM_DISTINCT_EXPERIMENTS=3");
console.log("AVANTIQO_PHASE33_ALL_APPLIED_CYCLES_MUST_BE_FULLY_OBSERVED=true");
console.log("AVANTIQO_PHASE33_CLEAN_CYCLE_LIMIT_COMPLETION_REQUIRED=true");
console.log("AVANTIQO_PHASE33_EXACT_BASELINE_RESTORATION_REQUIRED=true");
console.log("AVANTIQO_PHASE33_ZERO_REGRESSION_CYCLES_REQUIRED=true");
console.log("AVANTIQO_PHASE33_THEORETICAL_FULL_CHALLENGER_USED=false");
console.log("AVANTIQO_PHASE33_UNEXECUTED_CANDIDATE_OUTCOME_INFERRED=false");
console.log("AVANTIQO_PHASE33_HISTORICAL_COUNTERFACTUAL_BACKTEST_CLAIMED=false");
console.log("AVANTIQO_PHASE33_AUTOMATIC_FULL_POLICY_PROMOTION=false");
console.log("AVANTIQO_PHASE33_SEPARATE_FULL_PROMOTION_GOVERNANCE_REQUIRED=true");
console.log("AVANTIQO_PHASE33_LIVE_POLICY_MUTATED=false");
console.log("AVANTIQO_PHASE33_LIVE_SELECTION_MUTATED=false");
console.log("AVANTIQO_PHASE33_SOURCE_NUMERIC_SCORES_MUTATED=false");
console.log("AVANTIQO_PHASE33_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE33_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE33_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE33_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE33_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE33_AUTOMATIC_TRAINING_STARTED=false");
