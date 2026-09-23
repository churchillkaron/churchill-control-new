import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const cycle = fs.readFileSync("lib/platform/capabilities/createProductEngineeringCycleCapability.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createCodeAIAutonomousCapability.js", "utf8");
const canonical = fs.readFileSync("lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js", "utf8");
const finalReview = fs.readFileSync("lib/code/runtime/CodeAIEmployeeFinalReviewRuntime.js", "utf8");
const employee = fs.readFileSync("lib/code/runtime/CodeAIEmployeeRuntime.js", "utf8");
const convergence = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js", "utf8");
const live = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js", "utf8");
const warm = fs.readFileSync("lib/code/runtime/CodeAIEmployeeFastStartRuntime.js", "utf8");
const zeroIdle = fs.readFileSync("lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js", "utf8");

test("Business Partner Product Engineering binds Code AI to local compute", () => {
  assert.match(cycle, /capability_key: "platform\.code_ai_autonomous\.execute"[\s\S]*local_compute_required: true[\s\S]*infrastructure_policy: "local_only"/);
});

test("Code AI capability treats local-only as a restriction and forwards it", () => {
  assert.match(capability, /local_compute_required: \{[\s\S]*type: "boolean"/);
  assert.match(capability, /infrastructure_policy: \{[\s\S]*enum: \["local_only"\]/);
  assert.match(capability, /local_compute_required:[\s\S]*payload\.local_compute_required === true/);
});

test("all employee transports preserve local-only compute restriction", () => {
  for (const [name, source] of [["final review", finalReview], ["employee", employee], ["warm", warm], ["zero idle", zeroIdle]]) {
    assert.match(source, /local_compute_required = false/, name);
    assert.match(source, /infrastructure_policy/, name);
  }
  assert.match(canonical, /\.\.\.options/);
});

test("live Code AI planner request forces owned local provider and forbids external fallback", () => {
  assert.match(convergence, /local_compute_required = false/);
  assert.match(live, /provider_id: "avantiqo-code"/);
  assert.match(live, /allowed_providers: \["avantiqo-code"\]/);
  assert.match(live, /external_fallback_allowed: false/);
  assert.match(live, /local_compute_required: true/);
  assert.match(live, /infrastructure_policy: "local_only"/);
});

test("Code provider fails closed before Modal branches when local-only is required", () => {
  assert.match(provider, /function localComputeRequired\(input = \{\}\)/);
  const guard = provider.indexOf('throw new Error("AVANTIQO_CODE_LOCAL_RUNTIME_REQUIRED")');
  const modal = provider.indexOf("const direct = directModalConfig()", guard);
  assert.ok(guard >= 0);
  assert.ok(modal > guard);
});
