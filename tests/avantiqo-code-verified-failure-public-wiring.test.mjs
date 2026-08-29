import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CAPABILITY = "lib/platform/capabilities/createCodeAIAutonomousCapability.js";
const FAILURE_UTILITY =
  "lib/intelligence/runtime/AvantiqoCodeMissionVerifiedFailureUtilityRuntime.js";

const [capability, failureUtility] = await Promise.all([
  readFile(CAPABILITY, "utf8"),
  readFile(FAILURE_UTILITY, "utf8"),
]);

function markers(source, expected) {
  for (const marker of expected) {
    assert.ok(source.includes(marker), `missing marker: ${marker}`);
  }
}

test("public Code non-success branch records only governed verified-failure utility", () => {
  markers(capability, [
    "recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility",
    "AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT",
    "intelligence_verified_failure_utility",
    "VERIFIED_FAILURE_UTILITY_PUBLIC_HOOK_FAILED",
    "code_execution_result_unchanged: true",
  ]);

  const successBranch = capability.indexOf(
    "if (unifiedBinding && verifiedEmployeeCompletion(result))",
  );
  const nonSuccessBranch = capability.indexOf("} else if (unifiedBinding) {", successBranch);
  const utilityCall = capability.indexOf(
    "recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({",
  );
  const returnResult = capability.indexOf("return result;", utilityCall);

  assert.ok(successBranch >= 0);
  assert.ok(nonSuccessBranch > successBranch);
  assert.ok(utilityCall > nonSuccessBranch,
    "verified-failure utility must be invoked only from unified non-success handling");
  assert.ok(returnResult > utilityCall);

  const successBlock = capability.slice(successBranch, nonSuccessBranch);
  assert.equal(
    successBlock.includes("recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility"),
    false,
    "verified success must stay on the existing success learning handoff only",
  );
});

test("public failure-utility summary is observational and has no promotion or training authority", () => {
  const start = capability.indexOf("function verifiedFailureUtilitySummary");
  const end = capability.indexOf("function preparationRequest", start);
  assert.ok(start >= 0 && end > start);
  const summary = capability.slice(start, end);

  markers(summary, [
    "observational_association_only: true",
    "causal_attribution_allowed: false",
    "automatic_knowledge_promotion: false",
    'automatic_training_effect: "NONE"',
  ]);
});

test("verified-failure runtime excludes infrastructure and resumable states before recording", () => {
  markers(failureUtility, [
    "TERMINAL_EMPLOYEE_BUDGET_EXHAUSTION_REQUIRED",
    "LATEST_FAILED_DETERMINISTIC_VERIFICATION_REQUIRED",
    "MISSION_REPOSITORY_HEAD_MISMATCH",
    "CHANGED_SOURCE_REQUIRED",
    "PLANNER_PENDING_NOT_TERMINAL",
    "REASONING_EXHAUSTION_MUST_END_IN_REPAIR_REQUIRED_STATE",
    "REASONING_EXHAUSTION_VERIFICATION_BLOCKER_REQUIRED",
    "PASS_EXHAUSTION_MUST_FOLLOW_CONTROLLER_REPAIR_CONTINUATION",
    "provider_or_scheduler_failure_eligible: false",
    "ordinary_repair_required_eligible: false",
    "repository_move_eligible: false",
    "later_successful_verification_cancels_failure_signal: true",
    "relationship: \"OBSERVATIONAL_ASSOCIATION_ONLY\"",
    "causal_attribution_allowed: false",
    "automatic_knowledge_promotion: false",
    'automatic_training_effect: "NONE"',
  ]);
});
