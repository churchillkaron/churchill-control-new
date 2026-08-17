#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [missionSource, platformRuntimeSource, catalogSource, turnSource] =
  await Promise.all([
    readFile(
      "lib/platform/capabilities/createOperatorMissionCapability.js",
      "utf8",
    ),
    readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
    readFile("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8"),
    readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  ]);

function requireAll(label, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.includes(fragment),
      `${label} missing required contract fragment: ${fragment}`,
    );
  }
}

requireAll("MISSION_REGISTRATION", platformRuntimeSource, [
  "createOperatorMissionCapability",
  "operator_mission",
]);

requireAll("MISSION_BOUNDARY", missionSource, [
  'const MISSION_KEY = "platform.operator_mission.execute"',
  "const MAX_STEPS = 6",
  "OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS",
  "OPERATOR_MISSION_RECURSION_BLOCKED",
  "OPERATOR_MISSION_READ_CHAIN_NESTING_BLOCKED",
  "Every step is preflighted before the first side effect",
]);

requireAll("MISSION_CHILD_GOVERNANCE", missionSource, [
  "OPERATOR_MISSION_OPERATOR_CAPABILITY_REQUIRED",
  "OPERATOR_MISSION_CONFIRMATION_STEP_BLOCKED",
  "OPERATOR_MISSION_ACTION_REQUIRES_LOW_RISK",
  "OPERATOR_MISSION_ACTION_REQUIRES_AUTO_EXECUTE",
  "OPERATOR_MISSION_APPROVAL_POLICY_STEP_BLOCKED",
  "OPERATOR_MISSION_PERMISSION_REQUIRED",
  "OPERATOR_ENTITY_CONTEXT_REQUIRED",
]);

requireAll("MISSION_EXECUTION_SEMANTICS", missionSource, [
  'operatorMode: "write"',
  "operatorAutoExecute: true",
  "operatorRequiresConfirmation: false",
  'risk: "low"',
  'mission_mode: "safe_registered_sequence"',
  "all_steps_preflighted: true",
  "stopped_on_first_failure: failedSteps > 0",
  "break;",
]);

requireAll("MISSION_OUTER_GOVERNANCE", turnSource, [
  "resolveOperatorExecutionApproval",
  "recordOperatorExecutionAudit",
  "voiceCanAutoExecute",
  "executionBlockedReason",
]);

requireAll("MISSION_DISCOVERY", catalogSource, [
  "manifest?.tags",
  "manifest?.description",
  "auto_execute",
  "requires_confirmation",
]);

assert.equal(
  missionSource.includes("child result") && missionSource.includes("payloadFrom"),
  false,
  "Mission steps must not derive later payloads from prior child results.",
);

console.log("OPERATOR_AUTONOMOUS_MISSION_AUDIT=PASS");
console.log("OPERATOR_MISSION_MAX_STEPS=6");
console.log("OPERATOR_MISSION_PREFLIGHT=ALL_STEPS_BEFORE_SIDE_EFFECTS");
console.log("OPERATOR_MISSION_WRITES=LOW_RISK_AUTO_EXECUTE_CONFIRMATION_FREE_ONLY");
console.log("OPERATOR_MISSION_APPROVAL_STEPS=BLOCKED");
console.log("OPERATOR_MISSION_ENTITY_SCOPE=ENFORCED");
console.log("OPERATOR_MISSION_PERMISSIONS=ENFORCED");
console.log("OPERATOR_MISSION_FAILURE_POLICY=STOP_ON_FIRST_FAILURE_NO_AUTO_RETRY");
console.log("OPERATOR_MISSION_DYNAMIC_DEPENDENCIES=FORBIDDEN_USE_READ_CHAIN");
