import assert from "node:assert/strict";
import {
  assessCodeAIEmployeeCompletion,
  CodeAIEmployeeRuntime,
  CODE_AI_EMPLOYEE_RUNTIME_CONTRACT,
  CODE_AI_EMPLOYEE_MISSION_CONTRACT,
} from "../lib/code/runtime/CodeAIEmployeeRuntime.js";
import {
  CodeAIPlannerSpendPolicy,
} from "../lib/code/runtime/CodeAIPlannerSpendPolicy.js";
import {
  CodeAIWorkPackageRuntime,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_SELFTEST_V2";

function completedOperation(action, operationId, result = {}) {
  return {
    kind: "operation",
    operation_id: operationId,
    action,
    status: "completed",
    result,
  };
}

function sourceChanges(paths) {
  return paths.map((path) => ({ path, operation: "write", content: "export default true;\n" }));
}

assert.equal(CodeAIEmployeeRuntime.contract, CODE_AI_EMPLOYEE_RUNTIME_CONTRACT);
assert.equal(CodeAIEmployeeRuntime.mission_contract, CODE_AI_EMPLOYEE_MISSION_CONTRACT);
assert.equal(CodeAIEmployeeRuntime.default_reasoning_call_budget, 4);
assert.equal(CodeAIPlannerSpendPolicy.default_reasoning_call_budget, 4);
assert.equal(CodeAIPlannerSpendPolicy.max_reasoning_call_budget, 8);
assert.equal(CodeAIWorkPackageRuntime.max_package_operations, 12);
assert.ok(CodeAIWorkPackageRuntime.allowed_package_actions.includes("apply_files"));
assert.ok(CodeAIWorkPackageRuntime.allowed_package_actions.includes("verify"));
assert.ok(CodeAIWorkPackageRuntime.allowed_package_actions.includes("diff"));

const inspectionOnly = assessCodeAIEmployeeCompletion({
  status: "completed",
  files_changed: [],
  source_changes: [],
  verification: [],
  patch: null,
  evidence: [completedOperation("inspect", "inspect_1")],
});
assert.equal(inspectionOnly.complete, false);
assert.ok(inspectionOnly.blockers.includes("CODE_AI_EMPLOYEE_IMPLEMENTATION_REQUIRED"));

const changedUnverified = assessCodeAIEmployeeCompletion({
  status: "completed",
  files_changed: ["lib/example.js"],
  source_changes: sourceChanges(["lib/example.js"]),
  verification: [],
  tests: [],
  patch: "diff --git a/lib/example.js b/lib/example.js",
  evidence: [
    completedOperation("apply_files", "apply_1"),
    completedOperation("diff", "diff_1", { patch: "diff" }),
  ],
});
assert.equal(changedUnverified.complete, false);
assert.ok(changedUnverified.blockers.includes("CODE_AI_EMPLOYEE_SUCCESSFUL_VERIFICATION_REQUIRED"));

const verifiedWithoutFinalDiff = assessCodeAIEmployeeCompletion({
  status: "completed",
  files_changed: ["lib/example.js"],
  source_changes: sourceChanges(["lib/example.js"]),
  verification: [{ operation_id: "verify_1", passed: true }],
  tests: [{ operation_id: "verify_1", command: "node", args: ["--check", "lib/example.js"], exit_code: 0 }],
  patch: "diff --git a/lib/example.js b/lib/example.js",
  evidence: [
    completedOperation("apply_files", "apply_1"),
    completedOperation("verify", "verify_1", { exit_code: 0 }),
  ],
});
assert.equal(verifiedWithoutFinalDiff.complete, false);
assert.ok(verifiedWithoutFinalDiff.blockers.includes("CODE_AI_EMPLOYEE_FINAL_DIFF_REVIEW_REQUIRED"));
assert.ok(verifiedWithoutFinalDiff.blockers.includes("CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED"));

const verifiedEngineeringCompletion = assessCodeAIEmployeeCompletion({
  status: "completed",
  files_changed: ["lib/example.js"],
  source_changes: sourceChanges(["lib/example.js"]),
  verification: [{ operation_id: "verify_1", passed: true }],
  tests: [{ operation_id: "verify_1", command: "node", args: ["--check", "lib/example.js"], exit_code: 0 }],
  patch: "diff --git a/lib/example.js b/lib/example.js",
  evidence: [
    completedOperation("apply_files", "apply_1"),
    completedOperation("verify", "verify_1", { exit_code: 0 }),
    completedOperation("diff", "diff_1", { patch: "diff" }),
  ],
});
assert.equal(verifiedEngineeringCompletion.complete, true);
assert.deepEqual(verifiedEngineeringCompletion.blockers, []);
assert.equal(verifiedEngineeringCompletion.changed, true);
assert.equal(verifiedEngineeringCompletion.verified, true);
assert.equal(verifiedEngineeringCompletion.final_diff_observed, true);
assert.equal(verifiedEngineeringCompletion.worldclass_quality.verified, true);
assert.equal(verifiedEngineeringCompletion.worldclass_quality.risk, "standard");
assert.equal(verifiedEngineeringCompletion.worldclass_quality.required_verification_gates, 1);

const highRiskNeedsMultipleFamilies = assessCodeAIEmployeeCompletion({
  status: "completed",
  files_changed: ["lib/platform/example.js"],
  source_changes: sourceChanges(["lib/platform/example.js"]),
  verification: [{ operation_id: "verify_1", passed: true }],
  tests: [{ operation_id: "verify_1", command: "node", args: ["--check", "lib/platform/example.js"], exit_code: 0 }],
  patch: "diff --git a/lib/platform/example.js b/lib/platform/example.js",
  evidence: [
    completedOperation("apply_files", "apply_1"),
    completedOperation("verify", "verify_1", { exit_code: 0 }),
    completedOperation("diff", "diff_1", { patch: "diff" }),
  ],
});
assert.equal(highRiskNeedsMultipleFamilies.complete, false);
assert.equal(highRiskNeedsMultipleFamilies.worldclass_quality.risk, "high");
assert.equal(highRiskNeedsMultipleFamilies.worldclass_quality.required_verification_gates, 2);
assert.ok(
  highRiskNeedsMultipleFamilies.blockers.some((item) =>
    item.startsWith("CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED:"),
  ),
);

const lowLevelIncomplete = assessCodeAIEmployeeCompletion({
  status: "repair_required",
  files_changed: ["lib/example.js"],
  source_changes: sourceChanges(["lib/example.js"]),
  verification: [{ operation_id: "verify_1", passed: true }],
  tests: [{ operation_id: "verify_1", command: "node", args: ["--check", "lib/example.js"], exit_code: 0 }],
  patch: "diff",
  evidence: [
    completedOperation("apply_files", "apply_1"),
    completedOperation("verify", "verify_1", { exit_code: 0 }),
    completedOperation("diff", "diff_1", { patch: "diff" }),
  ],
});
assert.equal(lowLevelIncomplete.complete, false);
assert.ok(
  lowLevelIncomplete.blockers.includes("CODE_AI_EMPLOYEE_LOW_LEVEL_STATUS_repair_required"),
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    human_employee_completion_requires_real_implementation: true,
    inspection_only_is_not_completion: true,
    successful_verification_required: true,
    explicit_final_diff_review_required: true,
    low_level_completion_required: true,
    worldclass_quality_required: true,
    high_risk_requires_multiple_verification_families: true,
    default_reasoning_call_budget: CodeAIEmployeeRuntime.default_reasoning_call_budget,
    absolute_reasoning_call_budget: CodeAIPlannerSpendPolicy.max_reasoning_call_budget,
    batched_work_package_max_operations: CodeAIWorkPackageRuntime.max_package_operations,
    paid_provider_call_performed: false,
    runpod_lease_acquired: false,
    wallet_mutation_performed: false,
    source_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}));
