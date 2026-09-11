import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const bindingSource = await readFile("lib/operator/runtime/OperatorImplementationRepairResumeBinding.js", "utf8");

test("verified implementation repair remains bound to the exact original action", () => {
  assert.match(source, /buildImplementationRepairResumeBinding/);
  assert.match(source, /validateImplementationRepairResumeBinding/);
  assert.match(bindingSource, /authorization_effect\) !== "SAME_ACTION_ONLY"/);
  assert.match(bindingSource, /IMPLEMENTATION_REPAIR_RESUME_BINDING_MISMATCH/);
  assert.match(source, /resume_kind: "implementation_repair"/);
  assert.match(source, /payload: object\(candidate\.payload\)/);
  assert.match(source, /original_message: text\(candidate\.original_message\)/);
});

test("repair continuation re-enters normal capability governance before execution", () => {
  assert.match(source, /resumeImplementationRepair[\s\S]*executionBlockedReason\(capability, \{ source, confirmed: false \}\)/);
  assert.match(source, /agreementWithPendingConfirmationRun\(\{[\s\S]*capability, payload: pending\.payload/);
  assert.match(source, /Should I proceed with that exact repaired action\?/);
});

test("old server activation does not discard a verified repair continuation", () => {
  assert.match(source, /REPAIRED_CAPABILITY_NOT_ACTIVE_ON_RUNNING_VERSION/);
  assert.match(source, /last_activation_check: "CAPABILITY_NOT_AVAILABLE"/);
  assert.match(source, /implementation_repair_resume:[\s\S]*resume_attempted: false/);
});

test("completed or cancelled continuations clear the repair resume binding", () => {
  assert.match(source, /delete next\.pending_execution;\s*delete next\.implementation_repair_resume;/);
});

test("declared implementation repair preserves conversation identity through Code handoff and exact retry", () => {
  assert.match(source, /async function attemptDeclaredImplementationRepair\(\{[\s\S]*conversationId = null/);
  assert.ok((source.match(/attemptDeclaredImplementationRepair\(\{/g) || []).length >= 3);
  assert.ok((source.match(/callerRequest,\s*conversationId,\s*\}\);/g) || []).length >= 2);
  assert.match(source, /operatorImplementationRepair: true[\s\S]*failedCapabilityKey/);
  assert.match(source, /operatorImplementationRepairRetry: true/);
});
