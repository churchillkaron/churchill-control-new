import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
const employee = await readFile(new URL("../lib/code/runtime/CodeAIEmployeeRuntime.js", import.meta.url), "utf8");

test("capability reasserts local device identity after precision context merge", () => {
  const marker = "const executionObjectiveContext = {";
  const start = capability.indexOf(marker);
  assert.ok(start >= 0);
  const block = capability.slice(start, start + 900);
  assert.match(block, /\.\.\.precisionPrepared\.objective_context/);
  assert.match(block, /workspace_target: requestedWorkspaceTarget \|\| text\(engineeringOSPrepared\.objective_context\?\.workspace_target/);
  assert.match(block, /device_id: requestedDeviceId \|\| text\(engineeringOSPrepared\.objective_context\?\.device_id/);
  assert.match(block, /device_session_id: requestedDeviceSessionId \|\| text\(engineeringOSPrepared\.objective_context\?\.device_session_id/);
});

test("employee grants the larger ceiling only to DEVICE missions", () => {
  assert.match(employee, /workspace_target.*DEVICE/s);
  assert.match(employee, /MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET/);
  assert.match(employee, /max_budget: localDeviceMission \? MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET : undefined/);
});
