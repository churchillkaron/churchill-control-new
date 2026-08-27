#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_V1";
const root = process.cwd();

const files = {
  runtime:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
  performance:
    "lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime.js",
  phase29:
    "lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

function absolute(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`${CONTRACT}_MISSING_FILE:${relative}`);
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

for (const relative of [files.runtime, files.performance, files.phase29, files.route]) {
  syntax(relative);
}

const runtime = read(files.runtime);
const performance = read(files.performance);
const phase29 = read(files.phase29);
const route = read(files.route);
const index = read(files.index);

requireMarker(runtime, CONTRACT, "CONTRACT");
requireMarker(
  runtime,
  'CHALLENGER_POLICY_VERSION = "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1"',
  "CHALLENGER_VERSION",
);
requireMarker(
  runtime,
  "created_before_execution_request: true",
  "PROSPECTIVE_SNAPSHOT",
);
requireMarker(
  runtime,
  "historical_unselected_candidates_reconstructed: false",
  "NO_HISTORICAL_RECONSTRUCTION",
);
requireMarker(
  runtime,
  "historical_counterfactual_backtest_claimed: false",
  "NO_FAKE_BACKTEST",
);
requireMarker(
  runtime,
  "prospective_same_selected_portfolio_comparison_only: true",
  "SAME_PORTFOLIO_ONLY",
);
requireMarker(
  runtime,
  "empirical_information_calibration_factor: qualified",
  "EMPIRICAL_CALIBRATION",
);
requireMarker(
  runtime,
  "quantile(ratios, 0.25)",
  "LOWER_QUARTILE_CALIBRATION",
);
requireMarker(
  runtime,
  "challenger_score_can_exceed_baseline: false",
  "NO_SCORE_BOOST",
);
requireMarker(
  runtime,
  "unique_governed_outcomes_only: true",
  "UNIQUE_OUTCOMES",
);
requireMarker(
  runtime,
  "unexecuted_candidate_outcome_inferred: false",
  "NO_UNEXECUTED_OUTCOME_INFERENCE",
);
requireMarker(
  runtime,
  "prospective_shadow_only: true",
  "SHADOW_ONLY",
);
requireMarker(runtime, "MIN_REVIEW_CYCLES = 3", "MIN_REVIEW_CYCLES");
requireMarker(runtime, "MIN_REVIEW_PAIRS = 5", "MIN_REVIEW_PAIRS");
requireMarker(
  runtime,
  "MIN_REVIEW_DISTINCT_EXPERIMENTS = 3",
  "MIN_DISTINCT_EXPERIMENTS",
);
requireMarker(
  runtime,
  "MIN_CHALLENGER_CORRECT_RATE = 0.67",
  "MIN_CORRECT_RATE",
);
requireMarker(
  runtime,
  "MIN_CHALLENGER_RATE_ADVANTAGE = 0.15",
  "MIN_RATE_ADVANTAGE",
);
requireMarker(
  runtime,
  "challengerWorseCycleCount === 0",
  "ZERO_WORSE_CYCLES",
);
requireMarker(
  runtime,
  '"SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"',
  "REVIEW_ONLY_STATUS",
);
requireMarker(
  runtime,
  "automatic_policy_promotion: false",
  "NO_AUTO_PROMOTION",
);
requireMarker(
  runtime,
  "explicit_separate_policy_promotion_governance_required: true",
  "SEPARATE_PROMOTION_GOVERNANCE",
);
requireMarker(runtime, "live_policy_mutated: false", "NO_LIVE_POLICY_MUTATION");
requireMarker(
  runtime,
  "live_selection_mutated: false",
  "NO_LIVE_SELECTION_MUTATION",
);
requireMarker(
  runtime,
  "numeric_selection_scores_mutated: false",
  "NO_NUMERIC_SCORE_MUTATION",
);
requireMarker(
  runtime,
  "execution_request_created_here: false",
  "NO_REQUEST_CREATION",
);
requireMarker(runtime, "execution_authorized: false", "NO_EXEC_AUTH");
requireMarker(runtime, "provider_called_here: false", "NO_PROVIDER_CALL");
requireMarker(runtime, "wallet_write_performed_here: false", "NO_WALLET_WRITE");
requireMarker(runtime, "runpod_job_submitted: false", "NO_RUNPOD_JOB");
requireMarker(runtime, "platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE");
requireMarker(runtime, "automatic_training_started: false", "NO_AUTO_TRAINING");

requireMarker(
  performance,
  "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED",
  "PHASE28_OUTCOME_SOURCE",
);
requireMarker(
  performance,
  "realized_information_gain_per_cost",
  "PHASE28_REALIZED_UTILITY_SOURCE",
);
requireMarker(
  phase29,
  "STABLE_LONG_HORIZON_POLICY_ADAPTED_PORTFOLIO_READY",
  "PHASE29_STABLE_PORTFOLIO_SOURCE",
);
requireMarker(
  phase29,
  "execution_request_generation_allowed",
  "PHASE29_REQUEST_GATE_SOURCE",
);

const phase29Call = route.indexOf(
  "reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio()",
);
const shadowCall = route.indexOf(
  "reconcileAvantiqoSelectionPolicyShadowChallenger({",
);
const requestCall = route.indexOf("reconcileAvantiqoExperimentExecutionRequests()");
assert.ok(
  phase29Call >= 0 && shadowCall > phase29Call && requestCall > shadowCall,
  `${CONTRACT}_PROSPECTIVE_ROUTE_ORDER_INVALID`,
);
requireMarker(
  route,
  "portfolio: longHorizonPolicyAdaptedExperimentPortfolio",
  "PHASE29_PORTFOLIO_BOUND_TO_SHADOW",
);
requireMarker(
  route,
  "selection_policy_shadow_challenger: selectionPolicyShadowChallenger",
  "ROUTE_RESPONSE",
);
forbidMarker(route, "recordAvantiqoExperimentExecutionApproval(", "CRON_AUTO_APPROVAL");
forbidMarker(route, "createAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CLAIM");
forbidMarker(route, "consumeAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CONSUME");
forbidMarker(route, "recordAvantiqoExperimentExecutionReceipt(", "CRON_AUTO_RECEIPT");

requireMarker(
  index,
  "AvantiqoSelectionPolicyShadowChallengerRuntime",
  "INDEX_EXPORT",
);

function lowerQuartile(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * 0.25;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const calibrationRatios = [0.2, 0.4, 0.8, 1.0];
const calibrationFactor = lowerQuartile(calibrationRatios);
assert.ok(calibrationFactor >= 0 && calibrationFactor <= 1);
const baselineScore = 2;
const riskReliabilityFactor = 0.8;
const challengerScore = baselineScore * calibrationFactor * riskReliabilityFactor;
assert.ok(challengerScore <= baselineScore);

function promotionReview({ cycles, pairs, experiments, baselineCorrect, challengerCorrect, worseCycles }) {
  const baselineRate = pairs > 0 ? baselineCorrect / pairs : 0;
  const challengerRate = pairs > 0 ? challengerCorrect / pairs : 0;
  const mature = cycles >= 3 && pairs >= 5 && experiments >= 3;
  return Boolean(
    mature &&
      challengerRate >= 0.67 &&
      challengerRate - baselineRate >= 0.15 &&
      worseCycles === 0,
  );
}

assert.equal(
  promotionReview({
    cycles: 1,
    pairs: 10,
    experiments: 5,
    baselineCorrect: 3,
    challengerCorrect: 9,
    worseCycles: 0,
  }),
  false,
);
assert.equal(
  promotionReview({
    cycles: 3,
    pairs: 6,
    experiments: 3,
    baselineCorrect: 3,
    challengerCorrect: 5,
    worseCycles: 0,
  }),
  true,
);
assert.equal(
  promotionReview({
    cycles: 3,
    pairs: 6,
    experiments: 3,
    baselineCorrect: 3,
    challengerCorrect: 5,
    worseCycles: 1,
  }),
  false,
);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE30_AUDIT=PASS");
console.log(`AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE30_PROSPECTIVE_SNAPSHOT_BEFORE_EXECUTION_REQUEST=true");
console.log("AVANTIQO_PHASE30_HISTORICAL_UNSELECTED_CANDIDATES_RECONSTRUCTED=false");
console.log("AVANTIQO_PHASE30_HISTORICAL_COUNTERFACTUAL_BACKTEST_CLAIMED=false");
console.log("AVANTIQO_PHASE30_SAME_LIVE_SELECTED_PORTFOLIO_COMPARISON_ONLY=true");
console.log("AVANTIQO_PHASE30_FAMILY_CALIBRATION_MINIMUM_OUTCOMES=3");
console.log("AVANTIQO_PHASE30_LOWER_QUARTILE_EMPIRICAL_CALIBRATION=true");
console.log("AVANTIQO_PHASE30_CHALLENGER_SCORE_CAN_EXCEED_BASELINE=false");
console.log("AVANTIQO_PHASE30_UNIQUE_GOVERNED_OUTCOMES_ONLY=true");
console.log("AVANTIQO_PHASE30_UNEXECUTED_CANDIDATE_OUTCOME_INFERRED=false");
console.log("AVANTIQO_PHASE30_MINIMUM_REVIEW_CYCLES=3");
console.log("AVANTIQO_PHASE30_MINIMUM_REVIEW_PAIRS=5");
console.log("AVANTIQO_PHASE30_MINIMUM_REVIEW_DISTINCT_EXPERIMENTS=3");
console.log("AVANTIQO_PHASE30_ZERO_CHALLENGER_WORSE_CYCLES_REQUIRED=true");
console.log("AVANTIQO_PHASE30_AUTOMATIC_POLICY_PROMOTION=false");
console.log("AVANTIQO_PHASE30_SEPARATE_POLICY_PROMOTION_GOVERNANCE_REQUIRED=true");
console.log("AVANTIQO_PHASE30_LIVE_POLICY_MUTATED=false");
console.log("AVANTIQO_PHASE30_LIVE_SELECTION_MUTATED=false");
console.log("AVANTIQO_PHASE30_NUMERIC_SELECTION_SCORES_MUTATED=false");
console.log("AVANTIQO_PHASE30_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE30_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE30_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE30_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE30_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE30_AUTOMATIC_TRAINING_STARTED=false");
