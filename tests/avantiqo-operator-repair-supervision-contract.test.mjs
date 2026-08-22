import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repair = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorRepairSupervisionRuntime.js", import.meta.url),
  "utf8",
);
const synthetic = fs.readFileSync(
  new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
  "utf8",
);

test("technical failures receive owned critique and repair supervision", () => {
  assert.match(repair, /AVANTIQO_OPERATOR_REPAIR_SUPERVISION_V1/);
  assert.match(repair, /AvantiqoStructuredIntelligenceSupervisorRuntime\.run/);
  assert.match(repair, /safe_reinspect_then_retry/);
  assert.match(repair, /replan_required/);
});

test("repair supervision never retries or bypasses governance itself", () => {
  assert.match(repair, /Do not retry or execute anything in this phase/);
  assert.match(repair, /Never recommend bypassing permissions, confirmation, approval, wallet, entity scope, verification/);
  assert.match(repair, /HUMAN_GOVERNANCE_GATE/);
});

test("synthetic intelligence turn attaches repair evidence after governed execution", () => {
  assert.match(synthetic, /OperatorRepairSupervisionRuntime\.supervise/);
  assert.match(synthetic, /execution_governance_bypassed:\s*false/);
  assert.match(synthetic, /repair,/);
});
