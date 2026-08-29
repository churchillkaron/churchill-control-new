import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FAST_CHILD = new URL(
  "../scripts/run-avantiqo-intelligence-code-mission-production-fast-assessment-local.mjs",
  import.meta.url,
);
const MODELS_PROBE = new URL(
  "../scripts/run-avantiqo-intelligence-safe-lease-models-probe-local.mjs",
  import.meta.url,
);

test("Fast service certification proves runtime readiness inside the existing Safe Lease before assessment", async () => {
  const source = await readFile(FAST_CHILD, "utf8");
  const leaseValidation = source.indexOf('phase = "SAFE_LEASE_VALIDATION"');
  const readinessPhase = source.indexOf('phase = "FAST_RUNTIME_READINESS_PROBE"');
  const readinessCall = source.indexOf("runFastRuntimeProbe();");
  const serviceAssessment = source.indexOf('phase = "PINNED_LOCAL_REPOSITORY_ASSESSMENT"');

  assert.ok(leaseValidation >= 0, "Safe Lease validation phase must exist");
  assert.ok(readinessPhase > leaseValidation, "runtime readiness must happen after Safe Lease validation");
  assert.ok(readinessCall > readinessPhase, "Fast readiness probe must execute in its readiness phase");
  assert.ok(serviceAssessment > readinessCall, "Service Runtime assessment must not start before readiness passes");
  assert.match(source, /AVANTIQO_INTELLIGENCE_MODELS_PROBE_LANE:\s*"fast"/);
  assert.match(source, /fast_runtime_readiness_probe_passed:\s*true/);
  assert.match(source, /generation_free_runtime_probe:\s*true/);
});

test("shared Intelligence models probe binds Fast to the exact Instruct model without inference", async () => {
  const source = await readFile(MODELS_PROBE, "utf8");

  assert.match(source, /fast:\s*Object\.freeze\(\{/);
  assert.match(source, /leaseLane:\s*"intelligence-fast"/);
  assert.match(source, /expectedModel:\s*"Qwen\/Qwen3-30B-A3B-Instruct-2507"/);
  assert.match(source, /endpointEnv:\s*"RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID"/);
  assert.match(source, /inference_performed:\s*false/);
  assert.match(source, /generation_submitted:\s*false/);
  assert.match(source, /completion_request_performed:\s*false/);
  assert.match(source, /direct_endpoint_scaling_performed:\s*false/);
  assert.match(source, /workers_max_mutation_performed:\s*false/);
});
