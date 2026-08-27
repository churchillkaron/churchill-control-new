import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime.js",
);
const phase38Path = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

for (const file of [runtimePath, phase38Path, routePath, indexPath]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE39_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [runtimePath, phase38Path, routePath]) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    throw new Error(
      `PHASE39_SYNTAX_CHECK_FAILED:${file}:${checked.stderr || checked.stdout}`,
    );
  }
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const phase38 = fs.readFileSync(phase38Path, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const CONTRACT = "AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1";

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`PHASE39_${code}_MISSING`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`PHASE39_${code}_FORBIDDEN`);
}

requireIncludes(runtime, CONTRACT, "RUNTIME_CONTRACT");
requireIncludes(
  runtime,
  "platform_learning_rebased_selection_policy_promotion_requests",
  "REQUEST_SCOPE",
);
requireIncludes(
  runtime,
  "platform_learning_rebased_selection_policy_promotion_approvals",
  "APPROVAL_SCOPE",
);
requireIncludes(
  runtime,
  "platform_learning_rebased_selection_policy_canary_release_candidates",
  "RELEASE_SCOPE",
);
requireExcludes(
  runtime,
  "platform_learning_experiment_selection_policy_promotion_requests",
  "OLD_PHASE31_REQUEST_SCOPE",
);
requireExcludes(
  runtime,
  "platform_learning_experiment_selection_policy_promotion_approvals",
  "OLD_PHASE31_APPROVAL_SCOPE",
);
requireExcludes(
  runtime,
  "platform_learning_experiment_selection_policy_canary_release_candidates",
  "OLD_PHASE31_RELEASE_SCOPE",
);

requireIncludes(
  runtime,
  "AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT",
  "PHASE38_CONTRACT_BINDING",
);
requireIncludes(
  runtime,
  "AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_REVIEW_SCOPE",
  "PHASE38_REVIEW_SCOPE_BINDING",
);
requireIncludes(
  runtime,
  '"REBASED_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"',
  "PHASE38_REVIEW_STATUS",
);
requireIncludes(
  runtime,
  "metadata.promotion_review_candidate === true",
  "PHASE38_REVIEW_CANDIDATE",
);
requireIncludes(
  runtime,
  "text(metadata.current_baseline_policy_fingerprint, 128) === text(policy.policy_fingerprint, 128)",
  "CURRENT_BASELINE_REVIEW_BINDING",
);
requireIncludes(
  runtime,
  "text(metadata.challenger_policy_version, 180) !== text(policy.challenger_policy_version, 180)",
  "DISTINCT_CHALLENGER_VERSION",
);
requireIncludes(
  runtime,
  'status: "MULTIPLE_MATURE_REBASED_CHALLENGERS_FOR_CURRENT_BASELINE_FAIL_CLOSED"',
  "MULTIPLE_CHALLENGERS_FAIL_CLOSED",
);

requireIncludes(runtime, "const PROMOTION_REQUEST_VALIDITY_DAYS = 7", "REQUEST_VALIDITY");
requireIncludes(runtime, "const APPROVAL_VALIDITY_MINUTES = 60", "APPROVAL_VALIDITY");
requireIncludes(runtime, "const RELEASE_CANDIDATE_VALIDITY_DAYS = 7", "RELEASE_VALIDITY");
requireIncludes(runtime, "const MAX_CANARY_INFLUENCE_FRACTION = 0.25", "MAX_CANARY_INFLUENCE");
requireIncludes(runtime, "const MAX_CANARY_CYCLES = 3", "MAX_CANARY_CYCLES");

requireIncludes(
  runtime,
  "exact_current_baseline_must_remain_active: true",
  "BASELINE_MUST_REMAIN_ACTIVE_REQUEST",
);
requireIncludes(
  runtime,
  "explicit_independent_approval_required: true",
  "EXPLICIT_INDEPENDENT_APPROVAL",
);
requireIncludes(runtime, "approval_is_not_activation: true", "APPROVAL_NOT_ACTIVATION");
requireIncludes(
  runtime,
  "approval_is_not_release_candidate: true",
  "APPROVAL_NOT_RELEASE",
);
requireIncludes(
  runtime,
  "release_candidate_requires_separate_explicit_call: true",
  "SEPARATE_RELEASE_CALL",
);
requireIncludes(
  runtime,
  "canary_activation_requires_separate_phase: true",
  "SEPARATE_ACTIVATION_PHASE",
);
requireIncludes(
  runtime,
  "canary_application_requires_separate_phase: true",
  "SEPARATE_APPLICATION_PHASE",
);
requireIncludes(
  runtime,
  "canary_influence_is_relative_to_current_persistent_baseline: true",
  "CANARY_RELATIVE_TO_CURRENT_BASELINE",
);
requireIncludes(runtime, "full_policy_cutover_allowed: false", "NO_FULL_CUTOVER_REQUEST");

requireIncludes(
  runtime,
  "same_actor_as_phase38_evidence_generator !== false",
  "PHASE38_GENERATOR_ATTESTATION",
);
requireIncludes(
  runtime,
  "same_actor_as_current_baseline_activator !== false",
  "BASELINE_ACTIVATOR_ATTESTATION",
);
requireIncludes(
  runtime,
  "text(policy.activator_fingerprint, 128).toLowerCase() === approverFingerprint",
  "BASELINE_ACTIVATOR_ACTUAL_INDEPENDENCE",
);
requireIncludes(
  runtime,
  "text(requestMetadata.phase38_evidence_generator_fingerprint, 128).toLowerCase() === approverFingerprint",
  "PHASE38_GENERATOR_ACTUAL_INDEPENDENCE",
);
requireIncludes(
  runtime,
  "PHASE38_EVIDENCE_GENERATOR_FINGERPRINT",
  "DETERMINISTIC_PHASE38_GENERATOR",
);
requireIncludes(
  runtime,
  'status: "CURRENT_PERSISTENT_POLICY_BASELINE_INVALID_FAIL_CLOSED"',
  "CURRENT_BASELINE_VALIDATION",
);
requireIncludes(
  runtime,
  "CURRENT_BASELINE_CHANGED_BEFORE_APPROVAL",
  "BASELINE_RECHECK_APPROVAL",
);
requireIncludes(
  runtime,
  "CURRENT_BASELINE_CHANGED_BEFORE_RELEASE",
  "BASELINE_RECHECK_RELEASE",
);

requireIncludes(
  runtime,
  "rebased-selection-policy-promotion-approval:${requestFingerprint.slice(0, 40)}",
  "ONE_APPROVAL_PER_REQUEST_KEY",
);
requireIncludes(
  runtime,
  "rebased-selection-policy-canary-release:${approvalFingerprint.slice(0, 40)}",
  "ONE_RELEASE_PER_APPROVAL_KEY",
);
requireIncludes(
  runtime,
  "DETERMINISTIC_AUTHORITY_KEY_CONFLICT",
  "RACE_CONFLICT_FAIL_CLOSED",
);
requireIncludes(
  runtime,
  "rebased-selection-policy-exact-current-baseline-rollback",
  "EXACT_BASELINE_ROLLBACK_FINGERPRINT",
);
requireIncludes(
  runtime,
  "exact_current_baseline_rollback_required: true",
  "EXACT_BASELINE_ROLLBACK_REQUIRED",
);
requireIncludes(
  runtime,
  "current_baseline_must_remain_active_at_activation: true",
  "BASELINE_ACTIVE_AT_ACTIVATION",
);
requireIncludes(
  runtime,
  "canary_influence_is_incremental_relative_to_current_persistent_baseline: true",
  "INCREMENTAL_INFLUENCE",
);
requireIncludes(
  runtime,
  "current_persistent_policy_is_not_replaced_by_release_candidate: true",
  "PERSISTENT_POLICY_NOT_REPLACED",
);
requireIncludes(
  runtime,
  "release_candidate_is_not_activation: true",
  "RELEASE_NOT_ACTIVATION",
);
requireIncludes(
  runtime,
  "activation_requires_separate_phase40_call: true",
  "PHASE40_ACTIVATION",
);
requireIncludes(
  runtime,
  "application_requires_separate_phase40_runtime: true",
  "PHASE40_APPLICATION",
);
requireIncludes(
  runtime,
  "full_100_percent_challenger_cutover_allowed: false",
  "NO_100_PERCENT_CUTOVER",
);

for (const [needle, code] of [
  ["selected_membership_change_authorized: false", "NO_MEMBERSHIP_CHANGE"],
  ["source_numeric_score_mutation_authorized: false", "NO_SOURCE_SCORE_MUTATION"],
  ["live_ordering_mutation_authorized: false", "NO_LIVE_ORDERING_MUTATION"],
  ["promotion_authorized: false", "NO_PROMOTION_AUTH"],
  ["activation_authorized: false", "NO_ACTIVATION_AUTH"],
  ["execution_authorized: false", "NO_EXECUTION_AUTH"],
  ["provider_execution_authorized: false", "NO_PROVIDER_EXECUTION_AUTH"],
  ["spend_authorized: false", "NO_SPEND_AUTH"],
  ["provider_called_here: false", "NO_PROVIDER_CALL"],
  ["wallet_write_performed_here: false", "NO_WALLET_WRITE"],
  ["runpod_job_submitted: false", "NO_RUNPOD_JOB"],
  ["platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE"],
  ["automatic_training_started: false", "NO_TRAINING"],
  ["automatic_model_weight_mutation: false", "NO_WEIGHT_MUTATION"],
  ["automatic_policy_promotion: false", "NO_AUTO_PROMOTION"],
  ["automatic_policy_activation: false", "NO_AUTO_ACTIVATION"],
]) {
  requireIncludes(runtime, needle, code);
}

requireIncludes(
  phase38,
  'status: reviewCandidate\n        ? "REBASED_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"',
  "PHASE38_REVIEW_SOURCE",
);
requireIncludes(
  phase38,
  "promotion_authorized: false",
  "PHASE38_NO_PROMOTION_AUTH",
);

requireIncludes(
  index,
  './runtime/AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime',
  "INDEX_EXPORT",
);
requireIncludes(
  route,
  "reconcileAvantiqoRebasedSelectionPolicyPromotionRequests",
  "ROUTE_REQUEST_IMPORT",
);
requireIncludes(
  route,
  "rebased_selection_policy_promotion_requests:",
  "ROUTE_RESPONSE",
);
requireIncludes(
  route,
  "rebasedSelectionPolicyPromotionRequests.success !== false",
  "EXECUTION_GATE",
);
requireIncludes(
  route,
  "BLOCKED_BY_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_FAIL_CLOSED",
  "EXECUTION_FAIL_CLOSED_STATUS",
);
requireExcludes(
  route,
  "recordAvantiqoRebasedSelectionPolicyPromotionApproval",
  "CRON_APPROVAL_CALL",
);
requireExcludes(
  route,
  "createAvantiqoRebasedSelectionPolicyCanaryReleaseCandidate",
  "CRON_RELEASE_CALL",
);
requireExcludes(
  route,
  "recordAvantiqoRebasedSelectionPolicyCanaryActivation",
  "CRON_PHASE40_ACTIVATION_CALL",
);

const phase38Call = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyChallenger()");
const phase39Call = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyPromotionRequests()");
const executionCall = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests()");
if (!(phase38Call >= 0 && phase39Call > phase38Call && executionCall > phase39Call)) {
  throw new Error("PHASE39_ROUTE_ORDER_INVALID");
}

const markers = {
  AVANTIQO_LEARNING_WORLDCLASS_PHASE39_AUDIT: "PASS",
  AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT: CONTRACT,
  AVANTIQO_PHASE39_SEPARATE_GOVERNANCE_SCOPES: true,
  AVANTIQO_PHASE39_OLD_PHASE31_34_AUTHORITY_REUSED: false,
  AVANTIQO_PHASE39_CURRENT_PERSISTENT_BASELINE_BOUND: true,
  AVANTIQO_PHASE39_CHALLENGER_VERSION_DISTINCT: true,
  AVANTIQO_PHASE39_MULTIPLE_MATURE_CHALLENGERS_FAIL_CLOSED: true,
  AVANTIQO_PHASE39_REQUEST_VALIDITY_DAYS: 7,
  AVANTIQO_PHASE39_APPROVAL_VALIDITY_MINUTES: 60,
  AVANTIQO_PHASE39_RELEASE_VALIDITY_DAYS: 7,
  AVANTIQO_PHASE39_MAX_CANARY_INFLUENCE: 0.25,
  AVANTIQO_PHASE39_MAX_CANARY_CYCLES: 3,
  AVANTIQO_PHASE39_EXPLICIT_INDEPENDENT_APPROVAL_REQUIRED: true,
  AVANTIQO_PHASE39_APPROVER_DIFFERS_FROM_PHASE38_GENERATOR: true,
  AVANTIQO_PHASE39_APPROVER_DIFFERS_FROM_CURRENT_BASELINE_ACTIVATOR: true,
  AVANTIQO_PHASE39_APPROVAL_IS_ACTIVATION: false,
  AVANTIQO_PHASE39_RELEASE_IS_ACTIVATION: false,
  AVANTIQO_PHASE39_PHASE40_SEPARATE_ACTIVATION_REQUIRED: true,
  AVANTIQO_PHASE39_EXACT_CURRENT_BASELINE_ROLLBACK: true,
  AVANTIQO_PHASE39_CANARY_INFLUENCE_RELATIVE_TO_CURRENT_BASELINE: true,
  AVANTIQO_PHASE39_FULL_100_PERCENT_CUTOVER_ALLOWED: false,
  AVANTIQO_PHASE39_CRON_REQUEST_ONLY: true,
  AVANTIQO_PHASE39_EXECUTION_BLOCKED_ON_GOVERNANCE_AMBIGUITY: true,
  AVANTIQO_PHASE39_SELECTED_MEMBERSHIP_CHANGE_ALLOWED: false,
  AVANTIQO_PHASE39_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE39_LIVE_ORDERING_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE39_PROVIDER_CALL_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE39_WALLET_WRITE_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE39_RUNPOD_JOB_SUBMITTED_BY_AUDIT: false,
  AVANTIQO_PHASE39_EXECUTION_AUTHORIZED: false,
  AVANTIQO_PHASE39_PLATFORM_KNOWLEDGE_WRITTEN: false,
  AVANTIQO_PHASE39_AUTOMATIC_TRAINING_STARTED: false,
  AVANTIQO_PHASE39_AUTOMATIC_MODEL_WEIGHT_MUTATION: false,
};

for (const [key, value] of Object.entries(markers)) {
  console.log(`${key}=${String(value)}`);
}
