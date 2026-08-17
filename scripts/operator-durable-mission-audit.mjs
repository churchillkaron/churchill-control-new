#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runSource, missionSource, turnSource, routeSource] = await Promise.all([
  readFile("lib/operator/contracts/OperatorAutonomousRun.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("app/api/operator/turn/route.js", "utf8"),
]);

function requireAll(label, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.includes(fragment),
      `${label} missing required contract fragment: ${fragment}`,
    );
  }
}

requireAll("MISSION_RUN_CONTRACT", runSource, [
  'const RUN_KINDS = new Set(["single_action", "mission"])',
  "export function createOperatorMissionRun",
  "payload: object(candidate.payload)",
  'gate: STEP_GATES.has(gate) ? gate : "none"',
  "approval_request_id: text(candidate.approval_request_id) || null",
  "verify_after: verification",
]);

requireAll("MISSION_EXECUTION_STATE", missionSource, [
  'mission_mode: "durable_registered_sequence"',
  "current_step_id",
  "completed_step_ids",
  "resume_payload",
  "approval_request_id",
  'pauseReason: "confirmation"',
  'pauseReason: "approval"',
  'pauseReason: "verification"',
]);

requireAll("MISSION_GOVERNANCE", missionSource, [
  "resolveOperatorExecutionApproval({",
  "approvalRequestId",
  "TERMINAL_APPROVAL_FAILURE_REASONS",
  "contract.durable_approval_required",
  "CONFIRMATION_REQUIRED",
]);

requireAll("MISSION_RESUME_CHECKPOINT_INTEGRITY", missionSource, [
  "const orderedIds = steps.map((step) => step.id)",
  "rawCompleted.length !== completed.length",
  "const expectedCompleted = orderedIds.slice(0, currentIndex)",
  'return { error: "OPERATOR_MISSION_RESUME_CHECKPOINT_INVALID" }',
  'return { error: "OPERATOR_MISSION_RESUME_VERIFICATION_INVALID" }',
  "verificationStepId && verificationStepId !== currentStepId",
]);

const checkpointValidationIndex = missionSource.indexOf(
  "const expectedCompleted = orderedIds.slice(0, currentIndex)",
);
const missionLoopIndex = missionSource.indexOf("for (\n      let index = preflight.findIndex");
assert.ok(
  checkpointValidationIndex >= 0 &&
    missionLoopIndex >= 0 &&
    checkpointValidationIndex < missionLoopIndex,
  "resume checkpoint integrity must be validated before mission execution resumes",
);

requireAll("MISSION_VERIFICATION_RESUME", missionSource, [
  "verification_pending",
  "if (verificationPending)",
  "const verificationResult = await executeVerification(entry, context)",
  "verificationPending = null",
  'pauseReason: "verification"',
]);

const verificationResumeIndex = missionSource.indexOf("if (verificationPending)");
const actionExecutionIndex = missionSource.indexOf(
  "action = await executeEntry(entry, context)",
);
assert.ok(
  verificationResumeIndex >= 0 &&
    actionExecutionIndex >= 0 &&
    verificationResumeIndex < actionExecutionIndex,
  "verification resume must be handled before any action replay path",
);

requireAll("TURN_MISSION_PERSISTENCE", turnSource, [
  'const OPERATOR_MISSION_KEY = "platform.operator_mission.execute"',
  "createOperatorMissionRun",
  'resume_kind: "mission"',
  "operatorMissionConfirmed",
  "missionResultAgreementState",
  "continuingMission",
  "existingRun.run_id",
]);

requireAll("SERVER_AUTHORITATIVE_STATE", routeSource, [
  "Authorization-critical Operator state is server-authoritative",
  "const agreementState = object(memory.agreementState)",
]);

assert.ok(
  !routeSource.includes("...object(clientAgreementState(body))"),
  "client agreement state must not be merged into authorization-critical state",
);
assert.ok(
  !routeSource.includes("function clientAgreementState"),
  "client agreement state parser should be removed from the execution route",
);

console.log("OPERATOR_DURABLE_MISSION_AUDIT=PASS");
console.log("OPERATOR_MISSION_STATE=SERVER_PERSISTED_CONVERSATION");
console.log("OPERATOR_MISSION_RESUME=EXACT_STEP_AND_PAYLOAD");
console.log("OPERATOR_MISSION_CHECKPOINT=STRICT_ORDERED_PREFIX");
console.log("OPERATOR_MISSION_CHECKPOINT_VERIFICATION=EXACT_CURRENT_STEP");
console.log("OPERATOR_MISSION_APPROVAL=EXACT_REQUEST_ID");
console.log("OPERATOR_MISSION_VERIFICATION=NO_WRITE_REPLAY");
console.log("OPERATOR_CLIENT_AGREEMENT_STATE=NON_AUTHORITATIVE");
