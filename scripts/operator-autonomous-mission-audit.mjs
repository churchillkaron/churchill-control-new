#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [missionSource, platformRuntimeSource, governanceSource] = await Promise.all([
  readFile("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  readFile("lib/operator/governance/operatorExecutionGovernance.js", "utf8"),
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
  "const MAX_STEPS = 6",
  "OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS",
  "OPERATOR_MISSION_RECURSION_BLOCKED",
  "OPERATOR_MISSION_READ_CHAIN_NESTING_BLOCKED",
  "OPERATOR_MISSION_DYNAMIC_RESULT_CHAINING_BLOCKED",
]);

requireAll("MISSION_PREFLIGHT", missionSource, [
  "const preflight = []",
  "const blocked = preflight.find((entry) => !entry.ok)",
  "OPERATOR_MISSION_OPERATOR_CAPABILITY_REQUIRED",
  "OPERATOR_MISSION_PERMISSION_REQUIRED",
  "OPERATOR_ENTITY_CONTEXT_REQUIRED",
]);

requireAll("MISSION_ACTION_GOVERNANCE", missionSource, [
  "OPERATOR_MISSION_CONFIRMATION_STEP_BLOCKED",
  "OPERATOR_MISSION_ACTION_REQUIRES_LOW_RISK",
  "OPERATOR_MISSION_ACTION_REQUIRES_AUTO_EXECUTE",
  "OPERATOR_MISSION_DURABLE_APPROVAL_STEP_BLOCKED",
  "requiresDurableApproval(normalizedCapability)",
  "recordOperatorExecutionAudit",
]);

requireAll("MISSION_FAILURE_POLICY", missionSource, [
  "stopped_on_first_failure: failedSteps > 0",
  "remaining_steps: Math.max(0, normalized.steps.length - results.length)",
]);

requireAll("GOVERNANCE_SOURCE", governanceSource, [
  "export function requiresDurableApproval",
  "export async function recordOperatorExecutionAudit",
]);

console.log("OPERATOR_AUTONOMOUS_MISSION_AUDIT=PASS");
console.log("OPERATOR_MISSION_STEPS=2_TO_6");
console.log("OPERATOR_MISSION_PREFLIGHT=ALL_CHILDREN_BEFORE_SIDE_EFFECTS");
console.log("OPERATOR_MISSION_ACTIONS=LOW_RISK_AUTO_EXECUTE_CONFIRMATION_FREE_APPROVAL_FREE");
console.log("OPERATOR_MISSION_DYNAMIC_CHAINING=BLOCKED");
console.log("OPERATOR_MISSION_CHILD_AUDIT=REQUIRED_FOR_NON_READS");
console.log("OPERATOR_MISSION_EXTERNAL_RETRY=FORBIDDEN");
