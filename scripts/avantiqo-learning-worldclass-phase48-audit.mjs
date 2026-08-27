#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE48_FINAL_END_TO_END_CERTIFICATION_V1";
const root = process.cwd();

function absolute(relative) {
  return path.join(root, relative);
}

function requireFile(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) throw new Error(`${CONTRACT}_MISSING_FILE:${relative}`);
  return file;
}

function read(relative) {
  return fs.readFileSync(requireFile(relative), "utf8");
}

function json(relative) {
  return JSON.parse(read(relative));
}

function has(source, marker, code) {
  if (!source.includes(marker)) throw new Error(`${CONTRACT}_${code}_MISSING:${marker}`);
}

function forbid(source, marker, code) {
  if (source.includes(marker)) throw new Error(`${CONTRACT}_${code}_FORBIDDEN:${marker}`);
}

function syntax(relative) {
  const result = spawnSync(process.execPath, ["--check", requireFile(relative)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`${CONTRACT}_SYNTAX_FAILED:${relative}`);
  }
}

function runAudit(phase) {
  const relative = `scripts/avantiqo-learning-worldclass-phase${phase}-audit.mjs`;
  const result = spawnSync(process.execPath, [requireFile(relative)], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${CONTRACT}_PHASE${phase}_REGRESSION_AUDIT_FAILED`);
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  has(output, `AVANTIQO_LEARNING_WORLDCLASS_PHASE${phase}_AUDIT=PASS`, `PHASE${phase}_PASS_MARKER`);
  return output;
}

const phase46Output = runAudit(46);
const phase47Output = runAudit(47);
has(phase46Output, "AVANTIQO_PHASE46_MULTI_GENERATION_SUCCESSION_CONTRACT=true", "PHASE46_MULTI_GENERATION");
has(phase46Output, "AVANTIQO_PHASE46_CROSS_INTERVAL_OUTCOME_REUSE_ALLOWED=false", "PHASE46_CROSS_INTERVAL_REUSE");
has(phase46Output, "AVANTIQO_PHASE46_OUTCOME_REPLAY_IDEMPOTENT_CONTRACT=true", "PHASE46_REPLAY");
has(phase47Output, "AVANTIQO_PHASE47_TRANSACTIONAL_PARTIAL_FAILURE_ROLLBACK=true", "PHASE47_TRANSACTIONAL_ROLLBACK");
has(phase47Output, "AVANTIQO_PHASE47_VALID_RETRY_RECOVERY=true", "PHASE47_RETRY_RECOVERY");
has(phase47Output, "AVANTIQO_PHASE47_STALE_GENERATION_RETRY_REJECTED=true", "PHASE47_STALE_RETRY");
has(phase47Output, "AVANTIQO_PHASE47_FIXTURE_ROWS_REMAINING=0", "PHASE47_CLEANUP");

const files = {
  selector: "lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime.js",
  portfolio: "lib/intelligence/runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime.js",
  governance: "lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime.js",
  claim: "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
  receipt: "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js",
  ingress: "lib/intelligence/runtime/AvantiqoGovernedExperimentResultIngressRuntime.js",
  estimator: "lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime.js",
  assessor: "lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime.js",
  longHorizon: "lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime.js",
  shadow: "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js",
  shadowIntegrity: "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime.js",
  promotion: "lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime.js",
  canary: "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime.js",
  canaryOutcome: "lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime.js",
  persistentPromotion: "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime.js",
  persistentAuthority: "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime.js",
  regression: "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime.js",
  epoch: "lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime.js",
  rebased: "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime.js",
  rebasedPromotion: "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime.js",
  rebasedCanary: "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyCanaryRuntime.js",
  succession: "lib/intelligence/runtime/AvantiqoPersistentPolicySuccessionRuntime.js",
  generationIntegrity: "lib/intelligence/runtime/AvantiqoPersistentPolicyGenerationIntegrityRuntime.js",
  activationIntegrity: "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime.js",
  intervalIntegrity: "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationIntervalIntegrityRuntime.js",
  attribution: "lib/intelligence/runtime/AvantiqoExperimentPolicyIntervalAttributionRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
};

for (const relative of Object.values(files)) requireFile(relative);
for (const relative of Object.values(files).filter((relative) => relative.endsWith(".js"))) syntax(relative);

const selector = read(files.selector);
const portfolio = read(files.portfolio);
const governance = read(files.governance);
const claim = read(files.claim);
const receipt = read(files.receipt);
const ingress = read(files.ingress);
const estimator = read(files.estimator);
const assessor = read(files.assessor);
const longHorizon = read(files.longHorizon);
const shadow = read(files.shadow);
const shadowIntegrity = read(files.shadowIntegrity);
const promotion = read(files.promotion);
const canary = read(files.canary);
const canaryOutcome = read(files.canaryOutcome);
const persistentPromotion = read(files.persistentPromotion);
const persistentAuthority = read(files.persistentAuthority);
const regression = read(files.regression);
const epoch = read(files.epoch);
const rebased = read(files.rebased);
const rebasedPromotion = read(files.rebasedPromotion);
const rebasedCanary = read(files.rebasedCanary);
const succession = read(files.succession);
const generationIntegrity = read(files.generationIntegrity);
const activationIntegrity = read(files.activationIntegrity);
const intervalIntegrity = read(files.intervalIntegrity);
const attribution = read(files.attribution);
const route = read(files.route);
const index = read(files.index);

has(selector, "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1", "SELECTION_CONTRACT");
has(selector, "selection_is_not_execution_authorization: true", "SELECTION_NOT_EXECUTION");
has(portfolio, "AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_V1", "PORTFOLIO_CONTRACT");
has(portfolio, "BACKFILL_DID_NOT_CONVERGE_FAIL_CLOSED", "PORTFOLIO_FAIL_CLOSED");
has(governance, "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1", "GOVERNANCE_CONTRACT");
has(governance, "AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL", "EXPLICIT_APPROVAL");
has(governance, "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM", "ONE_TIME_APPROVAL");
has(claim, "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1", "CLAIM_CONTRACT");
has(claim, "single_use: true", "CLAIM_SINGLE_USE");
has(claim, "replay_forbidden: true", "CLAIM_REPLAY_FORBIDDEN");
has(receipt, "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1", "RECEIPT_CONTRACT");
has(receipt, "immutable_provenance_record: true", "IMMUTABLE_RECEIPT");
has(receipt, "receipt_can_be_replayed_for_execution: false", "RECEIPT_NO_REPLAY");
has(ingress, "AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_V1", "RESULT_INGRESS_CONTRACT");
has(ingress, "require_completed: true", "RESULT_REQUIRES_COMPLETED_RECEIPT");
has(ingress, "platform_knowledge_written_directly: false", "NO_DIRECT_KNOWLEDGE_WRITE");
has(estimator, "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1", "ESTIMATOR_CALIBRATION");
has(assessor, "AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_V1", "ASSESSOR_CALIBRATION");

has(longHorizon, "execution_request_generation_allowed", "LONG_HORIZON_EXECUTION_GATE");
has(shadow, "PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED", "PROSPECTIVE_SHADOW");
has(shadow, "challenger_score_can_exceed_baseline: false", "SHADOW_BOUND");
has(shadowIntegrity, "exactly_one_authoritative_evaluation_per_selection_cycle: true", "SHADOW_INTEGRITY");
has(promotion, "automatic_policy_promotion: false", "PROMOTION_NOT_AUTOMATIC");
has(canary, "recordAvantiqoSelectionPolicyCanaryActivation", "CANARY_EXPLICIT_ACTIVATION_ENTRYPOINT");
has(canary, "explicit_activation_review_completed !== true", "CANARY_EXPLICIT_ACTIVATION_REVIEW");
has(canary, "rollback_readiness_confirmed !== true", "CANARY_ROLLBACK_READINESS");
has(canary, "same_actor_as_policy_promotion_approver !== false", "CANARY_ACTIVATOR_INDEPENDENCE");
has(canaryOutcome, "AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_V1", "CANARY_OUTCOME");
has(persistentPromotion, "ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY", "PERSISTENT_ORDERING_SCOPE");
has(persistentAuthority, "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1", "PERSISTENT_AUTHORITY");
has(persistentAuthority, "automatic_activation: false", "PERSISTENT_NO_AUTO_ACTIVATION");
has(regression, "automatic_rollback_performed", "REGRESSION_ROLLBACK_PATH");
has(epoch, "legacy_challenger_promotion_allowed", "RESEARCH_EPOCH_ISOLATION");
has(rebased, "AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_V1", "REBASED_CHALLENGER");
has(rebasedPromotion, "AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1", "REBASED_PROMOTION");
has(rebasedCanary, "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_V1", "REBASED_CANARY");
has(succession, "AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1", "SUCCESSION_CONTRACT");
has(succession, "activation_requires_separate_explicit_call: true", "SUCCESSION_EXPLICIT_ACTIVATION");
has(succession, "automatic_policy_succession: false", "SUCCESSION_NOT_AUTOMATIC");

has(generationIntegrity, "execution_request_generation_allowed", "GENERATION_INTEGRITY_GATE");
has(activationIntegrity, "research_generation_allowed", "ACTIVATION_RESEARCH_GATE");
has(activationIntegrity, "execution_request_generation_allowed", "ACTIVATION_EXECUTION_GATE");
has(intervalIntegrity, "historical_interval_attribution_allowed", "INTERVAL_ATTRIBUTION_GATE");
has(attribution, "AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1", "ATTRIBUTION_CONTRACT");
has(attribution, "cross_interval_policy_binding_reuse_allowed: false", "NO_CROSS_INTERVAL_REUSE");

has(route, "CRON_SECRET", "CRON_SECRET_REQUIRED");
has(route, "status: 401", "CRON_UNAUTHORIZED_401");
has(route, "status: 500", "CRON_FATAL_500");
has(route, "? 207", "CRON_PARTIAL_207");
has(route, "persistentPolicyActivationGenerationResearchIntegrity", "ROUTE_RESEARCH_INTEGRITY");
has(route, "persistentOrderingPolicyRegressionMonitor", "ROUTE_REGRESSION_MONITOR");
has(route, "persistentPolicyGenerationIntegrity", "ROUTE_GENERATION_INTEGRITY");
has(route, "persistentPolicyActivationGenerationIntegrity", "ROUTE_ACTIVATION_INTEGRITY");
has(route, "rebasedSelectionPolicyChallenger", "ROUTE_REBASED_CHALLENGER");
has(route, "rebasedSelectionPolicyCanary", "ROUTE_REBASED_CANARY");
has(route, "persistentPolicySuccessionRequests", "ROUTE_SUCCESSION");
has(route, "reconcileAvantiqoExperimentExecutionRequests", "ROUTE_EXECUTION_REQUEST_RECONCILIATION");
has(route, "execution_authorized: false", "ROUTE_BLOCKED_EXECUTION_NOT_AUTHORIZED");
has(route, "spend_authorized: false", "ROUTE_BLOCKED_SPEND_NOT_AUTHORIZED");
for (const marker of [
  "recordAvantiqoExperimentExecutionApproval(",
  "createAvantiqoExperimentExecutionClaim(",
  "consumeAvantiqoExperimentExecutionClaim(",
  "recordAvantiqoExperimentExecutionReceipt(",
  "recordAvantiqoGovernedScientificExperimentResult(",
  "recordAvantiqoGovernedTransferExperimentResult(",
  "recordAvantiqoSelectionPolicyCanaryActivation(",
  "activateAvantiqoPersistentPolicySuccessor(",
]) forbid(route, marker, "CRON_AUTONOMOUS_AUTHORITY");

const ordering = [
  "await reconcileAvantiqoExperimentOutcomeAssessorCalibration()",
  "await reconcileAvantiqoExperimentEstimatorCalibration()",
  "await reconcileAvantiqoExperimentPortfolioPerformance()",
  "await reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio()",
  "await reconcileAvantiqoSelectionPolicyResearchEpoch()",
  "await reconcileAvantiqoPersistentOrderingPolicyApplication()",
  "await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()",
  "await verifyAvantiqoPersistentPolicyGenerationIntegrity()",
  "await reconcileAvantiqoRebasedSelectionPolicyChallenger()",
  "await reconcileAvantiqoRebasedSelectionPolicyPromotionRequests()",
  "await reconcileAvantiqoRebasedSelectionPolicyCanary()",
  "await reconcileAvantiqoPersistentPolicySuccessionRequests()",
  "await reconcileAvantiqoExperimentExecutionRequests()",
];
let cursor = -1;
for (const marker of ordering) {
  const next = route.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `${CONTRACT}_ROUTE_ORDER_INVALID:${marker}`);
  cursor = next;
}

for (const marker of [
  "AvantiqoActiveExperimentSelectionRuntime",
  "AvantiqoExperimentExecutionGovernanceRuntime",
  "AvantiqoExperimentExecutionClaimRuntime",
  "AvantiqoExperimentExecutionReceiptRuntime",
  "AvantiqoGovernedExperimentResultIngressRuntime",
  "AvantiqoExperimentEstimatorCalibrationRuntime",
  "AvantiqoExperimentOutcomeAssessorCalibrationRuntime",
  "AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime",
  "AvantiqoSelectionPolicyShadowChallengerRuntime",
  "AvantiqoSelectionPolicyCanaryRuntime",
  "AvantiqoPersistentOrderingPolicyAuthorityRuntime",
  "AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime",
  "AvantiqoSelectionPolicyResearchEpochRuntime",
  "AvantiqoRebasedSelectionPolicyChallengerRuntime",
  "AvantiqoRebasedSelectionPolicyCanaryRuntime",
  "AvantiqoPersistentPolicySuccessionRuntime",
  "AvantiqoPersistentPolicyGenerationIntegrityRuntime",
  "AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime",
  "AvantiqoPersistentPolicyActivationIntervalIntegrityRuntime",
  "AvantiqoExperimentPolicyIntervalAttributionRuntime",
]) has(index, marker, `INDEX_EXPORT_${marker}`);

const phase47Evidence = json("audits/avantiqo-learning-worldclass-phase47-live-evidence.json");
assert.equal(phase47Evidence.contract, "AVANTIQO_LEARNING_WORLDCLASS_PHASE47_PRODUCTION_READINESS_V1");
assert.equal(phase47Evidence.forced_mid_transition_failure.partial_commit_observed, false);
assert.equal(phase47Evidence.recovery.phase42_integrity, true);
assert.equal(phase47Evidence.recovery.phase43_integrity, true);
assert.equal(phase47Evidence.recovery.phase44_integrity, true);
assert.equal(phase47Evidence.recovery.phase45_integrity, true);
assert.equal(phase47Evidence.retry_safety.rollback_retry_idempotent, true);
assert.equal(phase47Evidence.retry_safety.stale_execution_request_retry_rejected, true);
for (const value of Object.values(phase47Evidence.cleanup)) assert.equal(value, 0);

const live = json("audits/avantiqo-learning-worldclass-phase48-live-evidence.json");
assert.equal(live.contract, CONTRACT);
assert.equal(live.live_state.fabricated_policy_or_outcome_evidence, false);
for (const key of [
  "persistent_policy_count",
  "policy_generation_count",
  "activation_generation_count",
  "activation_closure_count",
  "outcome_attribution_count",
]) assert.equal(live.live_state[key], 0, `${CONTRACT}_LIVE_NONZERO:${key}`);
for (const key of ["phase42", "phase43", "phase44", "phase45"]) {
  assert.equal(live.integrity[key].success, true, `${CONTRACT}_${key}_LIVE_INTEGRITY_FAILED`);
}
assert.equal(live.integrity.phase45.exact_policy_interval_attribution, true);
assert.equal(live.integrity.phase45.cross_interval_outcome_reuse_allowed, false);
assert.equal(live.critical_function_acl.security_invoker, true);
assert.equal(live.critical_function_acl.service_role_execute, true);
assert.equal(live.critical_function_acl.anon_execute, false);
assert.equal(live.critical_function_acl.authenticated_execute, false);
assert.equal(live.immutable_ledger_acl.rls_enabled, true);
assert.equal(live.immutable_ledger_acl.service_role_select, true);
assert.equal(live.immutable_ledger_acl.service_role_insert, true);
assert.equal(live.immutable_ledger_acl.service_role_update, false);
assert.equal(live.immutable_ledger_acl.service_role_delete, false);
assert.equal(live.immutable_ledger_acl.anon_select, false);
assert.equal(live.immutable_ledger_acl.authenticated_select, false);
assert.equal(live.prior_dynamic_certification.phase46_multi_generation_succession_rollback_delayed_outcome, true);
assert.equal(live.prior_dynamic_certification.phase47_transactional_failure_retry_recovery, true);
assert.equal(live.prior_dynamic_certification.phase47_fixture_rows_remaining, 0);
for (const value of Object.values(live.side_effects)) assert.equal(value, false);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE48_AUDIT=PASS");
console.log(`AVANTIQO_PHASE48_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE48_PHASE46_REGRESSION_AUDIT=PASS");
console.log("AVANTIQO_PHASE48_PHASE47_REGRESSION_AUDIT=PASS");
console.log("AVANTIQO_PHASE48_SCIENTIFIC_CLOSED_LOOP=true");
console.log("AVANTIQO_PHASE48_EXPLICIT_EXECUTION_GOVERNANCE=true");
console.log("AVANTIQO_PHASE48_SINGLE_USE_CLAIM_AND_IMMUTABLE_RECEIPT=true");
console.log("AVANTIQO_PHASE48_RESULT_CALIBRATION_LOOP=true");
console.log("AVANTIQO_PHASE48_LONG_HORIZON_POLICY_ADAPTATION=true");
console.log("AVANTIQO_PHASE48_PROSPECTIVE_SHADOW_AND_BOUNDED_CANARY=true");
console.log("AVANTIQO_PHASE48_PERSISTENT_POLICY_SUCCESSION_AND_ROLLBACK=true");
console.log("AVANTIQO_PHASE48_GENERATION_INTERVAL_LINEAGE=true");
console.log("AVANTIQO_PHASE48_EXACT_OUTCOME_INTERVAL_ATTRIBUTION=true");
console.log("AVANTIQO_PHASE48_TRANSACTIONAL_FAILURE_RECOVERY=true");
console.log("AVANTIQO_PHASE48_ZERO_LIVE_POLICY_STATE=true");
console.log("AVANTIQO_PHASE48_FABRICATED_EVIDENCE=false");
console.log("AVANTIQO_PHASE48_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE48_IMMUTABLE_LEDGER_RLS=true");
console.log("AVANTIQO_PHASE48_ANON_AUTHENTICATED_LEDGER_ACCESS=false");
console.log("AVANTIQO_PHASE48_CRON_AUTO_APPROVAL=false");
console.log("AVANTIQO_PHASE48_CRON_AUTO_CLAIM=false");
console.log("AVANTIQO_PHASE48_CRON_AUTO_EXECUTION=false");
console.log("AVANTIQO_PHASE48_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE48_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE48_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE48_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE48_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");
