#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime.js",
);
const phase33Path = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

function fail(message) {
  console.error(`AVANTIQO_PHASE34_AUDIT_FAILURE=${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`MISSING_FILE:${path.relative(root, file)}`);
  return fs.readFileSync(file, "utf8");
}

function requireIncludes(source, token, code) {
  if (!source.includes(token)) fail(`${code}:MISSING:${token}`);
}

function requireExcludes(source, token, code) {
  if (source.includes(token)) fail(`${code}:FORBIDDEN:${token}`);
}

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    fail(`SYNTAX:${path.relative(root, file)}`);
  }
}

const runtime = read(runtimePath);
const phase33 = read(phase33Path);
const route = read(routePath);
const index = read(indexPath);

syntaxCheck(runtimePath);
syntaxCheck(phase33Path);
syntaxCheck(routePath);

requireIncludes(
  runtime,
  '"AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_V1"',
  "CONTRACT",
);
requireIncludes(runtime, "MAX_CERTIFIED_INFLUENCE_FRACTION = 0.25", "CAP");
requireIncludes(runtime, "APPROVAL_VALIDITY_MINUTES = 60", "APPROVAL_TTL");
requireIncludes(
  runtime,
  '"CANARY_EVIDENCE_FULL_POLICY_PROMOTION_REVIEW_CANDIDATE"',
  "PHASE33_SOURCE",
);
requireIncludes(runtime, "metadata.mature_canary_outcome_evidence === true", "MATURE");
requireIncludes(runtime, "metadata.clean_cycle_limit_completion === true", "CLEAN_COMPLETION");
requireIncludes(runtime, "metadata.all_approved_cycles_applied === true", "ALL_CYCLES");
requireIncludes(runtime, "metadata.all_applied_cycles_fully_observed === true", "FULL_OBSERVATION");
requireIncludes(runtime, "metadata.exact_baseline_restored === true", "BASELINE_RESTORED");
requireIncludes(runtime, "Number(metadata.regression_cycle_count) === 0", "ZERO_REGRESSION");
requireIncludes(runtime, "metadata.actual_canary_ranks_evaluated === true", "ACTUAL_RANKS");
requireIncludes(
  runtime,
  "metadata.theoretical_full_challenger_ranks_used_as_canary_outcome === false",
  "NO_THEORETICAL_FULL_CHALLENGER",
);
requireIncludes(runtime, "metadata.governed_phase28_realized_outcomes_only === true", "PHASE28_ONLY");
requireIncludes(runtime, "metadata.unexecuted_candidate_outcome_inferred === false", "NO_UNEXECUTED_INFERENCE");
requireIncludes(runtime, "metadata.historical_counterfactual_backtest_claimed === false", "NO_RETRO_COUNTERFACTUAL");
requireIncludes(
  runtime,
  'persistent_policy_scope: "ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY"',
  "ORDERING_ONLY",
);
requireIncludes(runtime, "candidate_eligibility_change_allowed: false", "NO_ELIGIBILITY_CHANGE");
requireIncludes(runtime, "candidate_membership_change_allowed: false", "NO_MEMBERSHIP_CHANGE");
requireIncludes(runtime, "maximum_selection_count_change_allowed: false", "NO_TOPN_CHANGE");
requireIncludes(runtime, "uncertainty_group_constraint_change_allowed: false", "NO_GROUP_CHANGE");
requireIncludes(runtime, "source_numeric_score_mutation_allowed: false", "NO_SCORE_MUTATION");
requireIncludes(runtime, "baseline_membership_selector_remains_authoritative: true", "BASELINE_MEMBERSHIP_AUTHORITY");
requireIncludes(runtime, "influence_increase_above_certified_canary_allowed: false", "NO_INFLUENCE_EXPANSION");
requireIncludes(runtime, "full_100_percent_challenger_cutover_allowed: false", "NO_100_PERCENT_CUTOVER");
requireIncludes(runtime, "explicit_independent_approval_required: true", "EXPLICIT_APPROVAL");
requireIncludes(runtime, "same_actor_as_canary_activator !== false", "ACTIVATOR_INDEPENDENCE");
requireIncludes(runtime, "same_actor_as_phase31_promotion_approver !== false", "PHASE31_APPROVER_INDEPENDENCE");
requireIncludes(runtime, "exact_certified_influence_acknowledged !== true", "EXACT_INFLUENCE_REVIEW");
requireIncludes(runtime, "membership_boundary_acknowledged !== true", "MEMBERSHIP_REVIEW");
requireIncludes(runtime, "rollback_lineage_reviewed !== true", "ROLLBACK_REVIEW");
requireIncludes(runtime, "approval_authorizes_release_candidate_creation_only: true", "APPROVAL_BOUNDARY");
requireIncludes(runtime, "live_activation_authorized: false", "NO_LIVE_ACTIVATION");
requireIncludes(runtime, "live_activation_requires_separate_phase: true", "SEPARATE_ACTIVATION");
requireIncludes(runtime, "exact_certified_influence_must_be_preserved: true", "PRESERVE_TESTED_INFLUENCE");
requireIncludes(runtime, "exact_baseline_rollback_lineage_required: true", "ROLLBACK_LINEAGE");
requireIncludes(runtime, "automatic_promotion: false", "NO_AUTO_PROMOTION");
requireIncludes(runtime, "provider_called_here: false", "NO_PROVIDER");
requireIncludes(runtime, "wallet_write_performed_here: false", "NO_WALLET");
requireIncludes(runtime, "runpod_job_submitted: false", "NO_RUNPOD");
requireIncludes(runtime, "platform_knowledge_written: false", "NO_KNOWLEDGE");
requireIncludes(runtime, "automatic_training_started: false", "NO_TRAINING");
requireIncludes(runtime, "automatic_model_weight_mutation: false", "NO_WEIGHT_MUTATION");

requireIncludes(
  route,
  "reconcileAvantiqoPersistentOrderingPolicyPromotionRequests",
  "CRON_REQUEST_RECONCILIATION",
);
requireIncludes(
  route,
  "persistent_ordering_policy_promotion_requests",
  "CRON_RESPONSE",
);
requireExcludes(
  route,
  "recordAvantiqoPersistentOrderingPolicyPromotionApproval",
  "CRON_NO_APPROVAL",
);
requireExcludes(
  route,
  "createAvantiqoPersistentOrderingPolicyReleaseCandidate",
  "CRON_NO_RELEASE_CANDIDATE",
);
requireExcludes(
  route,
  "activateAvantiqoPersistentOrderingPolicy",
  "CRON_NO_ACTIVATION",
);

requireIncludes(
  index,
  'export * from "./runtime/AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime";',
  "INDEX_EXPORT",
);
requireIncludes(
  phase33,
  "separate_full_policy_promotion_governance_required: true",
  "PHASE33_SEPARATE_GOVERNANCE",
);
requireIncludes(
  phase33,
  "automatic_full_policy_promotion: false",
  "PHASE33_NO_AUTO_PROMOTION",
);

const markers = [
  ["AVANTIQO_LEARNING_WORLDCLASS_PHASE34_AUDIT", "PASS"],
  [
    "AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT",
    "AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_V1",
  ],
  ["AVANTIQO_PHASE34_PHASE33_PROMOTION_REVIEW_CANDIDATE_REQUIRED", "true"],
  ["AVANTIQO_PHASE34_EXACT_CANARY_TESTED_INFLUENCE_ONLY", "true"],
  ["AVANTIQO_PHASE34_MAX_CERTIFIED_INFLUENCE_FRACTION", "0.25"],
  ["AVANTIQO_PHASE34_FULL_100_PERCENT_CHALLENGER_CUTOVER_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_ORDERING_WITHIN_SELECTED_PORTFOLIO_ONLY", "true"],
  ["AVANTIQO_PHASE34_CANDIDATE_ELIGIBILITY_CHANGE_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_CANDIDATE_MEMBERSHIP_CHANGE_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_MAX_SELECTION_COUNT_CHANGE_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_UNCERTAINTY_GROUP_CHANGE_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED", "false"],
  ["AVANTIQO_PHASE34_BASELINE_MEMBERSHIP_SELECTOR_REMAINS_AUTHORITY", "true"],
  ["AVANTIQO_PHASE34_EXPLICIT_INDEPENDENT_APPROVAL_REQUIRED", "true"],
  ["AVANTIQO_PHASE34_APPROVER_INDEPENDENT_FROM_CANARY_ACTIVATOR", "true"],
  ["AVANTIQO_PHASE34_APPROVER_INDEPENDENT_FROM_PHASE31_APPROVER", "true"],
  ["AVANTIQO_PHASE34_APPROVAL_VALIDITY_MINUTES", "60"],
  ["AVANTIQO_PHASE34_APPROVAL_IS_LIVE_ACTIVATION", "false"],
  ["AVANTIQO_PHASE34_RELEASE_CANDIDATE_IS_LIVE_ACTIVATION", "false"],
  ["AVANTIQO_PHASE34_LIVE_ACTIVATION_REQUIRES_SEPARATE_PHASE", "true"],
  ["AVANTIQO_PHASE34_EXACT_BASELINE_ROLLBACK_LINEAGE_REQUIRED", "true"],
  ["AVANTIQO_PHASE34_CRON_AUTO_APPROVAL", "false"],
  ["AVANTIQO_PHASE34_CRON_AUTO_RELEASE_CANDIDATE", "false"],
  ["AVANTIQO_PHASE34_CRON_AUTO_ACTIVATION", "false"],
  ["AVANTIQO_PHASE34_AUTOMATIC_PROMOTION", "false"],
  ["AVANTIQO_PHASE34_PROVIDER_CALL_PERFORMED_BY_AUDIT", "false"],
  ["AVANTIQO_PHASE34_WALLET_WRITE_PERFORMED_BY_AUDIT", "false"],
  ["AVANTIQO_PHASE34_RUNPOD_JOB_SUBMITTED_BY_AUDIT", "false"],
  ["AVANTIQO_PHASE34_EXECUTION_AUTHORIZED", "false"],
  ["AVANTIQO_PHASE34_PLATFORM_KNOWLEDGE_WRITTEN", "false"],
  ["AVANTIQO_PHASE34_AUTOMATIC_TRAINING_STARTED", "false"],
];

for (const [key, value] of markers) {
  console.log(`${key}=${value}`);
}
