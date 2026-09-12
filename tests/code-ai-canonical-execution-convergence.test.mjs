import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const canonical = fs.readFileSync("lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createCodeAIAutonomousCapability.js", "utf8");
const healing = fs.readFileSync("lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js", "utf8");

test("Code Studio and Business Partner self-healing share one canonical Code Employee execution selector", () => {
  assert.match(canonical, /SERVERLESS_ZERO_IDLE/);
  assert.match(canonical, /DURABLE_WARM_SESSION/);
  assert.match(canonical, /DIRECT_GOVERNED/);
  assert.match(canonical, /executeCodeAIEmployeeZeroIdleFastStartMission/);
  assert.match(canonical, /executeCodeAIEmployeeFastStartMission/);
  assert.match(canonical, /executeCodeAIEmployeeFinalReviewMission/);
  assert.match(capability, /executeCanonicalCodeAIEmployeeMission/);
  assert.match(healing, /executeCanonicalCodeAIEmployeeMission/);
  assert.doesNotMatch(healing, /from "@\/lib\/code\/runtime\/CodeAIEmployeeRuntime"/);
});

test("canonical selector keeps final review even when fast-start infrastructure is unavailable", () => {
  assert.match(canonical, /executeCodeAIEmployeeFinalReviewMission\(options\)/);
  assert.match(canonical, /canonical_execution_contract/);
  assert.match(canonical, /execution_transport_mode/);
});
