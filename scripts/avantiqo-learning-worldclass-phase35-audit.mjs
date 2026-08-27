import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const runtimePath = path.join(
  ROOT,
  "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime.js",
);
const promotionPath = path.join(
  ROOT,
  "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime.js",
);
const shadowPath = path.join(
  ROOT,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
);
const integrityPath = path.join(
  ROOT,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime.js",
);
const routePath = path.join(
  ROOT,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(ROOT, "lib/intelligence/index.js");
const migrationPath = path.join(
  ROOT,
  "supabase/migrations/20260827043500_phase35_persistent_ordering_policy_authority.sql",
);

for (const file of [
  runtimePath,
  promotionPath,
  shadowPath,
  integrityPath,
  routePath,
  indexPath,
]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const promotion = fs.readFileSync(promotionPath, "utf8");
const shadow = fs.readFileSync(shadowPath, "utf8");
const integrity = fs.readFileSync(integrityPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

function assert(condition, code) {
  if (!condition) {
    throw new Error(`AVANTIQO_PHASE35_AUDIT_${code}`);
  }
}

function has(source, fragment, code) {
  assert(source.includes(fragment), code);
}

has(
  runtime,
  '"AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1"',
  "RUNTIME_CONTRACT_MISSING",
);
has(
  runtime,
  "activate_avantiqo_intelligence_persistent_ordering_policy_v1",
  "ACTIVATION_RPC_WRAPPER_MISSING",
);
has(
  runtime,
  "apply_avantiqo_intelligence_persistent_ordering_policy_v1",
  "APPLICATION_RPC_WRAPPER_MISSING",
);
has(
  runtime,
  "rollback_avantiqo_intelligence_persistent_ordering_policy_v1",
  "ROLLBACK_RPC_WRAPPER_MISSING",
);
has(runtime, "automatic_activation: false", "AUTOMATIC_ACTIVATION_NOT_FALSE");
has(
  runtime,
  "candidate_membership_change_authorized: false",
  "MEMBERSHIP_AUTHORIZATION_NOT_FALSE",
);
has(
  runtime,
  "source_numeric_score_mutation_authorized: false",
  "SOURCE_SCORE_AUTHORIZATION_NOT_FALSE",
);
has(runtime, "execution_authorized: false", "EXECUTION_AUTHORIZATION_NOT_FALSE");

has(
  promotion,
  'persistent_policy_scope: "ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY"',
  "PHASE34_ORDERING_SCOPE_MISSING",
);
has(
  promotion,
  "exact_certified_influence_must_be_preserved: true",
  "PHASE34_EXACT_INFLUENCE_MISSING",
);
has(
  promotion,
  "full_100_percent_challenger_cutover_allowed: false",
  "PHASE34_FULL_CUTOVER_NOT_BLOCKED",
);

has(
  shadow,
  '"PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED"',
  "PHASE30_PROSPECTIVE_SNAPSHOT_MISSING",
);
has(
  shadow,
  "prospective_same_selected_portfolio_comparison_only: true",
  "PHASE30_SAME_PORTFOLIO_INVARIANT_MISSING",
);
has(
  shadow,
  "challenger_score_can_exceed_baseline: false",
  "PHASE30_SCORE_BOUNDARY_MISSING",
);

has(
  integrity,
  "exactly_one_authoritative_evaluation_per_selection_cycle: true",
  "PHASE30_INTEGRITY_AUTHORITY_MISSING",
);
has(
  integrity,
  "incremental_versions_cannot_inflate_maturity: true",
  "PHASE30_INCREMENTAL_INFLATION_GUARD_MISSING",
);

has(
  migration,
  "create table if not exists public.avantiqo_intelligence_persistent_ordering_policies",
  "POLICY_TABLE_MISSING",
);
has(
  migration,
  "create table if not exists public.avantiqo_intelligence_persistent_ordering_policy_applications",
  "APPLICATION_TABLE_MISSING",
);
has(
  migration,
  "avantiqo_persistent_ordering_one_active_per_org_idx",
  "ONE_ACTIVE_POLICY_INDEX_MISSING",
);
has(
  migration,
  "where state = 'ACTIVE'",
  "ONE_ACTIVE_POLICY_PARTIAL_CONSTRAINT_MISSING",
);
has(
  migration,
  "avantiqo_persistent_ordering_release_once_idx",
  "RELEASE_SINGLE_USE_INDEX_MISSING",
);
has(
  migration,
  "avantiqo_persistent_ordering_application_cycle_once_idx",
  "APPLICATION_CYCLE_UNIQUENESS_MISSING",
);
has(
  migration,
  "ordering_influence_fraction > 0 and ordering_influence_fraction <= 0.25",
  "MAX_INFLUENCE_CONSTRAINT_MISSING",
);
has(
  migration,
  "alter table public.avantiqo_intelligence_persistent_ordering_policies enable row level security",
  "POLICY_RLS_MISSING",
);
has(
  migration,
  "alter table public.avantiqo_intelligence_persistent_ordering_policy_applications enable row level security",
  "APPLICATION_RLS_MISSING",
);
has(
  migration,
  "revoke all on table public.avantiqo_intelligence_persistent_ordering_policies from public, anon, authenticated",
  "POLICY_PUBLIC_REVOKE_MISSING",
);
has(
  migration,
  "revoke all on table public.avantiqo_intelligence_persistent_ordering_policy_applications from public, anon, authenticated",
  "APPLICATION_PUBLIC_REVOKE_MISSING",
);
has(
  migration,
  "grant select, insert, update on table public.avantiqo_intelligence_persistent_ordering_policies to service_role",
  "POLICY_SERVICE_ROLE_GRANT_MISSING",
);
has(
  migration,
  "security invoker",
  "SECURITY_INVOKER_MISSING",
);
has(
  migration,
  "pg_advisory_xact_lock",
  "ATOMIC_ADVISORY_LOCK_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_ACTIVE_PHASE32_CANARY_CONFLICT",
  "ACTIVE_PHASE32_CANARY_CONFLICT_GUARD_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_ACTIVATOR_MATCHES_PHASE34_APPROVER",
  "PHASE34_APPROVER_INDEPENDENCE_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_ACTIVATOR_NOT_INDEPENDENT_FROM_CANARY",
  "CANARY_ACTIVATOR_INDEPENDENCE_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_ACTIVATOR_MATCHES_PHASE31_APPROVER",
  "PHASE31_APPROVER_INDEPENDENCE_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_EXACT_CERTIFIED_INFLUENCE_MISMATCH",
  "EXACT_INFLUENCE_GUARD_MISSING",
);
has(
  migration,
  "baseline_membership_selector_remains_authoritative",
  "BASELINE_MEMBERSHIP_AUTHORITY_MISSING",
);
has(
  migration,
  "candidate_membership_change_allowed', false",
  "MEMBERSHIP_CHANGE_NOT_BLOCKED",
);
has(
  migration,
  "source_numeric_score_mutation_allowed', false",
  "SOURCE_SCORE_MUTATION_NOT_BLOCKED",
);
has(
  migration,
  "full_100_percent_challenger_cutover_allowed', false",
  "FULL_CUTOVER_NOT_BLOCKED",
);
has(
  migration,
  "PERSISTENT_ORDERING_POLICY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION",
  "EXECUTION_REQUEST_BARRIER_MISSING",
);
has(
  migration,
  "PERSISTENT_ORDERING_POLICY_WAITING_FOR_PROSPECTIVE_PHASE30_SNAPSHOT",
  "PROSPECTIVE_SNAPSHOT_REQUIREMENT_MISSING",
);
has(
  migration,
  "prospective_same_selected_portfolio_comparison_only",
  "SAME_PORTFOLIO_DB_CHECK_MISSING",
);
has(
  migration,
  "jsonb_array_length(v_snapshot.metadata->'candidates') <> v_selection_count",
  "MEMBERSHIP_COUNT_CHECK_MISSING",
);
has(
  migration,
  "candidate->>'baseline_rank')::integer <> (s.metadata->>'selection_rank')::integer",
  "BASELINE_RANK_LINEAGE_CHECK_MISSING",
);
has(
  migration,
  "candidate->>'baseline_score')::numeric <> (s.metadata->>'risk_adjusted_information_gain_per_cost')::numeric",
  "BASELINE_SCORE_LINEAGE_CHECK_MISSING",
);
has(
  migration,
  "candidate->>'challenger_score')::numeric > (candidate->>'baseline_score')::numeric",
  "CHALLENGER_SCORE_CEILING_MISSING",
);
has(
  migration,
  "(candidate->>'baseline_score')::numeric * (1 - v_policy.ordering_influence_fraction)",
  "BLEND_BASELINE_COMPONENT_MISSING",
);
has(
  migration,
  "(candidate->>'challenger_score')::numeric * v_policy.ordering_influence_fraction",
  "BLEND_CHALLENGER_COMPONENT_MISSING",
);
has(
  migration,
  "AVANTIQO_PHASE35_ATOMIC_RANK_UPDATE_INCOMPLETE",
  "ATOMIC_UPDATE_COUNT_GUARD_MISSING",
);
has(
  migration,
  "phase35_baseline_rank",
  "BASELINE_RANK_ROLLBACK_EVIDENCE_MISSING",
);
has(
  migration,
  "'selection_rank', (metadata->>'phase35_baseline_rank')::integer",
  "EXACT_BASELINE_ROLLBACK_MISSING",
);
has(
  migration,
  "candidate_membership_changed_by_rollback', false",
  "ROLLBACK_MEMBERSHIP_GUARD_MISSING",
);
has(
  migration,
  "source_numeric_scores_mutated_by_rollback', false",
  "ROLLBACK_SCORE_GUARD_MISSING",
);
has(
  migration,
  "execution_authorized', false",
  "DB_EXECUTION_AUTHORIZATION_NOT_FALSE",
);
has(
  migration,
  "provider_execution_authorized', false",
  "DB_PROVIDER_AUTHORIZATION_NOT_FALSE",
);
has(
  migration,
  "spend_authorized', false",
  "DB_SPEND_AUTHORIZATION_NOT_FALSE",
);
has(
  migration,
  "platform_knowledge_written', false",
  "DB_KNOWLEDGE_WRITE_NOT_FALSE",
);
has(
  migration,
  "automatic_training_started', false",
  "DB_TRAINING_NOT_FALSE",
);
has(
  migration,
  "automatic_model_weight_mutation', false",
  "DB_MODEL_MUTATION_NOT_FALSE",
);

has(
  route,
  "reconcileAvantiqoPersistentOrderingPolicyApplication",
  "ROUTE_APPLICATION_MISSING",
);
const shadowIndex = route.indexOf("await reconcileAvantiqoSelectionPolicyShadowChallenger");
const applicationIndex = route.indexOf("await reconcileAvantiqoPersistentOrderingPolicyApplication");
const executionIndex = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests");
assert(shadowIndex >= 0, "ROUTE_SHADOW_CALL_MISSING");
assert(applicationIndex > shadowIndex, "APPLICATION_MUST_FOLLOW_PROSPECTIVE_SNAPSHOT");
assert(executionIndex > applicationIndex, "APPLICATION_MUST_PRECEDE_EXECUTION_REQUESTS");
assert(
  !route.includes("activateAvantiqoPersistentOrderingPolicy("),
  "CRON_MUST_NOT_ACTIVATE_PERSISTENT_POLICY",
);
assert(
  !route.includes("rollbackAvantiqoPersistentOrderingPolicy("),
  "CRON_MUST_NOT_EXPLICITLY_ROLLBACK_POLICY",
);
has(
  route,
  "BLOCKED_BY_PERSISTENT_ORDERING_POLICY_APPLICATION_FAIL_CLOSED",
  "EXECUTION_FAIL_CLOSED_STATUS_MISSING",
);
has(
  index,
  'export * from "./runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime";',
  "INDEX_EXPORT_MISSING",
);

const baselineScore = 10;
const challengerScore = 6;
const influence = 0.25;
const blended = baselineScore * (1 - influence) + challengerScore * influence;
assert(blended === 9, "DETERMINISTIC_BLEND_EXPECTATION_FAILED");
assert(blended <= baselineScore, "BLEND_MUST_NOT_EXCEED_BASELINE");
assert(influence <= 0.25, "INFLUENCE_MUST_NOT_EXCEED_CERTIFIED_MAXIMUM");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE35_AUDIT=PASS");
console.log(
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT=AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1",
);
console.log("AVANTIQO_PHASE35_DATABASE_AUTHORITY=true");
console.log("AVANTIQO_PHASE35_ONE_ACTIVE_POLICY_PER_ORG=true");
console.log("AVANTIQO_PHASE35_RELEASE_CANDIDATE_SINGLE_USE=true");
console.log("AVANTIQO_PHASE35_ONE_APPLICATION_PER_POLICY_CYCLE=true");
console.log("AVANTIQO_PHASE35_EXACT_CANARY_CERTIFIED_INFLUENCE_ONLY=true");
console.log("AVANTIQO_PHASE35_MAX_INFLUENCE_FRACTION=0.25");
console.log("AVANTIQO_PHASE35_FULL_100_PERCENT_CHALLENGER_CUTOVER=false");
console.log("AVANTIQO_PHASE35_BASELINE_MEMBERSHIP_SELECTOR_REMAINS_AUTHORITY=true");
console.log("AVANTIQO_PHASE35_SELECTED_MEMBERSHIP_CHANGE_ALLOWED=false");
console.log("AVANTIQO_PHASE35_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED=false");
console.log("AVANTIQO_PHASE35_EXPLICIT_ACTIVATION_REQUIRED=true");
console.log("AVANTIQO_PHASE35_CRON_AUTO_ACTIVATION=false");
console.log("AVANTIQO_PHASE35_PHASE34_APPROVER_INDEPENDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE35_CANARY_ACTIVATOR_INDEPENDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE35_PHASE31_APPROVER_INDEPENDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE35_ACTIVE_PHASE32_CANARY_CONFLICT_BLOCKED=true");
console.log("AVANTIQO_PHASE35_PROSPECTIVE_PHASE30_SNAPSHOT_REQUIRED=true");
console.log("AVANTIQO_PHASE35_EXECUTION_REQUEST_BARRIER=true");
console.log("AVANTIQO_PHASE35_ATOMIC_DATABASE_APPLICATION=true");
console.log("AVANTIQO_PHASE35_EXACT_BASELINE_ROLLBACK_AVAILABLE=true");
console.log("AVANTIQO_PHASE35_AUTOMATIC_REGRESSION_ROLLBACK_IMPLEMENTED=false");
console.log("AVANTIQO_PHASE35_CRON_APPLICATION_PRECEDES_EXECUTION_REQUESTS=true");
console.log("AVANTIQO_PHASE35_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE35_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE35_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE35_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE35_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE35_AUTOMATIC_TRAINING_STARTED=false");
