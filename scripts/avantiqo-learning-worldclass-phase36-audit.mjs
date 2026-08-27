import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime.js",
);
const authorityPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260827045000_phase36_persistent_ordering_policy_regression_monitor.sql",
);

for (const file of [runtimePath, authorityPath, routePath, indexPath, migrationPath]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE36_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [runtimePath, authorityPath, routePath]) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    throw new Error(
      `PHASE36_SYNTAX_CHECK_FAILED:${file}:${checked.stderr || checked.stdout}`,
    );
  }
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const authority = fs.readFileSync(authorityPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

const CONTRACT = "AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1";

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`PHASE36_${code}_MISSING`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`PHASE36_${code}_FORBIDDEN`);
}

requireIncludes(runtime, CONTRACT, "RUNTIME_CONTRACT");
requireIncludes(migration, CONTRACT, "MIGRATION_CONTRACT");
requireIncludes(
  migration,
  "monitor_avantiqo_intelligence_persistent_ordering_policy_v1",
  "MONITOR_RPC",
);
requireIncludes(migration, "security invoker", "SECURITY_INVOKER");
requireIncludes(
  migration,
  "revoke all on function public.monitor_avantiqo_intelligence_persistent_ordering_policy_v1(uuid) from public, anon, authenticated",
  "PUBLIC_EXECUTE_REVOKED",
);
requireIncludes(
  migration,
  "grant execute on function public.monitor_avantiqo_intelligence_persistent_ordering_policy_v1(uuid) to service_role",
  "SERVICE_ROLE_EXECUTE",
);
requireIncludes(
  migration,
  "enable row level security",
  "MONITOR_TABLE_RLS",
);
requireIncludes(
  migration,
  "platform_learning_experiment_portfolio_outcomes",
  "PHASE28_OUTCOME_SCOPE",
);
requireIncludes(
  migration,
  "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1",
  "PHASE28_OUTCOME_CONTRACT",
);
requireIncludes(
  migration,
  "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED",
  "PHASE28_OBSERVED_STATUS",
);
requireIncludes(
  migration,
  "selection_request_lineage_verified",
  "REQUEST_LINEAGE",
);
requireIncludes(
  migration,
  "immutable_execution_receipt_verified",
  "IMMUTABLE_RECEIPT",
);
requireIncludes(
  migration,
  "information_outcome_qualified",
  "QUALIFIED_OUTCOME",
);
requireIncludes(
  migration,
  "unexecuted_candidate_outcome_inferred",
  "NO_UNEXECUTED_INFERENCE",
);
requireIncludes(
  migration,
  "full_counterfactual_regret_claimed",
  "NO_FULL_COUNTERFACTUAL",
);
requireIncludes(
  migration,
  "baseline_pairwise_correct_count",
  "BASELINE_CORRECTNESS",
);
requireIncludes(
  migration,
  "persistent_pairwise_correct_count",
  "PERSISTENT_CORRECTNESS",
);
requireIncludes(
  migration,
  "baseline_observed_rank_regret",
  "BASELINE_REGRET",
);
requireIncludes(
  migration,
  "persistent_observed_rank_regret",
  "PERSISTENT_REGRET",
);
requireIncludes(
  migration,
  "REGRESSION_ROLLBACK_TRIGGERED",
  "REGRESSION_ROLLBACK",
);
requireIncludes(
  migration,
  "LINEAGE_AMBIGUITY_ROLLBACK_TRIGGERED",
  "AMBIGUITY_ROLLBACK",
);
requireIncludes(
  migration,
  "rollback_avantiqo_intelligence_persistent_ordering_policy_v1",
  "PHASE35_ROLLBACK",
);
requireIncludes(
  migration,
  "incomplete_outcomes_cause_rollback', false",
  "INCOMPLETE_OUTCOME_SAFETY",
);
requireIncludes(
  migration,
  "avantiqo_persistent_ordering_policy_v1:",
  "SHARED_ADVISORY_LOCK",
);
requireIncludes(
  authority,
  "rollback_avantiqo_intelligence_persistent_ordering_policy_v1",
  "AUTHORITY_ROLLBACK_RPC",
);

requireIncludes(
  runtime,
  "governed_phase28_realized_outcomes_only: true",
  "RUNTIME_PHASE28_ONLY",
);
requireIncludes(runtime, "rank_changed_pairs_only: true", "RUNTIME_CHANGED_PAIRS_ONLY");
requireIncludes(
  runtime,
  "incomplete_outcomes_cause_rollback: false",
  "RUNTIME_INCOMPLETE_NO_ROLLBACK",
);
requireIncludes(
  runtime,
  "lineage_ambiguity_causes_rollback: true",
  "RUNTIME_AMBIGUITY_ROLLBACK",
);
requireIncludes(
  runtime,
  "verified_regression_causes_rollback: true",
  "RUNTIME_REGRESSION_ROLLBACK",
);
requireIncludes(
  runtime,
  "selected_membership_change_authorized: false",
  "RUNTIME_NO_MEMBERSHIP_CHANGE",
);
requireIncludes(
  runtime,
  "source_numeric_score_mutation_authorized: false",
  "RUNTIME_NO_SOURCE_SCORE_MUTATION",
);
requireIncludes(
  runtime,
  "provider_execution_authorized: false",
  "RUNTIME_NO_PROVIDER_AUTH",
);
requireIncludes(runtime, "spend_authorized: false", "RUNTIME_NO_SPEND_AUTH");
requireIncludes(
  runtime,
  "platform_knowledge_written: false",
  "RUNTIME_NO_KNOWLEDGE_WRITE",
);
requireIncludes(
  runtime,
  "automatic_training_started: false",
  "RUNTIME_NO_TRAINING",
);
requireIncludes(
  runtime,
  "automatic_model_weight_mutation: false",
  "RUNTIME_NO_WEIGHT_MUTATION",
);

requireIncludes(
  index,
  './runtime/AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime',
  "INDEX_EXPORT",
);
requireIncludes(
  route,
  "reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor",
  "ROUTE_MONITOR_IMPORT",
);
requireIncludes(
  route,
  "persistent_ordering_policy_regression_monitor",
  "ROUTE_MONITOR_RESPONSE",
);
requireIncludes(
  route,
  "BLOCKED_BY_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR",
  "EXECUTION_REQUEST_BLOCK",
);

const applicationCall = route.indexOf(
  "await reconcileAvantiqoPersistentOrderingPolicyApplication()",
);
const monitorCall = route.indexOf(
  "await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()",
);
const executionCall = route.indexOf(
  "await reconcileAvantiqoExperimentExecutionRequests()",
);
if (!(applicationCall >= 0 && monitorCall > applicationCall && executionCall > monitorCall)) {
  throw new Error("PHASE36_ROUTE_ORDER_INVALID");
}

requireExcludes(
  route,
  "activateAvantiqoPersistentOrderingPolicy(",
  "CRON_AUTO_ACTIVATION",
);
requireExcludes(
  route,
  "activate_avantiqo_intelligence_persistent_ordering_policy_v1",
  "CRON_DIRECT_ACTIVATION_RPC",
);

const markers = {
  AVANTIQO_LEARNING_WORLDCLASS_PHASE36_AUDIT: "PASS",
  AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_CONTRACT: CONTRACT,
  AVANTIQO_PHASE36_DATABASE_MONITOR_AUTHORITY: true,
  AVANTIQO_PHASE36_SECURITY_INVOKER_REQUIRED: true,
  AVANTIQO_PHASE36_SERVICE_ROLE_ONLY: true,
  AVANTIQO_PHASE36_GOVERNED_PHASE28_REALIZED_OUTCOMES_ONLY: true,
  AVANTIQO_PHASE36_RANK_CHANGED_PAIRS_ONLY: true,
  AVANTIQO_PHASE36_UNEXECUTED_OUTCOME_INFERENCE: false,
  AVANTIQO_PHASE36_HISTORICAL_COUNTERFACTUAL: false,
  AVANTIQO_PHASE36_INCOMPLETE_OUTCOMES_CAUSE_ROLLBACK: false,
  AVANTIQO_PHASE36_LINEAGE_AMBIGUITY_CAUSES_ROLLBACK: true,
  AVANTIQO_PHASE36_VERIFIED_REGRESSION_CAUSES_ROLLBACK: true,
  AVANTIQO_PHASE36_BASELINE_PAIRWISE_CORRECTNESS_COMPARED: true,
  AVANTIQO_PHASE36_OBSERVED_RANK_REGRET_COMPARED: true,
  AVANTIQO_PHASE36_EXACT_PHASE35_BASELINE_ROLLBACK: true,
  AVANTIQO_PHASE36_SERIALIZED_WITH_PHASE35_APPLICATION: true,
  AVANTIQO_PHASE36_MONITOR_PRECEDES_EXECUTION_REQUESTS: true,
  AVANTIQO_PHASE36_EXECUTION_REQUESTS_BLOCKED_ON_ROLLBACK: true,
  AVANTIQO_PHASE36_CRON_AUTO_ACTIVATION: false,
  AVANTIQO_PHASE36_AUTOMATIC_ROLLBACK: true,
  AVANTIQO_PHASE36_SELECTED_MEMBERSHIP_CHANGE_ALLOWED: false,
  AVANTIQO_PHASE36_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED: false,
  AVANTIQO_PHASE36_PROVIDER_CALL_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE36_WALLET_WRITE_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE36_RUNPOD_JOB_SUBMITTED_BY_AUDIT: false,
  AVANTIQO_PHASE36_EXECUTION_AUTHORIZED: false,
  AVANTIQO_PHASE36_PLATFORM_KNOWLEDGE_WRITTEN: false,
  AVANTIQO_PHASE36_AUTOMATIC_TRAINING_STARTED: false,
};

for (const [key, value] of Object.entries(markers)) {
  console.log(`${key}=${String(value)}`);
}
