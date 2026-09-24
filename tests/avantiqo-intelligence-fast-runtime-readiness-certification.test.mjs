import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Fast readiness is derived only from owned local compute", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(registration, /runtimeAvailable = Boolean\(engineEnabled && localComputeConfigured\)/);
  assert.match(registration, /local_compute_primary:\s*true/);
  assert.match(registration, /local_only:\s*true/);
});

test("shared Intelligence readiness probes local queue without paid inference", () => {
  assert.match(queue, /getIntelligenceLocalQueueHealth/);
  assert.match(queue, /avantiqo_local_compute_nodes/);
  assert.match(queue, /last_seen_at/);
  assert.match(queue, /heartbeatAgeSeconds <= 90/);
});

test("external overflow is retired from active readiness", () => {
  assert.match(wrapper, /governed_modal_overflow_supported:\s*false/);
  assert.match(wrapper, /governed_modal_overflow_available:\s*false/);
  assert.match(wrapper, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
});
