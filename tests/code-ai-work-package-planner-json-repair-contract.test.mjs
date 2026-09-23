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
  assert.match(source, /return executeBatchedAutonomousCodeMissionLive\(\{/);
  assert.match(source, /reasoning_call_budget: control\.reasoning_call_budget/);
  assert.match(source, /raw_reasoning_persisted: false/);
});

test("oversized planner packages self-repair into a bounded executable batch", () => {
  assert.match(source, /CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED/);
  assert.match(source, /operation_limit_exceeded: operationLimitExceeded/);
  assert.match(source, /operation_count: operationCount/);
  assert.match(source, /at most \$\{MAX_PACKAGE_OPERATIONS\} operations/);
  assert.match(source, /defer the remaining work to the next reasoning pass/);
  assert.match(source, /split the work into a smaller executable batch and continue/);
});
