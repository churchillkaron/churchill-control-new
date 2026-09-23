import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Fast readiness is still derived from owned local compute", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(registration, /runtimeAvailable = Boolean\(\(engineEnabled \|\| localReviewRuntimeAllowed\) && localComputeConfigured\)/);
  assert.match(registration, /local_compute_primary:\s*localComputeConfigured/);
});

test("shared Intelligence readiness probes local queue without paid inference", () => {
  assert.match(queue, /getIntelligenceLocalQueueHealth/);
  assert.match(queue, /avantiqo_local_compute_nodes/);
  assert.match(queue, /last_seen_at/);
  assert.match(queue, /heartbeatAgeSeconds <= 90/);
});

test("Modal is overflow capacity, not readiness repair", () => {
  assert.match(wrapper, /governed_modal_overflow_supported: true/);
  assert.match(wrapper, /governed_modal_overflow_available: overflowConfigured/);
  assert.match(wrapper, /automatic_modal_fallback_allowed: false/);
  assert.match(registration, /modal_overflow_owner_approval_required: true/);
  assert.match(registration, /modal_overflow_local_insufficiency_proof_required: true/);
  assert.doesNotMatch(wrapper, /RunPod|runpod|priority repair/);
});
