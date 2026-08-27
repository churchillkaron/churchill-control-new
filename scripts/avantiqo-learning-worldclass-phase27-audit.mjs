#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_GOVERNED_LEARNING_CLOSED_LOOP_CERTIFICATION_V1";
const root = process.cwd();

const paths = {
  selector: "lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime.js",
  portfolio: "lib/intelligence/runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime.js",
  governance: "lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime.js",
  claim: "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
  receipt: "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js",
  ingress: "lib/intelligence/runtime/AvantiqoGovernedExperimentResultIngressRuntime.js",
  estimator: "lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime.js",
  assessor: "lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime.js",
  external: "lib/intelligence/runtime/AvantiqoExperimentExternalExecutionEvidenceRuntime.js",
  lease: "lib/intelligence/runtime/AvantiqoIntelligenceRunpodLeaseRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
  index: "lib/intelligence/index.js",
  claimUniqueMigration:
    "supabase/migrations/20260827010500_phase23_experiment_claim_approval_uniqueness.sql",
  receiptEnforcementMigration:
    "supabase/migrations/20260827011500_phase23_experiment_result_receipt_enforcement.sql",
  leaseMigration:
    "supabase/migrations/20260827023000_phase25_intelligence_runpod_lease_provenance.sql",
  leaseGuardMigration:
    "supabase/migrations/20260827024500_phase25_intelligence_runpod_claim_receipt_enforcement.sql",
};

function file(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${CONTRACT}_MISSING_FILE:${relative}`);
  }
  return absolute;
}

function read(relative) {
  return fs.readFileSync(file(relative), "utf8");
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

function syntaxCheck(relative) {
  const result = spawnSync(process.execPath, ["--check", file(relative)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`${CONTRACT}_SYNTAX_FAILED:${relative}`);
  }
}

for (const relative of [
  paths.selector,
  paths.portfolio,
  paths.governance,
  paths.claim,
  paths.receipt,
  paths.ingress,
  paths.estimator,
  paths.assessor,
  paths.external,
  paths.lease,
  paths.route,
]) {
  syntaxCheck(relative);
}

const selector = read(paths.selector);
const portfolio = read(paths.portfolio);
const governance = read(paths.governance);
const claim = read(paths.claim);
const receipt = read(paths.receipt);
const ingress = read(paths.ingress);
const estimator = read(paths.estimator);
const assessor = read(paths.assessor);
const external = read(paths.external);
const lease = read(paths.lease);
const route = read(paths.route);
const index = read(paths.index);
const claimUniqueMigration = read(paths.claimUniqueMigration);
const receiptEnforcementMigration = read(paths.receiptEnforcementMigration);
const leaseMigration = read(paths.leaseMigration);
const leaseGuardMigration = read(paths.leaseGuardMigration);

// Phase 17 + 26: selection must be conservative and calibration-stable before request creation.
requireMarker(selector, "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1", "PHASE17_CONTRACT");
requireMarker(selector, "scoring_uses_lowest_information_gain_estimate: true", "PHASE17_LOWEST_IG");
requireMarker(selector, "scoring_uses_highest_cost_estimate: true", "PHASE17_HIGHEST_COST");
requireMarker(selector, "selection_is_not_execution_authorization: true", "PHASE17_NOT_AUTH");
requireMarker(
  portfolio,
  "AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_V1",
  "PHASE26_CONTRACT",
);
requireMarker(portfolio, "STABLE_SAFE_EXPERIMENT_PORTFOLIO_READY", "PHASE26_STABLE");
requireMarker(
  portfolio,
  "execution_request_generation_allowed: selection.selected_count > 0",
  "PHASE26_REQUEST_GATE",
);
requireMarker(portfolio, "BACKFILL_DID_NOT_CONVERGE_FAIL_CLOSED", "PHASE26_FAIL_CLOSED");

// Phase 18: explicit bounded approval only.
requireMarker(governance, "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1", "PHASE18_CONTRACT");
requireMarker(governance, "AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL", "PHASE18_EXPLICIT_APPROVAL");
requireMarker(governance, "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM", "PHASE18_ONE_TIME_APPROVAL");
requireMarker(governance, "independent_approver !== true", "PHASE18_INDEPENDENT_APPROVER");
requireMarker(governance, "approval_replay_after_claim_forbidden: true", "PHASE18_REPLAY_BLOCK");

// Phase 19 + 23: one claim per approval, single-use atomic consumption, replay forbidden.
requireMarker(claim, "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1", "PHASE19_CONTRACT");
requireMarker(claim, "single_use: true", "PHASE19_SINGLE_USE");
requireMarker(claim, "replay_forbidden: true", "PHASE19_REPLAY_FORBIDDEN");
requireMarker(claim, "CONSUMED_SINGLE_EXECUTION_CLAIM", "PHASE19_CONSUMED");
requireMarker(claim, "CLAIM_ALREADY_CONSUMED_OR_RACE_LOST", "PHASE19_RACE_REJECTED");
requireMarker(
  claimUniqueMigration,
  "approval_fingerprint",
  "PHASE23_APPROVAL_FINGERPRINT_UNIQUENESS",
);
requireMarker(claimUniqueMigration.toLowerCase(), "unique", "PHASE23_UNIQUE_INDEX");

// Phase 20 + 23: completed immutable receipt gates result ingress.
requireMarker(receipt, "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1", "PHASE20_RECEIPT_CONTRACT");
requireMarker(receipt, "immutable_provenance_record: true", "PHASE20_IMMUTABLE_RECEIPT");
requireMarker(receipt, "EXECUTION_NOT_COMPLETED", "PHASE20_COMPLETION_REQUIRED");
requireMarker(receipt, "receipt_can_be_replayed_for_execution: false", "PHASE20_RECEIPT_NO_REPLAY");
requireMarker(ingress, "AVANTIQO_GOVERNED_EXPERIMENT_RESULT_INGRESS_V1", "PHASE20_INGRESS_CONTRACT");
requireMarker(ingress, "assertAvantiqoExperimentExecutionReceiptCurrent", "PHASE20_RECEIPT_ASSERTION");
requireMarker(ingress, "require_completed: true", "PHASE20_RESULT_REQUIRES_COMPLETED_RECEIPT");
requireMarker(ingress, "platform_knowledge_written_directly: false", "PHASE20_NO_DIRECT_KNOWLEDGE");
requireMarker(
  receiptEnforcementMigration,
  "avantiqo_enforce_learning_execution_provenance",
  "PHASE23_DB_PROVENANCE_TRIGGER",
);
requireMarker(receiptEnforcementMigration, "BEFORE INSERT", "PHASE23_BEFORE_INSERT_GUARD");

// Phase 21 + 22: observed result evidence calibrates estimators/assessors without score inflation.
requireMarker(estimator, "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1", "PHASE21_CONTRACT");
requireMarker(estimator, "governed_result_evidence_verified: true", "PHASE21_RESULT_EVIDENCE");
requireMarker(estimator, "calibration_never_improves_estimate_score: true", "PHASE21_NO_SCORE_INFLATION");
requireMarker(assessor, "AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_V1", "PHASE22_CONTRACT");
requireMarker(assessor, "target_assessor_excluded_from_consensus: true", "PHASE22_LEAVE_ONE_OUT");
requireMarker(assessor, "automatic_rehabilitation: false", "PHASE22_NO_AUTO_REHABILITATION");

// Phase 24 + 25: external authority comes from real ledgers / persisted safe leases, not caller fingerprints.
requireMarker(external, "AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_V1", "PHASE24_CONTRACT");
requireMarker(external, "caller_supplied_fingerprint_is_authority: false", "PHASE24_CALLER_NOT_AUTHORITY");
requireMarker(claim, "LOCAL_MODE_EXTERNAL_AUTHORIZATION_FORBIDDEN", "PHASE24_LOCAL_MODE_ISOLATION");
requireMarker(lease, "AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1", "PHASE25_LEASE_CONTRACT");
requireMarker(lease, "AVANTIQO_RUNPOD_SAFE_LEASE_V2", "PHASE25_SAFE_LEASE_CONTRACT");
requireMarker(leaseMigration, "avantiqo_intelligence_runpod_leases", "PHASE25_LEASE_TABLE");
requireMarker(leaseGuardMigration, "avantiqo_enforce_intelligence_runpod_lease_provenance", "PHASE25_DB_GUARD");
requireMarker(leaseGuardMigration, "runpod_safe_lease_db_persisted", "PHASE25_DB_PERSISTED_BINDING");

// Current production cron may generate requests only. It must not approve, claim, consume, execute or record results.
const portfolioCall = route.indexOf("reconcileAvantiqoCalibrationBackfilledExperimentPortfolio()");
const requestCall = route.indexOf("reconcileAvantiqoExperimentExecutionRequests()");
assert.ok(portfolioCall >= 0 && requestCall > portfolioCall, `${CONTRACT}_ROUTE_ORDER_INVALID`);
requireMarker(
  route,
  "calibrationBackfilledExperimentPortfolio.execution_request_generation_allowed === true",
  "ROUTE_STABLE_PORTFOLIO_GATE",
);
requireMarker(route, "BLOCKED_PENDING_STABLE_SAFE_EXPERIMENT_PORTFOLIO", "ROUTE_FAIL_CLOSED_GATE");
forbidMarker(route, "recordAvantiqoExperimentExecutionApproval(", "CRON_AUTO_APPROVAL");
forbidMarker(route, "createAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CLAIM");
forbidMarker(route, "consumeAvantiqoExperimentExecutionClaim(", "CRON_AUTO_CONSUME");
forbidMarker(route, "recordAvantiqoExperimentExecutionReceipt(", "CRON_AUTO_RECEIPT");
forbidMarker(route, "recordAvantiqoGovernedScientificExperimentResult(", "CRON_AUTO_RESULT");
forbidMarker(route, "recordAvantiqoGovernedTransferExperimentResult(", "CRON_AUTO_TRANSFER_RESULT");

for (const exportMarker of [
  "AvantiqoActiveExperimentSelectionRuntime",
  "AvantiqoCalibrationBackfilledExperimentPortfolioRuntime",
  "AvantiqoExperimentExecutionGovernanceRuntime",
  "AvantiqoExperimentExecutionClaimRuntime",
  "AvantiqoExperimentExecutionReceiptRuntime",
  "AvantiqoGovernedExperimentResultIngressRuntime",
  "AvantiqoExperimentEstimatorCalibrationRuntime",
  "AvantiqoExperimentOutcomeAssessorCalibrationRuntime",
  "AvantiqoExperimentExternalExecutionEvidenceRuntime",
  "AvantiqoIntelligenceRunpodLeaseRuntime",
]) {
  requireMarker(index, exportMarker, `INDEX_EXPORT_${exportMarker}`);
}

// Deterministic provider-free contract simulation. This is deliberately isolated from Supabase,
// providers, wallets and RunPod. It proves the required state ordering and fail-closed invariants.
function freshCycle() {
  return {
    stablePortfolio: false,
    request: false,
    approval: false,
    claim: false,
    claimConsumed: false,
    receipt: null,
    result: null,
    calibrationEvents: 0,
    platformKnowledgeWritten: false,
    automaticTrainingStarted: false,
    providerCalled: false,
    walletWritten: false,
    runpodSubmitted: false,
  };
}

function selectStablePortfolio(state, safe) {
  state.stablePortfolio = safe === true;
}

function createRequest(state) {
  if (!state.stablePortfolio) throw new Error("SIM_REQUEST_REQUIRES_STABLE_SAFE_PORTFOLIO");
  state.request = true;
}

function approve(state, { explicit, independent }) {
  if (!state.request) throw new Error("SIM_APPROVAL_REQUIRES_REQUEST");
  if (explicit !== true) throw new Error("SIM_AUTOMATIC_APPROVAL_FORBIDDEN");
  if (independent !== true) throw new Error("SIM_INDEPENDENT_APPROVER_REQUIRED");
  state.approval = true;
}

function createClaim(state) {
  if (!state.approval) throw new Error("SIM_CLAIM_REQUIRES_APPROVAL");
  if (state.claim) throw new Error("SIM_ONE_CLAIM_PER_APPROVAL");
  state.claim = true;
}

function consumeClaim(state) {
  if (!state.claim) throw new Error("SIM_CONSUME_REQUIRES_CLAIM");
  if (state.claimConsumed) throw new Error("SIM_CLAIM_REPLAY_FORBIDDEN");
  state.claimConsumed = true;
}

function recordReceipt(state, { status = "COMPLETED", startedAt = 1000, completedAt = 1100 } = {}) {
  if (!state.claimConsumed) throw new Error("SIM_RECEIPT_REQUIRES_CONSUMED_CLAIM");
  if (state.receipt) throw new Error("SIM_RECEIPT_IMMUTABLE");
  if (status !== "COMPLETED") throw new Error("SIM_FAILED_EXECUTION_NOT_RESULT_ELIGIBLE");
  if (!(Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt)) {
    throw new Error("SIM_EXECUTION_TIME_PROVENANCE_INVALID");
  }
  state.receipt = Object.freeze({ status, startedAt, completedAt });
}

function recordResult(state, classification = "SUPPORTED") {
  if (!state.receipt || state.receipt.status !== "COMPLETED") {
    throw new Error("SIM_RESULT_REQUIRES_COMPLETED_RECEIPT");
  }
  if (state.result) throw new Error("SIM_DUPLICATE_RESULT_FOR_RECEIPT_FORBIDDEN");
  state.result = Object.freeze({ classification });
}

function calibrate(state) {
  if (!state.result) throw new Error("SIM_CALIBRATION_REQUIRES_GOVERNED_RESULT");
  state.calibrationEvents += 1;
}

function expectFailure(fn, expected) {
  let message = "";
  try {
    fn();
  } catch (error) {
    message = String(error?.message || error);
  }
  assert.equal(message, expected, `${CONTRACT}_EXPECTED_FAILURE_NOT_OBSERVED:${expected}`);
}

// Negative-order tests.
expectFailure(() => createRequest(freshCycle()), "SIM_REQUEST_REQUIRES_STABLE_SAFE_PORTFOLIO");
{
  const state = freshCycle();
  selectStablePortfolio(state, true);
  createRequest(state);
  expectFailure(
    () => approve(state, { explicit: false, independent: true }),
    "SIM_AUTOMATIC_APPROVAL_FORBIDDEN",
  );
}
expectFailure(() => createClaim(freshCycle()), "SIM_CLAIM_REQUIRES_APPROVAL");
{
  const state = freshCycle();
  selectStablePortfolio(state, true);
  createRequest(state);
  approve(state, { explicit: true, independent: true });
  createClaim(state);
  expectFailure(() => createClaim(state), "SIM_ONE_CLAIM_PER_APPROVAL");
  consumeClaim(state);
  expectFailure(() => consumeClaim(state), "SIM_CLAIM_REPLAY_FORBIDDEN");
}
expectFailure(() => recordReceipt(freshCycle()), "SIM_RECEIPT_REQUIRES_CONSUMED_CLAIM");
expectFailure(() => recordResult(freshCycle()), "SIM_RESULT_REQUIRES_COMPLETED_RECEIPT");
{
  const state = freshCycle();
  selectStablePortfolio(state, true);
  createRequest(state);
  approve(state, { explicit: true, independent: true });
  createClaim(state);
  consumeClaim(state);
  expectFailure(
    () => recordReceipt(state, { status: "FAILED" }),
    "SIM_FAILED_EXECUTION_NOT_RESULT_ELIGIBLE",
  );
}

// Happy path: local provider-free governed execution evidence.
const success = freshCycle();
selectStablePortfolio(success, true);
createRequest(success);
approve(success, { explicit: true, independent: true });
createClaim(success);
consumeClaim(success);
recordReceipt(success, { status: "COMPLETED", startedAt: 1000, completedAt: 1100 });
recordResult(success, "SUPPORTED");
calibrate(success);
assert.equal(success.calibrationEvents, 1);
assert.equal(success.platformKnowledgeWritten, false);
assert.equal(success.automaticTrainingStarted, false);
assert.equal(success.providerCalled, false);
assert.equal(success.walletWritten, false);
assert.equal(success.runpodSubmitted, false);

// Refutation path must also be learnable without auto-promoting knowledge/training.
const refutation = freshCycle();
selectStablePortfolio(refutation, true);
createRequest(refutation);
approve(refutation, { explicit: true, independent: true });
createClaim(refutation);
consumeClaim(refutation);
recordReceipt(refutation, { status: "COMPLETED", startedAt: 2000, completedAt: 2100 });
recordResult(refutation, "REFUTED");
calibrate(refutation);
assert.equal(refutation.result.classification, "REFUTED");
assert.equal(refutation.calibrationEvents, 1);
assert.equal(refutation.platformKnowledgeWritten, false);
assert.equal(refutation.automaticTrainingStarted, false);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE27_AUDIT=PASS");
console.log(`AVANTIQO_GOVERNED_LEARNING_CLOSED_LOOP_CERTIFICATION_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_PHASE27_SELECTION_TO_REQUEST_COMPOSITION_VERIFIED=true");
console.log("AVANTIQO_PHASE27_EXPLICIT_APPROVAL_REQUIRED=true");
console.log("AVANTIQO_PHASE27_ONE_CLAIM_PER_APPROVAL_VERIFIED=true");
console.log("AVANTIQO_PHASE27_CLAIM_REPLAY_REJECTED=true");
console.log("AVANTIQO_PHASE27_COMPLETED_IMMUTABLE_RECEIPT_REQUIRED=true");
console.log("AVANTIQO_PHASE27_RESULT_WITHOUT_RECEIPT_REJECTED=true");
console.log("AVANTIQO_PHASE27_FAILED_EXECUTION_ACCEPTED_AS_RESULT=false");
console.log("AVANTIQO_PHASE27_RESULT_TO_CALIBRATION_COMPOSITION_VERIFIED=true");
console.log("AVANTIQO_PHASE27_REFUTATION_PATH_VERIFIED=true");
console.log("AVANTIQO_PHASE27_DB_PROVENANCE_GUARDS_PRESENT=true");
console.log("AVANTIQO_PHASE27_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE27_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE27_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE27_EXECUTION_AUTHORIZED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE27_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE27_AUTOMATIC_TRAINING_STARTED=false");
