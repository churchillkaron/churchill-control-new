#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime.js",
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
  if (!condition) throw new Error(`AVANTIQO_PHASE28_${code}=FAIL`);
}

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`AVANTIQO_PHASE28_SYNTAX_CHECK_FAILED:${path.relative(root, file)}`);
  }
}

for (const file of [runtimePath, routePath]) syntaxCheck(file);

const runtime = read(runtimePath);
const route = read(routePath);
const index = read(indexPath);

requireTrue(
  runtime.includes('"AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1"'),
  "CONTRACT_MISSING",
);
requireTrue(
  runtime.includes('"platform_learning_experiment_execution_requests"') &&
    runtime.includes('"platform_learning_experiment_execution_receipts"') &&
    runtime.includes('"platform_learning_experiment_information_outcome_assessments"'),
  "GOVERNED_LINEAGE_SCOPES_MISSING",
);
requireTrue(
  runtime.includes("selection_request_lineage_verified: true") &&
    runtime.includes("immutable_execution_receipt_verified: true"),
  "LINEAGE_VERIFICATION_MISSING",
);
requireTrue(
  runtime.includes("const MIN_INDEPENDENT_ASSESSORS = 2") &&
    runtime.includes("const MIN_ASSESSMENT_METHODS = 2") &&
    runtime.includes("qualified_information_requires_independent_assessors: true") &&
    runtime.includes("qualified_information_requires_method_diversity: true"),
  "INDEPENDENT_ASSESSMENT_REQUIREMENTS_MISSING",
);
requireTrue(
  runtime.includes("conservative_observed_information_gain_bits") &&
    runtime.includes("Math.min(...values)"),
  "CONSERVATIVE_OBSERVED_INFORMATION_GAIN_MISSING",
);
requireTrue(
  runtime.includes("actual_cost_units") &&
    runtime.includes("realized_information_gain_per_cost"),
  "REALIZED_COST_PERFORMANCE_MISSING",
);
requireTrue(
  runtime.includes("execution_failure_rate") &&
    runtime.includes("information_gain_per_cost_overprediction_rate"),
  "LONG_HORIZON_PERFORMANCE_METRICS_MISSING",
);
requireTrue(
  runtime.includes("pairwiseRankEvidence") &&
    runtime.includes("mean_observed_within_portfolio_rank_regret") &&
    runtime.includes(
      "observed_within_portfolio_rank_regret_is_not_full_counterfactual_regret: true",
    ),
  "RANK_REGRET_SEMANTICS_MISSING",
);
requireTrue(
  runtime.includes("unexecuted_candidate_outcome_inferred: false") &&
    runtime.includes("full_counterfactual_regret_claimed: false"),
  "COUNTERFACTUAL_GUARD_MISSING",
);
requireTrue(
  runtime.includes("const MIN_MATURE_EXECUTIONS = 5") &&
    runtime.includes("const MIN_MATURE_DISTINCT_EXPERIMENTS = 3") &&
    runtime.includes("const MIN_MATURE_SELECTION_CYCLES = 3") &&
    runtime.includes("const MIN_MATURE_INFORMATION_OUTCOMES = 3"),
  "MATURITY_THRESHOLDS_MISSING",
);
requireTrue(
  runtime.includes("LONG_HORIZON_SELECTION_POLICY_REVIEW_RECOMMENDED") &&
    runtime.includes("MATURE_LONG_HORIZON_PORTFOLIO_PERFORMANCE_ACCEPTABLE"),
  "MATURE_PROFILE_STATES_MISSING",
);
requireTrue(
  runtime.includes("single_execution_can_change_selection_policy: false") &&
    runtime.includes("automatic_selection_penalty_applied: false") &&
    runtime.includes("automatic_selection_boost_applied: false") &&
    runtime.includes("separate_governed_selection_policy_integration_required: true"),
  "SELECTION_POLICY_MUTATION_GUARD_MISSING",
);
requireTrue(
  runtime.includes("execution_authorized: false") &&
    runtime.includes("spend_authorized: false") &&
    runtime.includes("provider_execution_authorized: false") &&
    runtime.includes("runpod_job_submitted: false") &&
    runtime.includes("wallet_write_performed_here: false") &&
    runtime.includes("platform_knowledge_written: false") &&
    runtime.includes("automatic_training_started: false") &&
    runtime.includes("automatic_model_weight_mutation: false") &&
    runtime.includes("selection_policy_mutated: false"),
  "GOVERNANCE_FALSE_MARKERS_MISSING",
);

const assessorCalibrationCall = route.indexOf(
  "reconcileAvantiqoExperimentOutcomeAssessorCalibration()",
);
const estimatorCalibrationCall = route.indexOf(
  "reconcileAvantiqoExperimentEstimatorCalibration()",
);
const performanceCall = route.indexOf(
  "reconcileAvantiqoExperimentPortfolioPerformance()",
);
const portfolioCall = route.indexOf(
  "reconcileAvantiqoCalibrationBackfilledExperimentPortfolio()",
);
requireTrue(
  assessorCalibrationCall >= 0 &&
    estimatorCalibrationCall > assessorCalibrationCall &&
    performanceCall > estimatorCalibrationCall &&
    portfolioCall > performanceCall,
  "CRON_ORDER_INVALID",
);
requireTrue(
  route.includes("experiment_portfolio_performance: experimentPortfolioPerformance"),
  "CRON_RESULT_EXPOSURE_MISSING",
);
requireTrue(
  index.includes(
    'export * from "./runtime/AvantiqoExperimentPortfolioPerformanceRuntime";',
  ),
  "INDEX_EXPORT_MISSING",
);

const forbiddenRuntimePatterns = [
  /fetch\s*\(/,
  /RUNPOD_API_KEY/,
  /reserveWallet/i,
  /chargeWallet/i,
  /execution_authorized\s*:\s*true/i,
  /spend_authorized\s*:\s*true/i,
  /provider_execution_authorized\s*:\s*true/i,
  /platform_knowledge_written\s*:\s*true/i,
  /automatic_training_started\s*:\s*true/i,
  /automatic_model_weight_mutation\s*:\s*true/i,
  /automatic_selection_penalty_applied\s*:\s*true/i,
  /automatic_selection_boost_applied\s*:\s*true/i,
  /selection_policy_mutated\s*:\s*true/i,
];
for (const pattern of forbiddenRuntimePatterns) {
  requireTrue(!pattern.test(runtime), `FORBIDDEN_RUNTIME_PATTERN_${pattern}`);
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE28_AUDIT=PASS");
console.log(
  "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT=AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1",
);
console.log("AVANTIQO_PHASE28_LOOKBACK_DAYS=365");
console.log("AVANTIQO_PHASE28_MIN_MATURE_EXECUTIONS=5");
console.log("AVANTIQO_PHASE28_MIN_MATURE_DISTINCT_EXPERIMENTS=3");
console.log("AVANTIQO_PHASE28_MIN_MATURE_SELECTION_CYCLES=3");
console.log("AVANTIQO_PHASE28_MIN_MATURE_INFORMATION_OUTCOMES=3");
console.log("AVANTIQO_PHASE28_UNEXECUTED_CANDIDATE_OUTCOME_INFERRED=false");
console.log("AVANTIQO_PHASE28_FULL_COUNTERFACTUAL_REGRET_CLAIMED=false");
console.log("AVANTIQO_PHASE28_WITHIN_SELECTED_PORTFOLIO_RANK_REGRET_ONLY=true");
console.log("AVANTIQO_PHASE28_SINGLE_EXECUTION_CAN_CHANGE_SELECTION_POLICY=false");
console.log("AVANTIQO_PHASE28_AUTOMATIC_SELECTION_PENALTY_APPLIED=false");
console.log("AVANTIQO_PHASE28_AUTOMATIC_SELECTION_BOOST_APPLIED=false");
console.log("AVANTIQO_PHASE28_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE28_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE28_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE28_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE28_SELECTION_POLICY_MUTATED=false");
console.log("AVANTIQO_PHASE28_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE28_AUTOMATIC_TRAINING_STARTED=false");
