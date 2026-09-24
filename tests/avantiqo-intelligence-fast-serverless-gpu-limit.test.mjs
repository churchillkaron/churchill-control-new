import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");

test("Fast and Deep capacity stays on owned local compute only", () => {
  assert.match(registration, /infrastructure_candidates:\s*\[localInfrastructure\]/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod|endpoint_id/);
});
