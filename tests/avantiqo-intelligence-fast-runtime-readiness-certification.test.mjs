import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Fast readiness is derived only from owned local compute", () => {
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(registration, /runtimeAvailable = Boolean\(engineEnabled && localComputeConfigured\)/);
  assert.match(registration, /local_compute_primary: true/);
});

test("shared Intelligence readiness probes local queue without paid inference", () => {
  assert.match(queue, /getIntelligenceLocalQueueHealth/);
  assert.match(queue, /avantiqo_local_compute_nodes/);
  assert.match(queue, /last_seen_at/);
  assert.match(queue, /heartbeatAgeSeconds <= 90/);
});

test("external overflow is retired and cannot repair readiness", () => {
  assert.match(wrapper, /governed_modal_overflow_supported: false/);
  assert.match(wrapper, /governed_modal_overflow_available: false/);
  assert.match(wrapper, /automatic_modal_fallback_allowed: false/);
  assert.match(registration, /local_only: true/);
  assert.match(registration, /modal_fallback_allowed: false/);
});
