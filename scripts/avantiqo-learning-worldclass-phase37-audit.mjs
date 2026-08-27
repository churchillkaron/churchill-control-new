import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const epochPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime.js",
);
const shadowPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");
const phase35Path = path.join(
  root,
  "supabase/migrations/20260827043500_phase35_persistent_ordering_policy_authority.sql",
);
const phase37Path = path.join(
  root,
  "supabase/migrations/20260827051200_phase37_policy_epoch_isolation.sql",
);

for (const file of [
  epochPath,
  shadowPath,
  routePath,
  indexPath,
  phase35Path,
  phase37Path,
]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE37_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [epochPath, shadowPath, routePath]) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    throw new Error(
      `PHASE37_SYNTAX_CHECK_FAILED:${file}:${checked.stderr || checked.stdout}`,
    );
  }
}

const epoch = fs.readFileSync(epochPath, "utf8");
const shadow = fs.readFileSync(shadowPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const phase35 = fs.readFileSync(phase35Path, "utf8");
const phase37 = fs.readFileSync(phase37Path, "utf8");

const CONTRACT = "AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_V1";

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`PHASE37_${code}_MISSING`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`PHASE37_${code}_FORBIDDEN`);
}

requireIncludes(epoch, CONTRACT, "EPOCH_CONTRACT");
requireIncludes(
  epoch,
  "ACTIVE_PERSISTENT_POLICY_IS_CURRENT_RESEARCH_BASELINE",
  "CURRENT_PERSISTENT_BASELINE",
);
requireIncludes(
  epoch,
  "parent_baseline_policy_fingerprint: policy.baseline_policy_fingerprint",
  "PARENT_BASELINE_LINEAGE",
);
requireIncludes(epoch, "old_challenger_repromotion_allowed: false", "NO_REPROMOTION");
requireIncludes(epoch, "old_challenger_recanary_allowed: false", "NO_RECANARY");
requireIncludes(
  epoch,
  "old_challenger_recursive_reapplication_as_new_policy_allowed: false",
  "NO_RECURSIVE_REAPPLICATION",
);
requireIncludes(
  epoch,
  "old_challenger_prospective_computation_allowed_for_current_policy_application: true",
  "CURRENT_POLICY_COMPUTATION_RETAINED",
);
requireIncludes(
  epoch,
  "future_challenger_must_bind_current_baseline_policy_fingerprint: true",
  "FUTURE_BIND_CURRENT_BASELINE",
);
requireIncludes(
  epoch,
  "future_challenger_must_use_distinct_policy_version: true",
  "FUTURE_DISTINCT_VERSION",
);
requireIncludes(
  epoch,
  "future_challenger_requires_post_activation_governed_evidence: true",
  "POST_ACTIVATION_EVIDENCE",
);
requireIncludes(
  epoch,
  "future_challenger_requires_prospective_same_portfolio_evaluation: true",
  "PROSPECTIVE_SAME_PORTFOLIO",
);
requireIncludes(
  epoch,
  "future_challenger_generation_authorized_here: false",
  "NO_CHALLENGER_GENERATION",
);
requireIncludes(epoch, "automatic_policy_activation: false", "NO_AUTO_ACTIVATION");
requireIncludes(epoch, "automatic_policy_promotion: false", "NO_AUTO_PROMOTION");
requireIncludes(
  epoch,
  "selected_membership_change_authorized: false",
  "NO_MEMBERSHIP_CHANGE",
);
requireIncludes(
  epoch,
  "source_numeric_score_mutation_authorized: false",
  "NO_SOURCE_SCORE_MUTATION",
);
requireIncludes(epoch, "provider_called_here: false", "NO_PROVIDER_CALL");
requireIncludes(epoch, "wallet_write_performed_here: false", "NO_WALLET_WRITE");
requireIncludes(epoch, "runpod_job_submitted: false", "NO_RUNPOD_JOB");
requireIncludes(epoch, "platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE");
requireIncludes(epoch, "automatic_training_started: false", "NO_TRAINING");
requireIncludes(epoch, "automatic_model_weight_mutation: false", "NO_WEIGHT_MUTATION");

requireIncludes(
  shadow,
  'const CHALLENGER_POLICY_VERSION = "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1"',
  "LEGACY_CHALLENGER_VERSION",
);
requireIncludes(
  route,
  "await reconcileAvantiqoSelectionPolicyShadowChallenger({",
  "PHASE30_COMPUTATION_RETAINED",
);
requireIncludes(
  route,
  "await reconcileAvantiqoSelectionPolicyResearchEpoch()",
  "RESEARCH_EPOCH_RECONCILIATION",
);
requireIncludes(
  route,
  "legacyChallengerPromotionAllowed === false",
  "LEGACY_PROMOTION_GATE",
);
requireIncludes(
  route,
  "BLOCKED_BY_ACTIVE_PERSISTENT_POLICY_RESEARCH_EPOCH",
  "LEGACY_PROMOTION_BLOCK_STATUS",
);
requireIncludes(
  route,
  "await reconcileAvantiqoPersistentOrderingPolicyApplication()",
  "PERSISTENT_APPLICATION_RETAINED",
);
requireIncludes(
  route,
  "selection_policy_research_epoch: selectionPolicyResearchEpoch",
  "ROUTE_EPOCH_RESPONSE",
);
requireIncludes(
  index,
  './runtime/AvantiqoSelectionPolicyResearchEpochRuntime',
  "INDEX_EXPORT",
);

requireIncludes(
  phase35,
  "AVANTIQO_PHASE35_ACTIVE_PHASE32_CANARY_CONFLICT",
  "PHASE35_BLOCKS_PHASE32",
);
requireIncludes(
  phase35,
  "avantiqo_persistent_ordering_policy_v1:",
  "PHASE35_SHARED_LOCK",
);
requireIncludes(
  phase37,
  "AVANTIQO_PHASE37_ACTIVE_PERSISTENT_POLICY_BLOCKS_PHASE32_CANARY",
  "PHASE32_BLOCKS_PHASE35",
);
requireIncludes(
  phase37,
  "avantiqo_persistent_ordering_policy_v1:",
  "PHASE37_SHARED_LOCK",
);
requireIncludes(phase37, "security invoker", "TRIGGER_SECURITY_INVOKER");
requireIncludes(
  phase37,
  "revoke all on function public.avantiqo_enforce_selection_policy_epoch_isolation_v1()",
  "TRIGGER_EXECUTE_REVOKE",
);
requireIncludes(
  phase37,
  "from public, anon, authenticated",
  "TRIGGER_PUBLIC_ROLES_REVOKED",
);
requireIncludes(
  phase37,
  "grant execute on function public.avantiqo_enforce_selection_policy_epoch_isolation_v1()",
  "TRIGGER_SERVICE_ROLE_GRANT",
);
requireIncludes(phase37, "to service_role", "TRIGGER_SERVICE_ROLE_ONLY");

const epochCall = route.indexOf("await reconcileAvantiqoSelectionPolicyResearchEpoch()");
const shadowCall = route.indexOf("await reconcileAvantiqoSelectionPolicyShadowChallenger({");
const applicationCall = route.indexOf(
  "await reconcileAvantiqoPersistentOrderingPolicyApplication()",
);
if (!(epochCall >= 0 && shadowCall > epochCall && applicationCall > shadowCall)) {
  throw new Error("PHASE37_ROUTE_REBASELINE_ORDER_INVALID");
}

requireExcludes(route, "activateAvantiqoPersistentOrderingPolicy(", "CRON_AUTO_ACTIVATION");
requireExcludes(
  route,
  "activate_avantiqo_intelligence_persistent_ordering_policy_v1",
  "CRON_DIRECT_ACTIVATION_RPC",
);

const markers = {
  AVANTIQO_LEARNING_WORLDCLASS_PHASE37_AUDIT: "PASS",
  AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT: CONTRACT,
  AVANTIQO_PHASE37_CURRENT_PERSISTENT_POLICY_REBASELINE: true,
  AVANTIQO_PHASE37_PARENT_BASELINE_LINEAGE_RETAINED: true,
  AVANTIQO_PHASE37_LEGACY_CHALLENGER_REPROMOTION: false,
  AVANTIQO_PHASE37_LEGACY_CHALLENGER_RECANARY: false,
  AVANTIQO_PHASE37_RECURSIVE_EFFECTIVE_INFLUENCE_INCREASE_ALLOWED: false,
  AVANTIQO_PHASE37_PHASE30_COMPUTATION_RETAINED_FOR_CURRENT_POLICY_APPLICATION: true,
  AVANTIQO_PHASE37_FUTURE_CHALLENGER_MUST_BIND_CURRENT_BASELINE: true,
  AVANTIQO_PHASE37_FUTURE_CHALLENGER_REQUIRES_DISTINCT_VERSION: true,
  AVANTIQO_PHASE37_FUTURE_CHALLENGER_REQUIRES_POST_ACTIVATION_EVIDENCE: true,
  AVANTIQO_PHASE37_FUTURE_CHALLENGER_GENERATED_BY_PHASE37: false,
  AVANTIQO_PHASE37_PHASE35_BLOCKS_ACTIVE_PHASE32_CANARY: true,
  AVANTIQO_PHASE37_PHASE32_BLOCKS_ACTIVE_PHASE35_POLICY: true,
  AVANTIQO_PHASE37_SYMMETRIC_POLICY_STACK_LOCK: true,
  AVANTIQO_PHASE37_DB_TRIGGER_SECURITY_INVOKER: true,
  AVANTIQO_PHASE37_DB_TRIGGER_SERVICE_ROLE_ONLY: true,
  AVANTIQO_PHASE37_LEGACY_PROMOTION_BLOCKS_IN_ROUTE: true,
  AVANTIQO_PHASE37_PERSISTENT_APPLICATION_STILL_ALLOWED: true,
  AVANTIQO_PHASE37_CRON_AUTO_ACTIVATION: false,
  AVANTIQO_PHASE37_PROVIDER_CALL_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE37_WALLET_WRITE_PERFORMED_BY_AUDIT: false,
  AVANTIQO_PHASE37_RUNPOD_JOB_SUBMITTED_BY_AUDIT: false,
  AVANTIQO_PHASE37_EXECUTION_AUTHORIZED: false,
  AVANTIQO_PHASE37_PLATFORM_KNOWLEDGE_WRITTEN: false,
  AVANTIQO_PHASE37_AUTOMATIC_TRAINING_STARTED: false,
};

for (const [key, value] of Object.entries(markers)) {
  console.log(`${key}=${String(value)}`);
}
