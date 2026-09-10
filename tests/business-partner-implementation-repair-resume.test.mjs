import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("verified implementation repair remains bound to the exact original action", () => {
  assert.match(source, /AVANTIQO_IMPLEMENTATION_REPAIR_RESUME_V1/);
  assert.match(source, /authorization_effect\) !== "SAME_ACTION_ONLY"/);
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
