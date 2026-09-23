import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
const commit = await readFile(new URL("../lib/platform/capabilities/createCodeAICommitCapability.js", import.meta.url), "utf8");

test("autonomous Code capability applies the engineering OS before canonical execution", () => {
  assert.match(capability, /prepareCodeAIEngineeringOperatingSystem/);
  assert.match(capability, /const engineeringOSPrepared = prepareCodeAIEngineeringOperatingSystem/);
  assert.match(capability, /prepareCodeAIEngineeringPrecisionOS/);
  assert.match(capability, /const executionObjective = \[/);
  assert.match(capability, /engineeringOSPrepared\.objective/);
  assert.match(capability, /precisionPrepared\.directive/);
  assert.match(capability, /const executionObjectiveContext = \{/);
  assert.match(capability, /engineeringOSPrepared\.objective_context/);
  assert.match(capability, /precisionPrepared\.objective_context/);
});

test("autonomous Code result persists final engineering OS readiness inside attested state", () => {
  assert.match(capability, /finalizeCodeAIEngineeringOperatingSystem/);
  assert.match(capability, /engineering_operating_system: result\.engineering_operating_system/);
  assert.match(capability, /attestCodeMissionState/);
  assert.ok(capability.indexOf("engineering_operating_system: result.engineering_operating_system") < capability.indexOf("attestCodeMissionState({"));
});

test("governed commit remains a separate capability boundary", () => {
  assert.match(commit, /assertCodeAIWorldClassCommitReady/);
  assert.match(commit, /assertCodeAIEngineeringOSCommitReady/);
  assert.match(commit, /operatorRequiresConfirmation: true/);
});
