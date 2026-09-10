import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("verified production release is exact-commit, main-only and migration-free", async () => {
  const runtime = await source("lib/platform/runtime/AvantiqoProductionReleaseRuntime.js");
  const capability = await source("lib/platform/capabilities/createProductProductionReleaseCapability.js");

  assert.match(runtime, /target:\s*"production"/);
  assert.match(runtime, /ref:\s*commitSha/);
  assert.match(runtime, /AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH/);
  assert.match(runtime, /production_deployed:\s*true/);
  assert.match(capability, /platform\.code\.ai\.commit/);
  assert.match(capability, /platform\.deploy\.production/);
  assert.match(capability, /code_ai_commit/);
  assert.match(capability, /verified\s*!==\s*true/);
  assert.match(capability, /database_migrations_applied:\s*false/);
  assert.match(capability, /secrets_changed:\s*false/);
});

test("Product Engineering can convert only a persistence-approved result into verified production release", async () => {
  const cycle = await source("lib/platform/capabilities/createProductEngineeringCycleCapability.js");

  assert.match(cycle, /release_to_production/);
  assert.match(cycle, /persistenceState === "REQUEST_COMMIT_CONFIRMATION"/);
  assert.match(cycle, /product_production_release/);
  assert.match(cycle, /execution_key:\s*key/);
  assert.match(cycle, /production_deployed:\s*productionRelease\?\.production_deployed === true/);
});

test("Business Partner self-heals declared and missing capabilities only when dedicated release permissions exist", async () => {
  const core = await source("lib/operator/runtime/OperatorTurnRuntimeCore.js");

  assert.match(core, /platform\.code\.ai\.commit/);
  assert.match(core, /platform\.deploy\.production/);
  assert.match(core, /attemptDeclaredImplementationRepair/);
  assert.match(core, /attemptMissingCapabilityBuild/);
  assert.match(core, /release_to_production:\s*true/);
  assert.match(core, /operatorMissingCapabilityBuild:\s*true/);
});
