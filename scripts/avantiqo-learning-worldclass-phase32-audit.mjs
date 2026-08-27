#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_SELECTION_POLICY_CANARY_V1";
const root = process.cwd();
const files = {
  runtime:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime.js",
  phase31:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime.js",
  phase30:
    "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function includes(source, marker, label) {
  assert.ok(source.includes(marker), `${label}: missing ${marker}`);
}

function excludes(source, marker, label) {
  assert.ok(!source.includes(marker), `${label}: forbidden ${marker}`);
}

function checkSyntax(relativePath) {
  const result = spawnSync(process.execPath, ["--check", relativePath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${relativePath}: syntax check failed\n${result.stdout}\n${result.stderr}`,
  );
}

for (const relativePath of Object.values(files)) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `missing ${relativePath}`);
}

checkSyntax(files.runtime);
checkSyntax(files.phase31);
checkSyntax(files.phase30);
checkSyntax(files.route);

const runtime = read(files.runtime);
const phase31 = read(files.phase31);
const phase30 = read(files.phase30);
const route = read(files.route);
const index = read(files.index);

includes(runtime, `"${CONTRACT}"`, "runtime contract");
includes(runtime, "const MAX_CANARY_INFLUENCE_FRACTION = 0.25", "canary fraction bound");
includes(runtime, "const MAX_CANARY_CYCLES = 3", "canary cycle bound");
includes(runtime, "recordAvantiqoSelectionPolicyCanaryActivation", "explicit activation entrypoint");
includes(runtime, "explicit_activation_review_completed !== true", "activation review gate");
includes(runtime, "rollback_readiness_confirmed !== true", "rollback readiness gate");
includes(runtime, "same_actor_as_policy_promotion_approver !== false", "activator independence gate");
includes(runtime, "ACTIVE_CANARY_ALREADY_EXISTS", "single active canary gate");
includes(runtime, "canary_fraction_is_policy_influence_not_membership_fraction: true", "fraction semantics");
includes(runtime, "same_selected_portfolio_only: true", "same portfolio invariant");
includes(runtime, "selected_membership_change_authorized: false", "membership expansion forbidden");
includes(runtime, "source_score_increase_authorized: false", "score inflation forbidden");
includes(runtime, "full_policy_cutover_authorized: false", "full cutover forbidden");
includes(runtime, "automatic_regression_rollback_required: true", "automatic regression rollback requirement");
includes(runtime, "explicit_rollback_directive_must_be_honored: true", "explicit rollback requirement");
includes(runtime, "created_before_execution_request", "Phase30 prospective lineage");
includes(runtime, "requestsExistForSelections", "post-request mutation guard");
includes(runtime, "CANARY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION", "post-request fail-safe status");
includes(runtime, "challengerScore > baselineScore", "challenger score cannot exceed baseline guard");
includes(runtime, "baselineScore * (1 - influence) + challengerScore * influence", "bounded blend equation");
includes(runtime, "phase32_baseline_rank", "baseline rank retained");
includes(runtime, "phase32_source_risk_adjusted_score_mutated: false", "source score preserved");
includes(runtime, "phase32_selected_membership_changed: false", "membership preserved in application");
includes(runtime, "MULTIPLE_ACTIVE_CANARIES_FAIL_CLOSED", "multiple canary fail closed");
includes(runtime, "GOVERNED_CANARY_REGRESSION_DETECTED", "regression detector");
includes(runtime, "AUTOMATIC_REGRESSION_ROLLBACK_APPLIED", "automatic rollback status");
includes(runtime, "EXPLICIT_GOVERNED_ROLLBACK_DIRECTIVE", "explicit rollback application");
includes(runtime, "CANARY_CYCLE_LIMIT_COMPLETE", "cycle limit completion");
includes(runtime, "CANARY_CYCLE_LIMIT_COMPLETE_BASELINE_RESTORED", "cycle limit baseline restore");
includes(runtime, "exact_baseline_restored: true", "exact baseline restoration evidence");
includes(runtime, "selected_membership_changed: false", "rollback membership invariant");
includes(runtime, "source_numeric_scores_mutated: false", "rollback score invariant");
includes(runtime, "automatic_full_policy_promotion: false", "rollback no promotion");
includes(runtime, "provider_called_here: false", "no provider call");
includes(runtime, "wallet_write_performed_here: false", "no wallet write");
includes(runtime, "runpod_job_submitted: false", "no RunPod job");
includes(runtime, "platform_knowledge_written: false", "no platform knowledge write");
includes(runtime, "automatic_training_started: false", "no automatic training");
includes(runtime, "automatic_model_weight_mutation: false", "no model mutation");

includes(phase31, "maximum_canary_selection_fraction: MAX_CANARY_SELECTION_FRACTION", "Phase31 canary approval cap source");
includes(phase31, "maximum_canary_cycles: MAX_CANARY_CYCLES", "Phase31 cycle cap source");
includes(phase31, "exact_baseline_rollback_required: true", "Phase31 baseline rollback requirement");
includes(phase31, "production_canary_activation_authorized: false", "Phase31 release candidate is not activation");
includes(phase31, "activation_requires_separate_phase: true", "separate activation phase required");

includes(phase30, "prospective_same_selected_portfolio_comparison_only: true", "Phase30 same-portfolio evidence boundary");
includes(phase30, "challenger_score_can_exceed_baseline: false", "Phase30 conservative challenger boundary");
includes(phase30, "created_before_execution_request: true", "Phase30 snapshot timing boundary");

includes(route, "reconcileAvantiqoSelectionPolicyCanary", "cron canary reconciliation");
includes(route, "selectionPolicyCanary.success !== false", "execution request fail-closed gate");
includes(route, "BLOCKED_BY_SELECTION_POLICY_CANARY_FAIL_CLOSED", "cron canary failure block");
includes(route, "selection_policy_canary: selectionPolicyCanary", "cron response evidence");

const shadowIndex = route.indexOf("await reconcileAvantiqoSelectionPolicyShadowChallenger");
const canaryIndex = route.indexOf("await reconcileAvantiqoSelectionPolicyCanary");
const executionIndex = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests");
assert.ok(shadowIndex >= 0, "route: Phase30 shadow call missing");
assert.ok(canaryIndex > shadowIndex, "route: Phase32 must run after Phase30 snapshot reconciliation");
assert.ok(executionIndex > canaryIndex, "route: Phase32 must run before execution-request creation");

for (const forbiddenCronCall of [
  "recordAvantiqoSelectionPolicyCanaryActivation(",
  "recordAvantiqoSelectionPolicyPromotionApproval(",
  "createAvantiqoSelectionPolicyCanaryReleaseCandidate(",
  "recordAvantiqoSelectionPolicyRollbackDirective(",
]) {
  excludes(route, forbiddenCronCall, "cron authority isolation");
}

includes(
  index,
  'export * from "./runtime/AvantiqoSelectionPolicyCanaryRuntime";',
  "index export",
);

// Deterministic policy math certification: challenger influence is bounded and cannot
// increase any source score. A 25% canary may change ordering only by blending scores
// from the exact same selected portfolio.
const influence = 0.25;
const examples = [
  { baseline: 10, challenger: 5 },
  { baseline: 9, challenger: 9 },
  { baseline: 4, challenger: 0 },
];
const blended = examples.map(({ baseline, challenger }) => {
  assert.ok(challenger <= baseline, "fixture must respect conservative challenger invariant");
  const value = baseline * (1 - influence) + challenger * influence;
  assert.ok(value <= baseline, "canary blend must never exceed baseline score");
  assert.ok(value >= challenger, "bounded blend must remain between challenger and baseline");
  return value;
});
assert.deepEqual(blended, [8.75, 9, 3], "deterministic 25% canary blend changed");
assert.ok(blended[1] > blended[0], "bounded canary fixture should demonstrate rank-only influence");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE32_AUDIT=PASS");
console.log(`AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE32_EXPLICIT_ACTIVATION_REQUIRED=true");
console.log("AVANTIQO_PHASE32_ACTIVATOR_INDEPENDENCE_REQUIRED=true");
console.log("AVANTIQO_PHASE32_ROLLBACK_READINESS_REQUIRED=true");
console.log("AVANTIQO_PHASE32_MAX_CANARY_INFLUENCE_FRACTION=0.25");
console.log("AVANTIQO_PHASE32_MAX_CANARY_CYCLES=3");
console.log("AVANTIQO_PHASE32_CANARY_FRACTION_IS_POLICY_INFLUENCE=true");
console.log("AVANTIQO_PHASE32_SAME_SELECTED_PORTFOLIO_ONLY=true");
console.log("AVANTIQO_PHASE32_SELECTED_MEMBERSHIP_CHANGE_ALLOWED=false");
console.log("AVANTIQO_PHASE32_SOURCE_SCORE_INCREASE_ALLOWED=false");
console.log("AVANTIQO_PHASE32_FULL_POLICY_CUTOVER_ALLOWED=false");
console.log("AVANTIQO_PHASE32_PROSPECTIVE_PHASE30_SNAPSHOT_REQUIRED=true");
console.log("AVANTIQO_PHASE32_POST_EXECUTION_REQUEST_RANK_MUTATION_ALLOWED=false");
console.log("AVANTIQO_PHASE32_ONE_ACTIVE_CANARY_ONLY=true");
console.log("AVANTIQO_PHASE32_EXACT_BASELINE_RANKS_RETAINED=true");
console.log("AVANTIQO_PHASE32_AUTOMATIC_REGRESSION_ROLLBACK=true");
console.log("AVANTIQO_PHASE32_EXPLICIT_ROLLBACK_DIRECTIVE_HONORED=true");
console.log("AVANTIQO_PHASE32_CYCLE_LIMIT_RESTORES_BASELINE=true");
console.log("AVANTIQO_PHASE32_CRON_AUTO_ACTIVATION=false");
console.log("AVANTIQO_PHASE32_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE32_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE32_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE32_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE32_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE32_AUTOMATIC_TRAINING_STARTED=false");
