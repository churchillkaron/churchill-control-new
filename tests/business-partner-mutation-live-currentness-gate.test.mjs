import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const live = fs.readFileSync("lib/platform/runtime/AvantiqoLiveExecutionRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("live runtime exposes a fail-closed exact current-execution assertion", () => {
  assert.match(live, /export async function assertAvantiqoLiveExecutionCurrent/);
  assert.match(live, /loaded\?\.found !== true \|\| currentExecutionId !== expectedExecutionId/);
  assert.match(live, /error\.code = error_code/);
  assert.match(live, /error\.mutation_executed = false/);
  assert.match(live, /authorization_effect = "NONE"/);
});

test("every centralized non-read Operator capability rechecks live ownership immediately before UBTE mutation", () => {
  assert.match(core, /assertAvantiqoLiveExecutionCurrent/);
  const approval = core.indexOf("if (!approval.allowed)");
  const gate = core.indexOf("await assertAvantiqoLiveExecutionCurrent({", approval);
  const execute = core.indexOf("const result = await executeUbteCapability({", gate);
  assert.ok(approval >= 0);
  assert.ok(gate > approval);
  assert.ok(execute > gate);
  assert.match(core, /if \(capabilityMode !== "read"\)/);
  assert.match(core, /x-avantiqo-live-execution-id/);
  assert.match(core, /OPERATOR_MUTATION_SUPERSEDED_EXECUTION/);
});
