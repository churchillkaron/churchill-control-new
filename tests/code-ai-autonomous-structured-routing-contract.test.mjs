import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const autonomous = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const localProvider = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const providerV2 = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js", "utf8");

test("autonomous planner transports machine-readable implementation context to Code provider", () => {
  assert.match(autonomous, /allowed_package_actions: allowedActions/);
  assert.match(autonomous, /implementation_required: implementationRequired/);
  assert.match(autonomous, /implementation_present: implementationPresent/);
  assert.match(autonomous, /verification_failed: verificationFailed/);
  assert.match(autonomous, /repair_state: repairState/);
  assert.match(autonomous, /discovery_locked: discoveryLocked/);
  assert.match(autonomous, /allowed_edit_paths: allowedEditPaths/);
  assert.match(autonomous, /authoritative_verification:/);
  assert.match(autonomous, /code_ai_implementation_required: implementationRequired/);
  assert.match(autonomous, /code_ai_allowed_edit_paths: allowedEditPaths/);
});

test("local Code provider uses structured planner specification for model routing and prompt context", () => {
  assert.match(localProvider, /strongCodeModelRequired/);
  assert.match(localProvider, /spec\.implementation_required===true/);
  assert.match(localProvider, /input\.structured_specification\|\|input\.generation/);
  assert.match(localProvider, /strong_model_required:strongModelRequired/);
});

test("avantiqo-code provider exposes exact local job cancellation for stale recovery", () => {
  assert.match(providerV2, /async cancel\(input = \{\}\)/);
  assert.match(providerV2, /isCodeLocalJob\(jobId\)/);
  assert.match(providerV2, /AvantiqoCodeLocalQueueProvider\.cancel\(input\)/);
});
