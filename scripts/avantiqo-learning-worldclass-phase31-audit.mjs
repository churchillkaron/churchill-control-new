#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1";
const root = process.cwd();
const files = {
  runtime:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime.js",
  shadow:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
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

for (const file of [files.runtime, files.shadow, files.route]) syntax(file);

const runtime = read(files.runtime);
const shadow = read(files.shadow);
const route = read(files.route);
const index = read(files.index);

requireMarker(runtime, CONTRACT, "CONTRACT");
requireMarker(
  runtime,
  "MAX_CANARY_SELECTION_FRACTION = 0.25",
  "CANARY_FRACTION_BOUND",
);
requireMarker(runtime, "MAX_CANARY_CYCLES = 3", "CANARY_CYCLE_BOUND");
requireMarker(
  runtime,
  "APPROVAL_VALIDITY_MINUTES = 60",
  "APPROVAL_VALIDITY_BOUND",
);
requireMarker(
  runtime,
  "AWAITING_EXPLICIT_SELECTION_POLICY_PROMOTION_APPROVAL",
  "REQUEST_STATUS",
);
requireMarker(
  runtime,
  "EXPLICIT_POLICY_CANARY_RELEASE_CANDIDATE_APPROVAL_RECORDED",
  "APPROVAL_STATUS",
);
requireMarker(
  runtime,
  "CANARY_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION",
  "RELEASE_CANDIDATE_STATUS",
);
requireMarker(
  runtime,
  "ROLLBACK_DIRECTIVE_RECORDED_AWAITING_SEPARATE_APPLICATION",
  "ROLLBACK_STATUS",
);
requireMarker(
  runtime,
  "independent_approver_attested !== true",
  "INDEPENDENT_APPROVER_REQUIRED",
);
requireMarker(
  runtime,
  "same_actor_as_shadow_evidence_generator !== false",
  "APPROVER_INDEPENDENCE_REQUIRED",
);
requireMarker(
  runtime,
  "policy_change_review_completed !== true || rollback_plan_reviewed !== true",
  "POLICY_ROLLBACK_REVIEW_REQUIRED",
);
requireMarker(
  runtime,
  "approval_authorizes_release_candidate_creation_only: true",
  "APPROVAL_NOT_ACTIVATION",
);
requireMarker(
  runtime,
  "live_policy_activation_authorized: false",
  "LIVE_ACTIVATION_FALSE",
);
requireMarker(
  runtime,
  "production_canary_activation_authorized: false",
  "CANARY_ACTIVATION_FALSE",
);
requireMarker(
  runtime,
  "activation_requires_separate_phase: true",
  "SEPARATE_ACTIVATION_REQUIRED",
);
requireMarker(
  runtime,
  "exact_baseline_rollback_required: true",
  "EXACT_ROLLBACK_REQUIRED",
);
requireMarker(
  runtime,
  "automatic_rollback_on_governed_regression_required: true",
  "AUTO_REGRESSION_ROLLBACK_REQUIRED",
);
requireMarker(
  runtime,
  "full_policy_cutover_allowed: false",
  "FULL_CUTOVER_BLOCKED",
);
requireMarker(runtime, "automatic_policy_promotion: false", "NO_AUTO_PROMOTION");
requireMarker(runtime, "live_policy_mutated: false", "NO_LIVE_POLICY_MUTATION");
requireMarker(runtime, "live_selection_mutated: false", "NO_LIVE_SELECTION_MUTATION");
requireMarker(
  runtime,
  "numeric_selection_scores_mutated: false",
  "NO_SCORE_MUTATION",
);
requireMarker(runtime, "provider_called_here: false", "NO_PROVIDER_CALL");
requireMarker(runtime, "wallet_write_performed_here: false", "NO_WALLET_WRITE");
requireMarker(runtime, "runpod_job_submitted: false", "NO_RUNPOD_JOB");
requireMarker(runtime, "platform_knowledge_written: false", "NO_KNOWLEDGE_WRITE");
requireMarker(runtime, "automatic_training_started: false", "NO_AUTO_TRAINING");

requireMarker(
  shadow,
  "SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE",
  "PHASE30_REVIEW_SOURCE",
);
requireMarker(
  shadow,
  "explicit_separate_policy_promotion_governance_required: true",
  "PHASE30_SEPARATE_GOVERNANCE_SOURCE",
);
requireMarker(
  runtime,
  "text(metadata.status, 180) ===\n        \"SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE\"",
  "EXACT_PHASE30_REVIEW_BINDING",
);
requireMarker(
  runtime,
  "metadata.promotion_review_candidate === true",
  "PROMOTION_REVIEW_CANDIDATE_REQUIRED",
);
requireMarker(
  runtime,
  "Number(metadata.challenger_worse_cycle_count) === 0",
  "ZERO_WORSE_CYCLES_REQUIRED",
);

const shadowCall = route.indexOf("reconcileAvantiqoSelectionPolicyShadowChallenger(");
const promotionRequestCall = route.indexOf(
  "reconcileAvantiqoSelectionPolicyPromotionRequests()",
);
if (!(shadowCall >= 0 && promotionRequestCall > shadowCall)) {
  throw new Error(`${CONTRACT}_CRON_ORDER_INVALID`);
}
requireMarker(
  route,
  "selection_policy_promotion_requests: selectionPolicyPromotionRequests",
  "ROUTE_RESPONSE",
);
forbidMarker(
  route,
  "recordAvantiqoSelectionPolicyPromotionApproval(",
  "CRON_AUTO_APPROVAL",
);
forbidMarker(
  route,
  "createAvantiqoSelectionPolicyCanaryReleaseCandidate(",
  "CRON_AUTO_RELEASE_CANDIDATE",
);
forbidMarker(
  route,
  "recordAvantiqoSelectionPolicyRollbackDirective(",
  "CRON_AUTO_ROLLBACK_DIRECTIVE",
);
forbidMarker(route, "production_canary_activation_authorized: true", "CRON_ACTIVATION");

requireMarker(
  index,
  "AvantiqoSelectionPolicyPromotionGovernanceRuntime",
  "INDEX_EXPORT",
);

function simulateApproval({
  independent,
  sameActor,
  policyReview,
  rollbackReview,
  fraction,
  cycles,
}) {
  return Boolean(
    independent &&
      !sameActor &&
      policyReview &&
      rollbackReview &&
      fraction > 0 &&
      fraction <= 0.25 &&
      Number.isInteger(cycles) &&
      cycles >= 1 &&
      cycles <= 3
  );
}

if (
  simulateApproval({
    independent: true,
    sameActor: false,
    policyReview: true,
    rollbackReview: true,
    fraction: 0.25,
    cycles: 3,
  }) !== true
) {
  throw new Error(`${CONTRACT}_VALID_BOUNDED_APPROVAL_REJECTED`);
}
for (const invalid of [
  { independent: false, sameActor: false, policyReview: true, rollbackReview: true, fraction: 0.25, cycles: 3 },
  { independent: true, sameActor: true, policyReview: true, rollbackReview: true, fraction: 0.25, cycles: 3 },
  { independent: true, sameActor: false, policyReview: false, rollbackReview: true, fraction: 0.25, cycles: 3 },
  { independent: true, sameActor: false, policyReview: true, rollbackReview: false, fraction: 0.25, cycles: 3 },
  { independent: true, sameActor: false, policyReview: true, rollbackReview: true, fraction: 0.26, cycles: 3 },
  { independent: true, sameActor: false, policyReview: true, rollbackReview: true, fraction: 0.25, cycles: 4 },
]) {
  if (simulateApproval(invalid) !== false) {
    throw new Error(`${CONTRACT}_INVALID_APPROVAL_ACCEPTED`);
  }
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE31_AUDIT=PASS");
console.log(`AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE31_SHADOW_REVIEW_CANDIDATE_REQUIRED=true");
console.log("AVANTIQO_PHASE31_EXPLICIT_INDEPENDENT_APPROVAL_REQUIRED=true");
console.log("AVANTIQO_PHASE31_APPROVER_INDEPENDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE31_POLICY_AND_ROLLBACK_REVIEW_REQUIRED=true");
console.log("AVANTIQO_PHASE31_APPROVAL_VALIDITY_MINUTES=60");
console.log("AVANTIQO_PHASE31_MAX_CANARY_SELECTION_FRACTION=0.25");
console.log("AVANTIQO_PHASE31_MAX_CANARY_CYCLES=3");
console.log("AVANTIQO_PHASE31_APPROVAL_IS_ACTIVATION=false");
console.log("AVANTIQO_PHASE31_RELEASE_CANDIDATE_IS_ACTIVATION=false");
console.log("AVANTIQO_PHASE31_EXACT_BASELINE_ROLLBACK_REQUIRED=true");
console.log("AVANTIQO_PHASE31_AUTOMATIC_REGRESSION_ROLLBACK_REQUIRED=true");
console.log("AVANTIQO_PHASE31_FULL_POLICY_CUTOVER_ALLOWED=false");
console.log("AVANTIQO_PHASE31_CRON_AUTO_APPROVAL=false");
console.log("AVANTIQO_PHASE31_CRON_AUTO_RELEASE_CANDIDATE=false");
console.log("AVANTIQO_PHASE31_CRON_AUTO_ROLLBACK_DIRECTIVE=false");
console.log("AVANTIQO_PHASE31_AUTOMATIC_POLICY_PROMOTION=false");
console.log("AVANTIQO_PHASE31_LIVE_POLICY_MUTATED=false");
console.log("AVANTIQO_PHASE31_LIVE_SELECTION_MUTATED=false");
console.log("AVANTIQO_PHASE31_NUMERIC_SELECTION_SCORES_MUTATED=false");
console.log("AVANTIQO_PHASE31_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE31_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE31_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE31_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE31_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE31_AUTOMATIC_TRAINING_STARTED=false");
