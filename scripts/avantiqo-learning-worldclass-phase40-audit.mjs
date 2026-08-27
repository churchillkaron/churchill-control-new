import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyCanaryRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");
const authorityMigrationPath = path.join(
  root,
  "supabase/migrations/20260827061500_phase40_rebased_selection_policy_canary_authority.sql",
);
const canonicalMigrationPath = path.join(
  root,
  "supabase/migrations/20260827062500_phase40_canonical_short_api_aliases.sql",
);

for (const file of [
  runtimePath,
  routePath,
  indexPath,
  authorityMigrationPath,
  canonicalMigrationPath,
]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE40_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [runtimePath, routePath]) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (checked.status !== 0) {
    throw new Error(
      `PHASE40_SYNTAX_CHECK_FAILED:${file}:${checked.stderr || checked.stdout}`,
    );
  }
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const authority = fs.readFileSync(authorityMigrationPath, "utf8");
const canonical = fs.readFileSync(canonicalMigrationPath, "utf8");

const norm = (value) => String(value).replace(/\s+/g, " ").trim();
const runtimeN = norm(runtime);
const routeN = norm(route);
const authorityN = norm(authority);
const canonicalN = norm(canonical);

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`PHASE40_${code}_MISSING`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`PHASE40_${code}_FORBIDDEN`);
}

function requireAtLeast(source, needle, minimum, code) {
  const count = source.split(needle).length - 1;
  if (count < minimum) {
    throw new Error(`PHASE40_${code}_COUNT_${count}_BELOW_${minimum}`);
  }
}

const RUNTIME_CONTRACT = "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_V1";
const DB_AUTHORITY_CONTRACT =
  "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1";
const DB_APPLICATION_CONTRACT =
  "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_APPLICATION_V1";

// Database authority and isolation.
requireIncludes(authority, DB_AUTHORITY_CONTRACT, "DB_AUTHORITY_CONTRACT");
requireIncludes(authority, DB_APPLICATION_CONTRACT, "DB_APPLICATION_CONTRACT");
requireAtLeast(authorityN, "enable row level security", 2, "RLS_ENABLED");
requireAtLeast(
  authorityN,
  "from public, anon, authenticated",
  6,
  "PUBLIC_ANON_AUTH_REVOKES",
);
requireAtLeast(authorityN, "to service_role", 6, "SERVICE_ROLE_GRANTS");
requireAtLeast(authorityN, "security invoker", 4, "SECURITY_INVOKER_FUNCTIONS");
requireAtLeast(
  authority,
  "avantiqo_persistent_ordering_policy_v1:",
  3,
  "SHARED_PHASE35_36_ADVISORY_LOCK",
);
requireIncludes(
  authority,
  "AVANTIQO_PHASE40_ACTIVE_LEGACY_PHASE32_CANARY_CONFLICT",
  "LEGACY_PHASE32_CONFLICT",
);
requireIncludes(
  authority,
  "AVANTIQO_PHASE40_ACTIVE_PERSISTENT_BASELINE_REQUIRED",
  "CURRENT_PERSISTENT_BASELINE_REQUIRED",
);
requireIncludes(
  authority,
  "platform_learning_rebased_selection_policy_canary_release_candidates",
  "PHASE39_RELEASE_SCOPE",
);
requireIncludes(
  authority,
  "platform_learning_rebased_selection_policy_promotion_approvals",
  "PHASE39_APPROVAL_SCOPE",
);
requireIncludes(
  authority,
  "REBASED_CANARY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION",
  "EXACT_PHASE39_RELEASE_STATUS",
);
requireIncludes(
  authority,
  "EXPLICIT_REBASED_POLICY_CANARY_RELEASE_APPROVAL_RECORDED",
  "EXACT_PHASE39_APPROVAL_STATUS",
);
requireIncludes(
  authority,
  "AVANTIQO_PHASE40_ACTIVATOR_INDEPENDENCE_REQUIRED",
  "ACTIVATOR_INDEPENDENCE",
);
requireIncludes(
  authorityN,
  "canary_influence_fraction > 0 and canary_influence_fraction <= 0.25",
  "MAX_CANARY_INFLUENCE",
);
requireIncludes(authorityN, "cycle_limit between 1 and 3", "MAX_CANARY_CYCLES");
requireIncludes(
  authority,
  "avantiqo_rebased_canary_one_active_per_org_idx",
  "ONE_ACTIVE_CANARY_PER_ORG",
);
requireIncludes(
  authority,
  "avantiqo_rebased_canary_release_once_idx",
  "RELEASE_SINGLE_USE",
);
requireIncludes(
  authority,
  "avantiqo_rebased_canary_application_cycle_once_idx",
  "ONE_APPLICATION_PER_CYCLE",
);

// Exact current-baseline application and prospective Phase38 lineage.
requireIncludes(
  authority,
  "REBASED_CANARY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION",
  "APPLICATION_BEFORE_EXECUTION_REQUEST",
);
requireIncludes(
  authority,
  "platform_learning_rebased_selection_policy_challenger_snapshots",
  "PHASE38_SNAPSHOT_SCOPE",
);
requireIncludes(
  authority,
  "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_RECORDED",
  "PHASE38_PROSPECTIVE_SNAPSHOT_STATUS",
);
requireIncludes(
  authorityN,
  "(candidate->>'current_persistent_baseline_rank')::integer <> (baseline->>'persistent_rank')::integer",
  "PHASE35_PERSISTENT_RANK_BINDING",
);
requireIncludes(
  authorityN,
  "(candidate->>'current_persistent_baseline_score')::numeric <> (baseline->>'persistent_blended_score')::numeric",
  "PHASE35_PERSISTENT_SCORE_BINDING",
);
requireIncludes(
  authorityN,
  "(candidate->>'current_persistent_baseline_score')::numeric * (1 - v_activation.canary_influence_fraction)",
  "CURRENT_PERSISTENT_BASELINE_BLEND",
);
requireIncludes(
  authorityN,
  "(candidate->>'rebased_challenger_score')::numeric * v_activation.canary_influence_fraction",
  "REBASED_CHALLENGER_BLEND",
);
requireIncludes(authority, "AVANTIQO_PHASE40_SELECTION_MEMBERSHIP_MISMATCH", "SAME_MEMBERSHIP_GUARD");
requireIncludes(authority, "AVANTIQO_PHASE40_ATOMIC_RANK_UPDATE_INCOMPLETE", "ATOMIC_ROWCOUNT_GUARD");
requireIncludes(authority, "'atomic_database_application', true", "ATOMIC_DB_APPLICATION_EVIDENCE");
requireIncludes(authority, "'selected_membership_changed', false", "NO_MEMBERSHIP_CHANGE_EVIDENCE");
requireIncludes(authority, "'source_numeric_scores_mutated', false", "NO_SOURCE_SCORE_MUTATION_EVIDENCE");
requireIncludes(authority, "'source_score_increase_applied', false", "NO_SOURCE_SCORE_INCREASE_EVIDENCE");

// Exact rollback and persistent-baseline exit composition.
requireIncludes(
  authority,
  "phase40_current_persistent_baseline_rank",
  "CURRENT_BASELINE_RANK_RETAINED",
);
requireIncludes(
  authority,
  "phase40_exact_current_persistent_baseline_restored",
  "EXACT_CURRENT_BASELINE_RESTORATION",
);
requireIncludes(
  authority,
  "avantiqo_rebased_canary_persistent_baseline_exit_v1",
  "PERSISTENT_BASELINE_EXIT_TRIGGER",
);
requireIncludes(authority, "phase35_baseline_rank", "PRE_PERSISTENT_BASELINE_RESTORATION");
requireIncludes(authority, "BASELINE_POLICY_ROLLED_BACK", "BASELINE_ROLLBACK_STATE");
requireIncludes(
  authority,
  "canary_closed_in_same_transaction_as_baseline_exit",
  "SAME_TRANSACTION_BASELINE_EXIT_CLOSE",
);

// Canonical API aliases eliminate reliance on PostgreSQL 63-byte identifier truncation.
requireIncludes(canonical, "PostgreSQL identifiers are limited to 63 bytes", "IDENTIFIER_LIMIT_REPAIR");
requireIncludes(canonical, "avantiqo_rebased_policy_canary_activations", "CANONICAL_ACTIVATION_VIEW");
requireIncludes(canonical, "avantiqo_rebased_policy_canary_applications", "CANONICAL_APPLICATION_VIEW");
requireAtLeast(canonicalN, "security_invoker = true", 2, "SECURITY_INVOKER_VIEWS");
requireIncludes(canonical, "activate_avantiqo_rebased_policy_canary_v1", "CANONICAL_ACTIVATE_RPC");
requireIncludes(canonical, "apply_avantiqo_rebased_policy_canary_v1", "CANONICAL_APPLY_RPC");
requireIncludes(canonical, "close_avantiqo_rebased_policy_canary_v1", "CANONICAL_CLOSE_RPC");
requireAtLeast(canonicalN, "security invoker", 3, "CANONICAL_SECURITY_INVOKER_RPCS");
requireAtLeast(canonicalN, "from public, anon, authenticated", 5, "CANONICAL_REVOKES");
requireAtLeast(canonicalN, "to service_role", 5, "CANONICAL_SERVICE_ROLE_GRANTS");

// Runtime must use only canonical short Data API names.
requireIncludes(runtime, RUNTIME_CONTRACT, "RUNTIME_CONTRACT");
requireIncludes(runtime, 'const ACTIVATION_VIEW = "avantiqo_rebased_policy_canary_activations"', "RUNTIME_CANONICAL_ACTIVATION_VIEW");
requireIncludes(runtime, 'const APPLICATION_VIEW = "avantiqo_rebased_policy_canary_applications"', "RUNTIME_CANONICAL_APPLICATION_VIEW");
requireIncludes(runtime, 'const ACTIVATE_RPC = "activate_avantiqo_rebased_policy_canary_v1"', "RUNTIME_CANONICAL_ACTIVATE_RPC");
requireIncludes(runtime, 'const APPLY_RPC = "apply_avantiqo_rebased_policy_canary_v1"', "RUNTIME_CANONICAL_APPLY_RPC");
requireIncludes(runtime, 'const CLOSE_RPC = "close_avantiqo_rebased_policy_canary_v1"', "RUNTIME_CANONICAL_CLOSE_RPC");
requireExcludes(
  runtime,
  '.from("avantiqo_intelligence_rebased_selection_policy_canary_',
  "RUNTIME_DIRECT_LONG_TABLE_API_DEPENDENCY",
);
requireExcludes(
  runtime,
  '.rpc("activate_avantiqo_intelligence_rebased_selection_policy_canary_',
  "RUNTIME_DIRECT_TRUNCATED_ACTIVATE_RPC_DEPENDENCY",
);

// Governed prospective outcome science.
requireIncludes(
  runtime,
  "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT",
  "PHASE28_CONTRACT_IMPORT",
);
requireIncludes(
  runtime,
  '"OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED"',
  "PHASE28_OUTCOME_STATUS",
);
requireIncludes(runtime, "metadata.selection_request_lineage_verified === true", "REQUEST_LINEAGE_REQUIRED");
requireIncludes(runtime, "metadata.immutable_execution_receipt_verified === true", "IMMUTABLE_RECEIPT_REQUIRED");
requireIncludes(runtime, "metadata.information_outcome_qualified === true", "QUALIFIED_INFORMATION_OUTCOME_REQUIRED");
requireIncludes(runtime, "metadata.unexecuted_candidate_outcome_inferred === false", "NO_UNEXECUTED_INFERENCE");
requireIncludes(runtime, "metadata.full_counterfactual_regret_claimed === false", "NO_COUNTERFACTUAL_CLAIM");
requireIncludes(runtime, "if (baselineLeftWins === canaryLeftWins) continue", "RANK_CHANGED_PAIRS_ONLY");
requireIncludes(runtime, "incomplete_outcomes_trigger_regression_rollback: false", "INCOMPLETE_NO_ROLLBACK");
requireIncludes(runtime, 'reasonCode: "GOVERNED_CANARY_LINEAGE_AMBIGUITY"', "AMBIGUITY_ROLLBACK");
requireIncludes(runtime, 'reasonCode: "GOVERNED_CANARY_REGRESSION_DETECTED"', "REGRESSION_ROLLBACK");
requireIncludes(runtime, 'status: "REBASED_CANARY_WAITING_FOR_PRIOR_GOVERNED_OUTCOMES"', "SEQUENTIAL_EVIDENCE_GATE");
requireIncludes(runtime, "const MIN_CERTIFIED_CYCLES = 3", "MIN_CERTIFIED_CYCLES");
requireIncludes(runtime, "const MIN_RANK_CHANGED_CYCLES = 2", "MIN_RANK_CHANGED_CYCLES");
requireIncludes(runtime, "const MIN_COMPARABLE_PAIRS = 5", "MIN_COMPARABLE_PAIRS");
requireIncludes(runtime, "const MIN_DISTINCT_EXPERIMENTS = 3", "MIN_DISTINCT_EXPERIMENTS");
requireIncludes(runtime, "const MIN_CANARY_CORRECT_RATE = 0.67", "MIN_CANARY_CORRECT_RATE");
requireIncludes(runtime, "const MIN_CANARY_RATE_ADVANTAGE = 0.1", "MIN_CANARY_ADVANTAGE");
requireIncludes(runtime, "exact_current_persistent_baseline_restored: exactBaselineRestored", "CERTIFICATION_REQUIRES_EXACT_RESTORATION");
requireIncludes(
  runtime,
  '"REBASED_CANARY_EVIDENCE_PERSISTENT_POLICY_SUCCESSION_REVIEW_CANDIDATE"',
  "SUCCESSION_REVIEW_STATUS",
);
requireIncludes(runtime, "persistent_policy_succession_review_candidate: successionReviewCandidate", "SUCCESSION_REVIEW_ONLY");
requireIncludes(runtime, "policy_succession_authorized: false", "NO_SUCCESSION_AUTH");
requireIncludes(runtime, "persistent_policy_replacement_authorized: false", "NO_REPLACEMENT_AUTH");
requireIncludes(runtime, "automatic_policy_succession: false", "NO_AUTO_SUCCESSION");
requireIncludes(runtime, "automatic_policy_promotion: false", "NO_AUTO_PROMOTION");
requireIncludes(runtime, "automatic_policy_activation: false", "NO_AUTO_ACTIVATION");

for (const [needle, code] of [
  ["selected_membership_change_authorized: false", "NO_MEMBERSHIP_AUTH"],
  ["source_numeric_score_mutation_authorized: false", "NO_SOURCE_SCORE_MUTATION_AUTH"],
  ["execution_authorized: false", "NO_EXECUTION_AUTH"],
  ["provider_execution_authorized: false", "NO_PROVIDER_EXECUTION_AUTH"],
  ["spend_authorized: false", "NO_SPEND_AUTH"],
  ["provider_called_here: false", "NO_PROVIDER_CALL"],
  ["wallet_write_performed_here: false", "NO_WALLET_WRITE"],
  ["runpod_job_submitted: false", "NO_RUNPOD_JOB"],
  ["platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE"],
  ["automatic_training_started: false", "NO_TRAINING"],
  ["automatic_model_weight_mutation: false", "NO_WEIGHT_MUTATION"],
]) {
  requireIncludes(runtime, needle, code);
}

// Explicit activation exists, but cron may only reconcile an already-authorized canary.
requireIncludes(runtime, "recordAvantiqoRebasedSelectionPolicyCanaryActivation", "EXPLICIT_ACTIVATION_FUNCTION");
requireIncludes(runtime, "rollbackAvantiqoRebasedSelectionPolicyCanary", "EXPLICIT_ROLLBACK_FUNCTION");
requireIncludes(
  index,
  './runtime/AvantiqoRebasedSelectionPolicyCanaryRuntime',
  "INDEX_EXPORT",
);
requireIncludes(route, "reconcileAvantiqoRebasedSelectionPolicyCanary", "ROUTE_RECONCILE_IMPORT");
requireIncludes(route, "rebased_selection_policy_canary:", "ROUTE_RESPONSE");
requireIncludes(
  route,
  "rebasedSelectionPolicyCanary.execution_request_generation_allowed !== false",
  "EXECUTION_ALLOWED_GATE",
);
requireIncludes(
  route,
  "BLOCKED_BY_REBASED_SELECTION_POLICY_CANARY_FAIL_CLOSED",
  "EXECUTION_FAIL_CLOSED_STATUS",
);
requireExcludes(
  route,
  "recordAvantiqoRebasedSelectionPolicyCanaryActivation",
  "CRON_ACTIVATION_IMPORT_OR_CALL",
);
requireExcludes(
  route,
  "rollbackAvantiqoRebasedSelectionPolicyCanary",
  "CRON_ROLLBACK_IMPORT_OR_CALL",
);
requireExcludes(
  route,
  "activate_avantiqo_rebased_policy_canary_v1",
  "CRON_DIRECT_ACTIVATE_RPC",
);

const phase35Call = route.indexOf("await reconcileAvantiqoPersistentOrderingPolicyApplication()");
const phase36Call = route.indexOf("await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()");
const phase38Call = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyChallenger()");
const phase39Call = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyPromotionRequests()");
const phase40Call = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyCanary()");
const executionCall = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests()");
if (
  !(
    phase35Call >= 0 &&
    phase36Call > phase35Call &&
    phase38Call > phase36Call &&
    phase39Call > phase38Call &&
    phase40Call > phase39Call &&
    executionCall > phase40Call
  )
) {
  throw new Error("PHASE40_ROUTE_ORDER_INVALID");
}

const markers = {
  AVANTIQO_LEARNING_WORLDCLASS_PHASE40_AUDIT: "PASS",
  AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT: RUNTIME_CONTRACT,
  AVANTIQO_PHASE40_DB_AUTHORITY_CONTRACT: DB_AUTHORITY_CONTRACT,
  AVANTIQO_PHASE40_DB_APPLICATION_CONTRACT: DB_APPLICATION_CONTRACT,
  AVANTIQO_PHASE40_CANONICAL_SHORT_API: true,
  AVANTIQO_PHASE40_POSTGRES_IDENTIFIER_TRUNCATION_DEPENDENCY: false,
  AVANTIQO_PHASE40_SECURITY_INVOKER: true,
  AVANTIQO_PHASE40_SERVICE_ROLE_ONLY: true,
  AVANTIQO_PHASE40_SHARED_PHASE35_36_LOCK: true,
  AVANTIQO_PHASE40_LEGACY_PHASE32_CONFLICT_BLOCKED: true,
  AVANTIQO_PHASE40_CURRENT_PERSISTENT_BASELINE_REQUIRED: true,
  AVANTIQO_PHASE40_EXACT_PHASE39_RELEASE_REQUIRED: true,
  AVANTIQO_PHASE40_ACTIVATOR_INDEPENDENT: true,
  AVANTIQO_PHASE40_MAX_CANARY_INFLUENCE: 0.25,
  AVANTIQO_PHASE40_MAX_CANARY_CYCLES: 3,
  AVANTIQO_PHASE40_CURRENT_PERSISTENT_SCORE_IS_BASELINE: true,
  AVANTIQO_PHASE40_SAME_SELECTED_PORTFOLIO_ONLY: true,
  AVANTIQO_PHASE40_ATOMIC_DATABASE_APPLICATION: true,
  AVANTIQO_PHASE40_APPLICATION_BEFORE_EXECUTION_REQUEST: true,
  AVANTIQO_PHASE40_EXACT_CURRENT_BASELINE_ROLLBACK: true,
  AVANTIQO_PHASE40_CANARY_SURVIVES_PERSISTENT_BASELINE_ROLLBACK: false,
  AVANTIQO_PHASE40_GOVERNED_PHASE28_OUTCOMES_ONLY: true,
  AVANTIQO_PHASE40_RANK_CHANGED_PAIRS_ONLY: true,
  AVANTIQO_PHASE40_UNEXECUTED_OUTCOME_INFERENCE: false,
  AVANTIQO_PHASE40_FULL_COUNTERFACTUAL_BACKTEST: false,
  AVANTIQO_PHASE40_INCOMPLETE_OUTCOMES_TRIGGER_ROLLBACK: false,
  AVANTIQO_PHASE40_LINEAGE_AMBIGUITY_ROLLBACK: true,
  AVANTIQO_PHASE40_VERIFIED_REGRESSION_ROLLBACK: true,
  AVANTIQO_PHASE40_MIN_CERTIFIED_CYCLES: 3,
  AVANTIQO_PHASE40_MIN_RANK_CHANGED_CYCLES: 2,
  AVANTIQO_PHASE40_MIN_COMPARABLE_PAIRS: 5,
  AVANTIQO_PHASE40_MIN_DISTINCT_EXPERIMENTS: 3,
  AVANTIQO_PHASE40_MIN_CANARY_CORRECT_RATE: 0.67,
  AVANTIQO_PHASE40_MIN_CANARY_ADVANTAGE: 0.1,
  AVANTIQO_PHASE40_SUCCESSION_REVIEW_ONLY: true,
  AVANTIQO_PHASE40_AUTOMATIC_POLICY_SUCCESSION: false,
  AVANTIQO_PHASE40_AUTOMATIC_ACTIVATION: false,
  AVANTIQO_PHASE40_CRON_ACTIVATION: false,
  AVANTIQO_PHASE40_EXECUTION_BLOCKED_ON_AMBIGUITY: true,
  AVANTIQO_PHASE40_SELECTED_MEMBERSHIP_CHANGE_ALLOWED: false,
  AVANTIQO_PHASE40_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE40_PROVIDER_CALL_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE40_WALLET_WRITE_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE40_RUNPOD_JOB_SUBMITTED_BY_AUDIT: false,
  AVANTIQO_PHASE40_EXECUTION_AUTHORIZED: false,
  AVANTIQO_PHASE40_PLATFORM_KNOWLEDGE_WRITTEN: false,
  AVANTIQO_PHASE40_AUTOMATIC_TRAINING_STARTED: false,
  AVANTIQO_PHASE40_AUTOMATIC_MODEL_WEIGHT_MUTATION: false,
};

for (const [key, value] of Object.entries(markers)) {
  console.log(`${key}=${String(value)}`);
}
