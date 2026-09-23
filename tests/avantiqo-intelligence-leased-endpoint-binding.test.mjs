import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("owned Intelligence is not bound to an external leased endpoint", () => {
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.doesNotMatch(registration, /endpoint_id|RunPod|runpod/);
  assert.match(registration, /safe_lease_required:\s*false/);
  assert.match(queue, /node_id/);
  assert.match(queue, /leased_until/);
});
