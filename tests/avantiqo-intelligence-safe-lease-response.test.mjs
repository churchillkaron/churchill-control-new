import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");

test("owned Intelligence depends only on local owned runtime", () => {
  assert.doesNotMatch(provider, /safe_lease|endpoint_id|RunPod|runpod|Modal/);
  assert.doesNotMatch(registration, /endpoint_id|RunPod|runpod/);
  assert.match(registration, /safe_lease_required:\s*false/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
});
