import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime.js",
);
const epochPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

for (const file of [runtimePath, epochPath, routePath, indexPath]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE38_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [runtimePath, epochPath, routePath]) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    throw new Error(
      `PHASE38_SYNTAX_CHECK_FAILED:${file}:${checked.stderr || checked.stdout}`,
    );
  }
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const epoch = fs.readFileSync(epochPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const CONTRACT = "AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_V1";
const ALGORITHM = "POST_ACTIVATION_RESIDUAL_CALIBRATION_V1";

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`PHASE38_${code}_MISSING`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`PHASE38_${code}_FORBIDDEN`);
}

requireIncludes(runtime, CONTRACT, "RUNTIME_CONTRACT");
requireIncludes(runtime, ALGORITHM, "ALGORITHM_VERSION");
requireIncludes(
  runtime,
  'const MIN_BASELINE_COMPLETE_CYCLES = 3',
  "MIN_BASELINE_CYCLES",
);
requireIncludes(
  runtime,
  'const MIN_BASELINE_OBSERVATIONS = 6',
  "MIN_BASELINE_OBSERVATIONS",
);
requireIncludes(
  runtime,
  'const MIN_BASELINE_DISTINCT_EXPERIMENTS = 3',
  "MIN_BASELINE_EXPERIMENTS",
);
requireIncludes(runtime, 'const MIN_REVIEW_COMPLETE_CYCLES = 3', "MIN_REVIEW_CYCLES");
requireIncludes(runtime, 'const MIN_REVIEW_COMPARABLE_PAIRS = 5', "MIN_REVIEW_PAIRS");
requireIncludes(
  runtime,
  'const MIN_REVIEW_DISTINCT_EXPERIMENTS = 3',
  "MIN_REVIEW_EXPERIMENTS",
);
requireIncludes(
  runtime,
  'const MIN_REVIEW_CHALLENGER_CORRECT_RATE = 0.67',
  "MIN_REVIEW_CORRECTNESS",
);
requireIncludes(
  runtime,
  'const MIN_REVIEW_RATE_ADVANTAGE = 0.1',
  "MIN_REVIEW_ADVANTAGE",
);
requireIncludes(runtime, 'const MIN_RESIDUAL_FACTOR = 0.25', "RESIDUAL_FLOOR");

requireIncludes(
  runtime,
  'residual_calibration_reference: "CURRENT_PERSISTENT_BLENDED_SCORE"',
  "CURRENT_PERSISTENT_SCORE_BASELINE",
);
requireIncludes(
  runtime,
  'const persistentScore = Number(assignment.persistent_blended_score)',
  "PERSISTENT_SCORE_READ",
);
requireIncludes(
  runtime,
  'current_persistent_baseline_score: baselineScore',
  "PERSISTENT_BASELINE_SNAPSHOT",
);
requireIncludes(
  runtime,
  'original_phase17_score: Number(assignment.baseline_score)',
  "ORIGINAL_SCORE_LINEAGE_ONLY",
);
requireIncludes(
  runtime,
  'const challengerScore = baselineScore * factor',
  "REBASED_SCORE_FORMULA",
);
requireIncludes(
  runtime,
  'challenger_score_can_exceed_current_persistent_baseline: false',
  "NO_SCORE_INCREASE",
);
requireIncludes(
  runtime,
  'challenger_policy_version_is_distinct_from_promoted_version',
  "DISTINCT_VERSION",
);
requireIncludes(
  runtime,
  'text(proposalMetadata.challenger_policy_version, 180) ===\n      text(policy.challenger_policy_version, 180)',
  "DISTINCT_VERSION_FAIL_CLOSED",
);

requireIncludes(runtime, OUTCOME_CONTRACT = "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1", "PHASE28_CONTRACT");
requireIncludes(
  runtime,
  '"OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED"',
  "PHASE28_STATUS",
);
requireIncludes(runtime, 'metadata.selection_request_lineage_verified === true', "REQUEST_LINEAGE");
requireIncludes(runtime, 'metadata.immutable_execution_receipt_verified === true', "RECEIPT_LINEAGE");
requireIncludes(runtime, 'metadata.information_outcome_qualified === true', "QUALIFIED_OUTCOME");
requireIncludes(runtime, 'metadata.unexecuted_candidate_outcome_inferred === false', "NO_UNEXECUTED_INFERENCE_INPUT");
requireIncludes(runtime, 'metadata.full_counterfactual_regret_claimed === false', "NO_FULL_COUNTERFACTUAL_INPUT");
requireIncludes(
  runtime,
  'row.status === "COMPLETE_NON_REGRESSIVE_CYCLE"',
  "COMPLETE_NON_REGRESSIVE_BASELINE",
);
requireIncludes(runtime, 'row.regression_detected === false', "NO_REGRESSION_BASELINE");
requireIncludes(runtime, 'row.lineage_ambiguity_detected === false', "NO_AMBIGUITY_BASELINE");
requireIncludes(runtime, '.gte("created_at", policy.activated_at)', "POST_ACTIVATION_QUERY_BOUND");
requireIncludes(runtime, 'historical_pre_activation_outcomes_used: false', "NO_PREACTIVATION_HISTORY");
requireIncludes(runtime, 'unexecuted_candidate_outcomes_inferred: false', "NO_UNEXECUTED_INFERENCE");
requireIncludes(runtime, 'full_counterfactual_backtest_claimed: false', "NO_FULL_COUNTERFACTUAL");

requireIncludes(
  runtime,
  'captured_after_current_persistent_policy_application: true',
  "SNAPSHOT_AFTER_APPLICATION",
);
requireIncludes(runtime, 'created_before_execution_request: true', "SNAPSHOT_BEFORE_REQUEST");
requireIncludes(
  runtime,
  'prospective_same_selected_portfolio_comparison_only: true',
  "SAME_PORTFOLIO_ONLY",
);
requireIncludes(
  runtime,
  'if (await executionRequestExists(organizationId, selectionFingerprints))',
  "REQUEST_BARRIER",
);
requireIncludes(
  runtime,
  'if (baselineLeftWins === challengerLeftWins) continue',
  "RANK_CHANGED_PAIRS_ONLY",
);
requireIncludes(
  runtime,
  'memory_key: `rebased-selection-policy-evaluation:${text(metadata.snapshot_fingerprint, 128).slice(0, 40)}`',
  "ONE_EVALUATION_PER_SNAPSHOT",
);
requireIncludes(
  runtime,
  'authoritative_evaluation_per_selection_cycle: true',
  "AUTHORITATIVE_EVALUATION",
);
requireIncludes(runtime, 'challengerRegret <= baselineRegret', "NO_HIGHER_REGRET");
requireIncludes(runtime, 'worseCycles === 0', "ZERO_BASELINE_WINNING_CYCLES");
requireIncludes(runtime, 'promotion_review_candidate: reviewCandidate', "REVIEW_ONLY");
requireIncludes(runtime, 'promotion_authorized: false', "NO_PROMOTION_AUTH");
requireIncludes(runtime, 'canary_authorized: false', "NO_CANARY_AUTH");
requireIncludes(runtime, 'activation_authorized: false', "NO_ACTIVATION_AUTH");
requireIncludes(runtime, 'automatic_policy_promotion: false', "NO_AUTO_PROMOTION");
requireIncludes(runtime, 'automatic_policy_activation: false', "NO_AUTO_ACTIVATION");
requireIncludes(
  runtime,
  'selected_membership_change_authorized: false',
  "NO_MEMBERSHIP_CHANGE",
);
requireIncludes(
  runtime,
  'source_numeric_score_mutation_authorized: false',
  "NO_SOURCE_SCORE_MUTATION",
);
requireIncludes(runtime, 'live_ordering_mutated: false', "NO_LIVE_ORDERING_MUTATION");
requireIncludes(runtime, 'provider_called_here: false', "NO_PROVIDER_CALL");
requireIncludes(runtime, 'wallet_write_performed_here: false', "NO_WALLET_WRITE");
requireIncludes(runtime, 'runpod_job_submitted: false', "NO_RUNPOD_JOB");
requireIncludes(runtime, 'platform_knowledge_written: false', "NO_KNOWLEDGE_WRITE");
requireIncludes(runtime, 'automatic_training_started: false', "NO_TRAINING");
requireIncludes(runtime, 'automatic_model_weight_mutation: false', "NO_WEIGHT_MUTATION");
requireIncludes(runtime, 'execution_authorized: false', "NO_EXECUTION_AUTH");

requireIncludes(
  epoch,
  'future_challenger_must_bind_current_baseline_policy_fingerprint: true',
  "PHASE37_BASELINE_BINDING",
);
requireIncludes(
  epoch,
  'future_challenger_requires_post_activation_governed_evidence: true',
  "PHASE37_POST_ACTIVATION_REQUIREMENT",
);
requireIncludes(
  epoch,
  'old_challenger_recursive_reapplication_as_new_policy_allowed: false',
  "PHASE37_NO_RECURSION",
);

requireIncludes(
  index,
  './runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime',
  "INDEX_EXPORT",
);
requireIncludes(
  route,
  'reconcileAvantiqoRebasedSelectionPolicyChallenger',
  "ROUTE_IMPORT",
);
requireIncludes(
  route,
  'rebased_selection_policy_challenger: rebasedSelectionPolicyChallenger',
  "ROUTE_RESPONSE",
);
requireIncludes(
  route,
  'BLOCKED_BY_REBASED_SELECTION_POLICY_CHALLENGER_FAIL_CLOSED',
  "EXECUTION_BLOCK",
);
requireIncludes(
  route,
  'rebasedSelectionPolicyChallenger.success !== false',
  "EXECUTION_GATE",
);

const applicationCall = route.indexOf(
  "await reconcileAvantiqoPersistentOrderingPolicyApplication()",
);
const monitorCall = route.indexOf(
  "await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()",
);
const challengerCall = route.indexOf(
  "await reconcileAvantiqoRebasedSelectionPolicyChallenger()",
);
const executionCall = route.indexOf(
  "await reconcileAvantiqoExperimentExecutionRequests()",
);
if (
  !(
    applicationCall >= 0 &&
    monitorCall > applicationCall &&
    challengerCall > monitorCall &&
    executionCall > challengerCall
  )
) {
  throw new Error("PHASE38_ROUTE_ORDER_INVALID");
}

requireExcludes(route, "activateAvantiqoPersistentOrderingPolicy(", "CRON_AUTO_ACTIVATION");
requireExcludes(
  route,
  "activate_avantiqo_intelligence_persistent_ordering_policy_v1",
  "CRON_DIRECT_ACTIVATION_RPC",
);

const waitingBlock = runtime.indexOf(
  'status: "WAITING_FOR_MATURE_POST_ACTIVATION_BASELINE_EVIDENCE"',
);
const waitingSuccess = runtime.lastIndexOf("success: true", waitingBlock);
if (!(waitingBlock >= 0 && waitingSuccess >= 0 && waitingBlock - waitingSuccess < 500)) {
  throw new Error("PHASE38_INSUFFICIENT_EVIDENCE_MUST_NOT_FAIL_CLOSED");
}
requireIncludes(
  runtime,
  'status: "POST_ACTIVATION_BASELINE_EVIDENCE_AMBIGUOUS_FAIL_CLOSED"',
  "AMBIGUITY_FAIL_CLOSED",
);

const markers = {
  AVANTIQO_LEARNING_WORLDCLASS_PHASE38_AUDIT: "PASS",
  AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT: CONTRACT,
  AVANTIQO_PHASE38_CURRENT_PERSISTENT_SCORE_IS_BASELINE: true,
  AVANTIQO_PHASE38_ORIGINAL_PHASE17_SCORE_IS_BASELINE: false,
  AVANTIQO_PHASE38_DISTINCT_CHALLENGER_VERSION_REQUIRED: true,
  AVANTIQO_PHASE38_POST_ACTIVATION_EVIDENCE_ONLY: true,
  AVANTIQO_PHASE38_COMPLETE_NON_REGRESSIVE_BASELINE_CYCLES_REQUIRED: 3,
  AVANTIQO_PHASE38_MIN_GOVERNED_OBSERVATIONS: 6,
  AVANTIQO_PHASE38_MIN_DISTINCT_EXPERIMENTS: 3,
  AVANTIQO_PHASE38_UNEXECUTED_OUTCOME_INFERENCE: false,
  AVANTIQO_PHASE38_FULL_COUNTERFACTUAL_BACKTEST: false,
  AVANTIQO_PHASE38_CHALLENGER_CAN_EXCEED_CURRENT_BASELINE: false,
  AVANTIQO_PHASE38_PROSPECTIVE_SAME_PORTFOLIO_ONLY: true,
  AVANTIQO_PHASE38_SNAPSHOT_AFTER_PHASE35_APPLICATION: true,
  AVANTIQO_PHASE38_SNAPSHOT_BEFORE_EXECUTION_REQUEST: true,
  AVANTIQO_PHASE38_RANK_CHANGED_PAIRS_ONLY: true,
  AVANTIQO_PHASE38_ONE_AUTHORITATIVE_EVALUATION_PER_CYCLE: true,
  AVANTIQO_PHASE38_PROMOTION_REVIEW_ONLY: true,
  AVANTIQO_PHASE38_AUTOMATIC_PROMOTION: false,
  AVANTIQO_PHASE38_AUTOMATIC_CANARY: false,
  AVANTIQO_PHASE38_AUTOMATIC_ACTIVATION: false,
  AVANTIQO_PHASE38_EXECUTION_REQUESTS_BLOCKED_ON_AMBIGUITY: true,
  AVANTIQO_PHASE38_INSUFFICIENT_EVIDENCE_BLOCKS_EXECUTION: false,
  AVANTIQO_PHASE38_SELECTED_MEMBERSHIP_CHANGE_ALLOWED: false,
  AVANTIQO_PHASE38_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE38_LIVE_ORDERING_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE38_PROVIDER_CALL_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE38_WALLET_WRITE_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE38_RUNPOD_JOB_SUBMITTED_BY_AUDIT: false,
  AVANTIQO_PHASE38_EXECUTION_AUTHORIZED: false,
  AVANTIQO_PHASE38_PLATFORM_KNOWLEDGE_WRITTEN: false,
  AVANTIQO_PHASE38_AUTOMATIC_TRAINING_STARTED: false,
  AVANTIQO_PHASE38_AUTOMATIC_MODEL_WEIGHT_MUTATION: false,
};

for (const [key, value] of Object.entries(markers)) {
  console.log(`${key}=${String(value)}`);
}
