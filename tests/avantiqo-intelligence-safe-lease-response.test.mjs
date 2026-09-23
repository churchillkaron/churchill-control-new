import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");

test("owned Intelligence no longer depends on an external Safe Lease response", () => {
  assert.doesNotMatch(provider, /safe_lease|endpoint_id|RunPod|runpod/);
  assert.doesNotMatch(registration, /endpoint_id|RunPod|runpod/);
  assert.match(registration, /safe_lease_required:\s*false/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
});
