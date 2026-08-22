import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

autoRun();

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function autoRun() {
  const bridge = await source("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js");
  const synthetic = await source("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
  const repair = await source("lib/operator/runtime/OperatorRepairSupervisionRuntime.js");

  assert.match(bridge, /AVANTIQO_OPERATOR_INTELLIGENCE_READ_TOOL_BRIDGE_V1/);
  assert.match(bridge, /mode !== "read"/);
  assert.match(bridge, /requires_confirmation === true/);
  assert.match(bridge, /transactional === true/);
  assert.match(bridge, /\["high", "critical"\]/);
  assert.match(bridge, /executeUbteCapability/);
  assert.match(bridge, /organizationId: organization/);
  assert.match(bridge, /readOnly: true/);
  assert.match(bridge, /RECURSIVE_CONTROL_CAPABILITIES/);
  assert.doesNotMatch(bridge, /allow_mutating_tools:\s*true/);

  assert.match(synthetic, /OperatorIntelligenceToolBridgeRuntime\.createReadTools/);
  assert.match(synthetic, /tools,/);
  assert.match(synthetic, /allow_mutating_tools: false/);
  assert.match(synthetic, /observed_evidence/);
  assert.match(synthetic, /execution_governance_bypassed: false/);

  assert.match(repair, /OperatorIntelligenceToolBridgeRuntime\.createReadTools/);
  assert.match(repair, /allow_mutating_tools: false/);
  assert.match(repair, /observed_evidence/);
  assert.match(repair, /Do not retry or execute writes/);

  console.log("PASS avantiqo operator intelligence live-read bridge contract");
}
