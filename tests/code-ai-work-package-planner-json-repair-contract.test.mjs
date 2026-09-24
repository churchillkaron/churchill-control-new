import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("invalid planner JSON self-repairs internally within the bounded reasoning budget", () => {
  assert.match(source, /PLANNER OUTPUT REPAIR:/);
  assert.match(source, /reason === "CODE_AI_WORK_PACKAGE_JSON_INVALID"/);
  assert.match(source, /planner_output_repair_required:/);
  assert.match(source, /compact_json_only: compactJsonOnly/);
  assert.match(source, /PLANNER_OUTPUT_REPAIR_RUNNING/);
  assert.match(source, /repairing the planner package automatically and continuing/);
  assert.match(source, /repair_category: repairCategory/);
  assert.match(source, /repeatedRepairCategory/);
  assert.match(source, /CODE_AI_PLANNER_OUTPUT_REPAIR_EXHAUSTED/);
  assert.match(source, /return executeBatchedAutonomousCodeMissionLive\(\{/);
  assert.match(source, /reasoning_call_budget: control\.reasoning_call_budget/);
  assert.match(source, /raw_reasoning_persisted: false/);
  assert.match(source, /const multiFileStructuredRepair/);
  assert.match(source, /edit exactly one remaining controller-declared file in this pass/);
  assert.match(source, /Do not repeat already-mutated files/);
  assert.match(source, /const maxRepairAttempts = repairCategory === "STRUCTURED_JSON" \? 2 : 1/);
  assert.match(source, /repair_attempts: sameRepairCategory \? previousRepairAttempts \+ 1 : 1/);
  assert.match(source, /max_repair_attempts: maxRepairAttempts/);
});

test("oversized planner packages self-repair into a bounded executable batch", () => {
  assert.match(source, /CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED/);
  assert.match(source, /operation_limit_exceeded: operationLimitExceeded/);
  assert.match(source, /operation_count: operationCount/);
  assert.match(source, /at most \$\{packageOperationLimit\} operations/);
  assert.match(source, /max_package_operations: packageOperationLimit/);
  assert.match(source, /modelOperationCount > packageOperationLimit/);
  assert.match(source, /codeAIWorkPackageModelOperationCount\(workPackage\)/);
  assert.match(source, /defer the remaining work to the next reasoning pass/);
  assert.match(source, /split the work into a smaller executable batch and continue/);
});

test("existing test evidence is protected from shortcut mutation and replanned internally", () => {
  assert.match(source, /Existing tests are verification evidence, not a shortcut edit target/);
  assert.match(source, /CODE_AI_WORK_PACKAGE_EXISTING_TEST_MUTATION_FORBIDDEN/);
  assert.match(source, /protected_test_mutation: Boolean\(protectedTestMutationPath\)/);
  assert.match(source, /Leave that existing test file unchanged\. Repair the source implementation instead/);
});

test("invalid apply_files mutation shape remains internally repairable", () => {
  assert.match(source, /mutation_shape_invalid: mutationShapeInvalid/);
  assert.match(source, /plannerOutputRepair\.mutation_shape_invalid === true/);
  assert.match(source, /previous apply_files mutation shape was invalid/);
});
