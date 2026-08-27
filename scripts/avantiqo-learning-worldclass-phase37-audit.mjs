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
const canaryPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime.js",
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
  canaryPath,
  routePath,
  indexPath,
  phase35Path,
  phase37Path,
]) {
  if (!fs.existsSync(file)) throw new Error(`PHASE37_REQUIRED_FILE_MISSING:${file}`);
}

for (const file of [epochPath, shadowPath, canaryPath, routePath]) {
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
const canary = fs.readFileSync(canaryPath, "utf8");
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
  shadow,
  "await reconcileAvantiqoSelectionPolicyShadowChallenger",
  "IMPOSSIBLE_SENTINEL",
);
